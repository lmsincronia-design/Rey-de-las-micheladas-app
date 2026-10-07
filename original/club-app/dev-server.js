// Servidor local para probar la app completa: node dev-server.js [--memoria] [--puerto 8787]
import http from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearApp } from './src/app.js';
import { crearDbNode, migrar } from './src/db-node.js';
import { sembrarDemo } from './src/seed.js';
import { metaMesa, aplicarOG, TOKEN_EN_RUTA } from './src/lib/og.js';

const raiz = dirname(fileURLToPath(import.meta.url));
const publico = join(raiz, 'public');
const args = process.argv.slice(2);
const enMemoria = args.includes('--memoria');
const puerto = Number(args[args.indexOf('--puerto') + 1]) || Number(process.env.PORT) || 8787;

const env = {
  MODO_DEMO: process.env.MODO_DEMO ?? '1',
  MODO_MVP: process.env.MODO_MVP ?? '1',
  SECRET: process.env.SECRET || 'secreto-de-desarrollo-cambiar',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'rey-admin',
};

let ruta = ':memory:';
if (!enMemoria) {
  await mkdir(join(raiz, 'data'), { recursive: true });
  ruta = join(raiz, 'data', 'dev.sqlite');
}
const db = crearDbNode(ruta);
await migrar(db);
const sembrado = await sembrarDemo(db, env.SECRET);
// Solo para pruebas locales: DEV_RELOJ=1 permite adelantar la hora con /api/_dev/avanzar?horas=25 (no existe en el Worker).
let desplazamiento = 0;
const app = crearApp({ db, env, reloj: () => Date.now() + desplazamiento });

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};
const CABECERAS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'same-origin',
  'x-frame-options': 'DENY',
  'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
};

async function leerCuerpo(req) {
  const partes = [];
  for await (const p of req) partes.push(p);
  return Buffer.concat(partes);
}

const servidor = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (process.env.DEV_RELOJ === '1' && url.pathname === '/api/_dev/avanzar') {
      desplazamiento += Number(url.searchParams.get('horas') || 0) * 3_600_000;
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: true, ahora: Date.now() + desplazamiento }));
      return;
    }
    if (url.pathname.startsWith('/api/')) {
      const cuerpo = ['GET', 'HEAD'].includes(req.method) ? undefined : await leerCuerpo(req);
      const cab = new Headers();
      for (const [k, v] of Object.entries(req.headers)) if (v !== undefined) cab.set(k, Array.isArray(v) ? v.join(', ') : v);
      cab.set('x-forwarded-for', req.socket.remoteAddress || 'local');
      const resp = await app.fetch(new Request(url, { method: req.method, headers: cab, body: cuerpo }));
      const salida = {};
      resp.headers.forEach((v, k) => { if (k !== 'set-cookie') salida[k] = v; });
      const cookies = resp.headers.getSetCookie?.() ?? [];
      if (cookies.length) salida['set-cookie'] = cookies;
      res.writeHead(resp.status, salida);
      res.end(Buffer.from(await resp.arrayBuffer()));
      return;
    }
    let archivo = normalize(join(publico, decodeURIComponent(url.pathname)));
    if (!archivo.startsWith(publico)) {
      res.writeHead(403).end('Prohibido');
      return;
    }
    if (!existsSync(archivo) || extname(archivo) === '') archivo = join(publico, 'index.html'); // la app maneja las rutas
    let datos = await readFile(archivo);
    if (extname(archivo) === '.html') {
      let meta = null;
      const tok = TOKEN_EN_RUTA.exec(url.pathname);
      if (tok) {
        try { meta = await metaMesa(db, decodeURIComponent(tok[1]), Date.now() + desplazamiento); } catch { /* sin vista previa personalizada */ }
      }
      datos = Buffer.from(aplicarOG(datos.toString('utf8'), `http://${req.headers.host || 'localhost'}`, meta));
    }
    res.writeHead(200, { ...CABECERAS, 'content-type': MIME[extname(archivo)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(datos);
  } catch (e) {
    console.error(e);
    res.writeHead(500).end('Error');
  }
});

servidor.listen(puerto, () => {
  console.log(`Club del Rey en http://localhost:${puerto}  (${enMemoria ? 'base en memoria' : 'base: data/dev.sqlite'})`);
  console.log(`  Caja:   http://localhost:${puerto}/caja   (local REY-X, PIN ${sembrado?.pin ?? '1234'})`);
  console.log(`  Admin:  http://localhost:${puerto}/admin  (clave ${env.ADMIN_PASSWORD})`);
  if (sembrado) console.log('  Llaves de API de demostración: rey_demo_<codigo-del-local-en-minusculas>');
});
