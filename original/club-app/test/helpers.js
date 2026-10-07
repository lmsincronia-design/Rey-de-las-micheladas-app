// Ayudantes para las pruebas: app con base en memoria, reloj controlable y clientes con cookies.
import { crearApp } from '../src/app.js';
import { crearDbNode, migrar } from '../src/db-node.js';
import { sembrarDemo } from '../src/seed.js';

export const MIN = 60_000;
export const HORA = 3_600_000;
export const DIA = 86_400_000;

export async function montar({ demo = true, env = {} } = {}) {
  const db = crearDbNode(':memory:');
  await migrar(db);
  const reloj = {
    t: Date.parse('2026-10-09T01:00:00Z'), // jueves 8-oct 21:00 en Chile
    avanzar(ms) { this.t += ms; },
  };
  const entorno = { MODO_DEMO: demo ? '1' : '0', SECRET: 'secreto-de-prueba', ADMIN_PASSWORD: 'clave-admin', ...env };
  const app = crearApp({ db, env: entorno, reloj: () => reloj.t });
  const sembrado = await sembrarDemo(db, entorno.SECRET, reloj.t);
  return { db, app, reloj, env: entorno, llaves: sembrado.llaves, pin: sembrado.pin };
}

/** Cliente HTTP con cookie jar propio (un "navegador"). */
export function navegador(app, { ip = '10.0.0.1', origin } = {}) {
  const jar = new Map();
  async function pedir(metodo, ruta, cuerpo, { headers = {}, json = true } = {}) {
    const h = new Headers(headers);
    if (jar.size) h.set('cookie', [...jar].map(([k, v]) => `${k}=${v}`).join('; '));
    h.set('x-forwarded-for', ip);
    if (origin) h.set('origin', origin);
    let body;
    if (cuerpo !== undefined) {
      if (json) h.set('content-type', 'application/json');
      body = json ? JSON.stringify(cuerpo) : cuerpo;
    }
    const resp = await app.fetch(new Request('http://club.test' + ruta, { method: metodo, headers: h, body }));
    for (const c of resp.headers.getSetCookie?.() ?? []) {
      const [par] = c.split(';');
      const i = par.indexOf('=');
      const nombre = par.slice(0, i);
      const valor = par.slice(i + 1);
      if (/Max-Age=0/i.test(c) || valor === '') jar.delete(nombre);
      else jar.set(nombre, valor);
    }
    let data = null;
    const texto = await resp.text();
    try { data = texto ? JSON.parse(texto) : null; } catch { data = texto; }
    return { status: resp.status, data, headers: resp.headers };
  }
  return {
    jar,
    get: (r, o) => pedir('GET', r, undefined, o),
    post: (r, c = {}, o) => pedir('POST', r, c, o),
    pedir,
  };
}

export const llave = (ctx, codigoLocal) => ctx.llaves[codigoLocal];

let contadorTel = 10_000_000;
export const telefonoNuevo = () => `9${String(++contadorTel).padStart(8, '0')}`;

/** Registra un socio completo (OTP + registro). Devuelve { nav, tel, nombre }. */
export async function registrarSocio(ctx, { nombre = 'Camila Rojas', nacimiento = '1995-03-12', tel = telefonoNuevo(), ip } = {}) {
  const nav = navegador(ctx.app, { ip: ip || `10.1.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` });
  const a = await nav.post('/api/auth/codigo', { telefono: tel });
  if (a.status !== 200) throw new Error('codigo: ' + JSON.stringify(a.data));
  const b = await nav.post('/api/auth/verificar', { telefono: tel, codigo: a.data.codigo_demo });
  if (b.status !== 200) throw new Error('verificar: ' + JSON.stringify(b.data));
  if (b.data.nuevo) {
    const c = await nav.post('/api/auth/registro', { registro_token: b.data.registro_token, nombre, nacimiento, acepta: true });
    if (c.status !== 201) throw new Error('registro: ' + JSON.stringify(c.data));
  }
  return { nav, tel, nombre };
}

export async function emitirBoleta(ctx, local, datos) {
  const nav = navegador(ctx.app, { ip: '10.9.9.9' });
  return nav.pedir('POST', '/api/caja/boletas', datos, { headers: { authorization: `Bearer ${ctx.llaves[local]}` } });
}

let folioN = 1000;
/** Emite una boleta y devuelve su código. */
export async function boletaNueva(ctx, { local = 'REY-X', monto = 30000, comensales, extra = {} } = {}) {
  const r = await emitirBoleta(ctx, local, { folio: `F${++folioN}`, monto, comensales, ...extra });
  if (r.status !== 201) throw new Error('boleta: ' + JSON.stringify(r.data));
  return r.data.boleta.codigo;
}

export async function staff(ctx, local = 'REY-X') {
  const nav = navegador(ctx.app, { ip: '10.8.8.8' });
  const r = await nav.post('/api/caja/login', { local, pin: ctx.pin });
  if (r.status !== 200) throw new Error('login caja: ' + JSON.stringify(r.data));
  return nav;
}

export async function admin(ctx) {
  const nav = navegador(ctx.app, { ip: '10.7.7.7' });
  const r = await nav.post('/api/admin/login', { password: ctx.env.ADMIN_PASSWORD });
  if (r.status !== 200) throw new Error('login admin: ' + JSON.stringify(r.data));
  return nav;
}

/** Vuelve a iniciar sesión con el mismo teléfono (cuando la sesión anterior ya expiró). */
export async function reingresar(ctx, socio) {
  const nav = navegador(ctx.app, { ip: `10.4.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` });
  const a = await nav.post('/api/auth/codigo', { telefono: socio.tel });
  const b = await nav.post('/api/auth/verificar', { telefono: socio.tel, codigo: a.data.codigo_demo });
  if (b.status !== 200 || b.data.nuevo) throw new Error('reingreso: ' + JSON.stringify(b.data));
  socio.nav = nav;
  return socio;
}
