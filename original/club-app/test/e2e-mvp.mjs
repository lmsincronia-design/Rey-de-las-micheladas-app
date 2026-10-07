// Recorrido del modo MVP (lo que se muestra en la reunión): códigos de prueba, sin esperas, subir de rango y canjear al tiro.
//   node test/e2e-mvp.mjs        -> servidor propio en memoria, capturas en test/capturas-mvp/
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
// Playwright: primero el instalado en este proyecto (npm install); si no, el de la carpeta de videos de LM Sincronía.
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require(join(raiz, '..', '..', '..', 'video', 'node_modules', 'playwright')));
}
const PUERTO = 20000 + Math.floor(Math.random() * 20000);
const BASE = `http://localhost:${PUERTO}`;
const CAP = join(raiz, 'test', 'capturas-mvp');
rmSync(CAP, { recursive: true, force: true });
mkdirSync(CAP, { recursive: true });
const servidor = spawn('node', ['dev-server.js', '--memoria', '--puerto', String(PUERTO)], { cwd: raiz, env: { ...process.env, MODO_MVP: '1', DEV_RELOJ: '1' } });
await new Promise((ok, mal) => {
  servidor.stdout.on('data', (d) => String(d).includes('Club del Rey en') && ok());
  servidor.stderr.on('data', (d) => process.stderr.write(d));
  setTimeout(() => mal(new Error('el servidor no arrancó')), 15000);
});
const navegador = await chromium.launch();
const errores = [];
async function nuevo(nombre, movil = true) {
  const ctx = await navegador.newContext(movil ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'es-CL', timezoneId: 'America/Santiago', permissions: ['clipboard-read', 'clipboard-write'] } : { viewport: { width: 1280, height: 860 }, locale: 'es-CL' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errores.push(`[${nombre}] ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errores.push(`[${nombre}] ${m.text()}`); });
  return { page, nombre };
}
let n = 0;
const foto = async (p, t) => { await p.page.waitForTimeout(750); return p.page.screenshot({ path: join(CAP, `${String(++n).padStart(2, '0')}-${p.nombre}-${t}.png`), fullPage: true }); };
const sinDesborde = async (p) => { const a = await p.page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]); assert.ok(a[0] <= a[1] + 1, `desborde en ${p.nombre}: ${a}`); };
async function entrar(p, tel, nombre) {
  const page = p.page;
  await page.waitForSelector('#tel');
  await page.fill('#tel', tel);
  await page.click('#enviar');
  await page.waitForSelector('#usar');
  await page.click('#usar');
  await page.waitForSelector('#nombre, .acciones');
  if (await page.$('#nombre')) {
    await page.fill('#nombre', nombre);
    await page.fill('#nac', '1995-03-12');
    await page.check('#acepta');
    await page.click('#crear');
  }
}
async function usarCodigo(p, codigo) {
  await p.page.goto(BASE + '/boleta');
  await p.page.waitForSelector('.codigos-prueba');
  await p.page.click(`.cp[data-cod="${codigo}"]`);
  await p.page.click('#enviar');
  await p.page.waitForSelector('.gran-num');
}
try {
  const diego = await nuevo('diego');
  await diego.page.goto(BASE + '/');
  await diego.page.waitForSelector('text=Unirme al Club');
  await foto(diego, 'landing'); await sinDesborde(diego);
  await diego.page.click('text=Unirme al Club');
  await entrar(diego, '9 3333 0001', 'Diego Soto');
  await diego.page.waitForSelector('.socio');
  await diego.page.waitForSelector('.demo-nota');
  await foto(diego, 'inicio'); await sinDesborde(diego);
  console.log('• registro + inicio con tarjeta de socio y nota de demostración');

  await diego.page.goto(BASE + '/boleta');
  await diego.page.waitForSelector('.codigos-prueba');
  await foto(diego, 'boleta-codigos'); await sinDesborde(diego);
  // escribir un código a mano (minúsculas) también sirve
  await diego.page.fill('#cod', 'mesa5k');
  await diego.page.click('#enviar');
  await diego.page.waitForSelector('.gran-num');
  assert.equal((await diego.page.textContent('.gran-num')).replace(/\s/g, ''), '+$2.400');
  assert.ok(await diego.page.textContent('body').then((t) => t.includes('disponibles')), 'las coronas quedan disponibles al instante');
  await foto(diego, 'mesa5k'); await sinDesborde(diego);
  const enlace = await diego.page.evaluate(() => document.querySelector('a[href^="https://wa.me"]')?.href || '');
  assert.match(decodeURIComponent(enlace), /\/m\//);
  console.log('• MESA5K: +$2.400, disponibles ya, enlace de mesa listo');

  await usarCodigo(diego, 'MESA5K');
  console.log('• el mismo código se puede reutilizar');

  for (const c of ['RANGO1', 'RANGO2', 'RANGO3', 'RANGO4']) {
    await usarCodigo(diego, c);
    if (c === 'RANGO4') { await diego.page.waitForSelector('text=Ascendiste a Rey'); await foto(diego, 'ascenso-rey'); }
  }
  await diego.page.goto(BASE + '/');
  await diego.page.waitForSelector('.socio .rango');
  assert.equal((await diego.page.textContent('.socio .rango')).trim(), 'Rey');
  await foto(diego, 'inicio-rey'); await sinDesborde(diego);
  const recorte = await diego.page.evaluate(() => [...document.querySelectorAll('.saldo .caja b')].map((b) => b.scrollWidth - b.parentElement.clientWidth));
  assert.ok(recorte.every((d) => d <= 0), 'una cifra de coronas se sale de su caja: ' + recorte);
  console.log('• RANGO1..4: llega a Rey');

  await diego.page.goto(BASE + '/canjear');
  await diego.page.waitForSelector('#generar');
  await diego.page.click('#generar');
  await diego.page.waitForSelector('.ficha .cod');
  const cod = (await diego.page.textContent('.ficha .cod')).trim();
  await foto(diego, 'ficha'); await sinDesborde(diego);
  console.log('• canje inmediato, ficha', cod);
  // el garzón confirma el canje en el celular del cliente, con el PIN del local
  await diego.page.click('#confirmar');
  await diego.page.waitForSelector('#cf-pin');
  await diego.page.selectOption('#cf-local', 'REY-X');
  await diego.page.fill('#cf-pin', '9999');
  await diego.page.click('#cf-si');
  await diego.page.waitForSelector('#cf-err .error');
  await foto(diego, 'confirmar-pin-malo');
  await diego.page.fill('#cf-pin', '1234');
  await diego.page.click('#cf-si');
  await diego.page.waitForSelector('text=Se descontaron');
  await foto(diego, 'canjeado');
  console.log('• el garzón confirmó con PIN: PIN malo rechazado, PIN bueno canjea');

  const caja = await nuevo('caja', false);
  await caja.page.goto(BASE + '/caja');
  await caja.page.selectOption('#local', 'REY-X');
  await caja.page.fill('#pin', '1234');
  await caja.page.click('#entrar');
  await caja.page.waitForSelector('#emitir');
  await foto(caja, 'caja');

  const tokens = await diego.page.evaluate(() => fetch('/api/me').then((r) => r.json()).then((m) => m.mesas.map((x) => x.token)));
  assert.ok(tokens.length >= 2);
  const luis = await nuevo('luis');
  await luis.page.goto(BASE + '/m/' + tokens[tokens.length - 1]);
  await luis.page.waitForSelector('#entrar');
  await luis.page.click('#entrar');
  await entrar(luis, '9 4444 0002', 'Luis Pérez');
  await luis.page.waitForSelector('text=Reclamar mi parte');
  await foto(luis, 'mesa-amigo'); await sinDesborde(luis);
  await luis.page.click('text=Reclamar mi parte');
  await luis.page.waitForSelector('.gran-num');
  assert.equal((await luis.page.textContent('.gran-num')).replace(/\s/g, ''), '+$2.400');
  console.log('• amigo plebeyo reclama su parte: +$2.400');

  /* ───────── Una misma cuenta, cinco rangos distintos ───────── */
  const api = (p, ruta, cuerpo) => p.page.evaluate(([r, c]) => fetch(r, { method: c ? 'POST' : 'GET', headers: { 'content-type': 'application/json' }, body: c ? JSON.stringify(c) : undefined }).then(async (x) => ({ status: x.status, data: await x.json() })), [ruta, cuerpo]);
  const subir = async (p, codigos) => { for (const c of codigos) assert.equal((await api(p, '/api/boletas/reclamar', { codigo: c, personas: 1 })).status, 201); };
  const enlaceDe = async (p) => decodeURIComponent(await p.page.getAttribute('a[href^="https://wa.me"]', 'href')).match(/https?:\/\/\S+\/m\/[\w-]+/)[0];
  const ana = await nuevo('ana');
  await ana.page.goto(BASE + '/entrar');
  await entrar(ana, '9 5555 0001', 'Ana Vera');
  await ana.page.waitForSelector('.socio');
  const amigos = [];
  const reparto = [['Bruno Díaz', ['RANGO1', 'RANGO2', 'RANGO3']], ['Carla Núñez', ['RANGO1', 'RANGO2', 'RANGO3', 'RANGO4']], ['Dani Mora', ['RANGO1']], ['Elisa Paz', []]];
  for (const [i, [nombre, sube]] of reparto.entries()) {
    const p = await nuevo(nombre.split(' ')[0].toLowerCase());
    await p.page.goto(BASE + '/entrar');
    await entrar(p, '9 5555 00' + String(i + 2).padStart(2, '0'), nombre);
    await p.page.waitForSelector('.socio');
    await subir(p, sube);
    amigos.push(p);
  }
  // Ana (plebeyo) paga $150.000 entre 5 y comparte el enlace
  await ana.page.goto(BASE + '/boleta');
  await ana.page.waitForSelector('.codigos-prueba');
  await ana.page.click('.cp[data-cod="MESA5K"]');
  await ana.page.click('#enviar');
  await ana.page.waitForSelector('.vaso');
  await foto(ana, 'mesa-ana');
  assert.match(await ana.page.textContent('.vaso'), /Como\s+Plebeyo\s+ganas el\s+8%/);
  const wa = decodeURIComponent(await ana.page.getAttribute('a[href^="https://wa.me"]', 'href'));
  const url = await enlaceDe(ana);
  assert.match(wa, /Ana te invita/);
  await ana.page.click('#copiar');
  assert.equal(await ana.page.evaluate(() => navigator.clipboard.readText()), url, 'copiar enlace deja la URL de la mesa en el portapapeles');
  console.log('• el enlace compartido por WhatsApp y el copiado apuntan a la mesa:', url.replace(BASE, ''));
  // vista previa del enlace (lo que lee WhatsApp)
  const html = await (await fetch(url)).text();
  assert.match(html, /og:title" content="Ana te guardó tu parte en el Club del Rey/);
  assert.match(html, /og:image" content="http:\/\/localhost:\d+\/assets\/og-club\.jpg/);
  console.log('• la vista previa del enlace dice "Ana te guardó tu parte" y trae la imagen del Club');
  // alguien sin sesión abre el enlace
  const anon = await nuevo('anonimo');
  await anon.page.goto(url);
  await anon.page.waitForSelector('#entrar');
  await foto(anon, 'enlace-sin-sesion'); await sinDesborde(anon);
  // cada amigo reclama con SU rango
  const esperado = { bruno: [14, 4200], carla: [16, 4800], dani: [10, 3000], elisa: [8, 2400] };
  for (const p of amigos) {
    await p.page.goto(url);
    await p.page.waitForSelector('#reclamar');
    const [pct, coronas] = esperado[p.nombre];
    assert.match(await p.page.textContent('.card.amarilla'), new RegExp('ganas el ' + pct + '%'));
    await foto(p, 'reclamar-mesa'); await sinDesborde(p);
    await p.page.click('#reclamar');
    await p.page.waitForSelector('.vaso');
    const ganadas = (await p.page.textContent('.gran-num')).replace(/\s/g, '');
    assert.equal(ganadas, '+$' + coronas.toLocaleString('es-CL'));
  }
  await foto(amigos[0], 'bruno-noble-reclamado');
  console.log('• misma cuenta, rangos distintos: Noble 14% → $4.200, Rey 16% → $4.800, Comerciante 10% → $3.000, Plebeyo 8% → $2.400');
  // la mesa quedó completa: un sexto ya no entra, y quien ya reclamó ve su estado
  await anon.page.goto(url);
  await anon.page.click('#entrar');
  await entrar(anon, '9 5555 0099', 'Fabián Rojas');
  await anon.page.waitForSelector('text=ya no tiene lugares');
  await foto(anon, 'mesa-llena');
  await amigos[1].page.goto(url);
  await amigos[1].page.waitForSelector('text=Ya reclamaste tu parte');
  await ana.page.goto(url);
  await ana.page.waitForSelector('text=Esta es tu mesa');
  assert.equal(await ana.page.locator('.jarro.rec').count(), 5);
  await foto(ana, 'mesa-completa');
  console.log('• mesa llena: el sexto la ve completa; Ana ve los 5 jarros reclamados');
  // enlace vencido
  await ana.page.goto(BASE + '/boleta');
  await ana.page.waitForSelector('.codigos-prueba');
  await ana.page.click('.cp[data-cod="PAREJA"]');
  await ana.page.click('#enviar');
  await ana.page.waitForSelector('.vaso');
  const url2 = await enlaceDe(ana);
  await fetch(BASE + '/api/_dev/avanzar?horas=49');
  await anon.page.goto(url2);
  await anon.page.waitForSelector('text=Este enlace venció');
  await foto(anon, 'enlace-vencido');
  console.log('• enlace vencido a las 49 horas: avisa que venció');

  /* ───────── Código personal: la caja lo busca ANTES de emitir la boleta ───────── */
  const gabi = await nuevo('gabi');
  await gabi.page.goto(BASE + '/entrar');
  await entrar(gabi, '9 6666 0001', 'Gabriela Soto');
  await gabi.page.waitForSelector('.socio');
  await foto(gabi, 'inicio-con-codigo'); await sinDesborde(gabi);
  assert.equal((await api(gabi, '/api/boletas/reclamar', { codigo: 'MESA5K', personas: 5 })).status, 201);
  await gabi.page.goto(BASE + '/codigo');
  await gabi.page.waitForSelector('.pase-codigo');
  await foto(gabi, 'mi-codigo'); await sinDesborde(gabi);
  const codigoGabi = (await gabi.page.textContent('.pase-codigo')).trim();
  assert.match(codigoGabi, /^[A-HJKMNP-Z2-9]{3}-[A-HJKMNP-Z2-9]{3}$/);
  assert.equal((await gabi.page.textContent('#saldo-cod')).replace(/\s/g, ''), '$2.400');
  console.log('• Gabriela abre "Mi código":', codigoGabi);

  const caja2 = await nuevo('caja2', false);
  await caja2.page.goto(BASE + '/caja');
  await caja2.page.selectOption('#local', 'REY-X');
  await caja2.page.fill('#pin', '1234');
  await caja2.page.click('#entrar');
  await caja2.page.waitForSelector('#cli');
  await caja2.page.fill('#cli', codigoGabi.toLowerCase());
  await caja2.page.click('#buscarCli');
  await caja2.page.waitForSelector('#cliente .saldo');
  assert.match(await caja2.page.textContent('#cliente'), /Gabriela S\./);
  assert.match((await caja2.page.textContent('#cliente .saldo')).replace(/\s/g, ''), /\$2\.400/);
  await foto(caja2, 'cliente-por-codigo');
  // 1) descuenta en la cuenta; el celular de Gabriela (con "Mi código" abierto) lo muestra solo
  await caja2.page.fill('#dmonto', '1500');
  await caja2.page.click('#aplicarCli');
  await caja2.page.waitForSelector('text=Descuento de $1.500 aplicado');
  await foto(caja2, 'descuento-aplicado');
  await gabi.page.waitForSelector('#aviso-mov .ok-grande', { timeout: 15000 });
  assert.match(await gabi.page.textContent('#aviso-mov'), /Se descontaron \$1\.500/);
  assert.equal((await gabi.page.textContent('#saldo-cod')).replace(/\s/g, ''), '$900');
  await foto(gabi, 'canje-en-su-celular');
  console.log('• la caja descontó $1.500 por código y su celular lo mostró al tiro');
  // 2) emite la boleta con el descuento y la acredita a la mesa (Gabi + Ana, que es otra socia)
  await caja2.page.click('#sumarMesa');
  const codigoAna = (await ana.page.evaluate(() => fetch('/api/me').then((r) => r.json()).then((m) => m.usuario.codigo_socio)));
  await caja2.page.fill('#otro', codigoAna);
  await caja2.page.click('#agregarOtro');
  await caja2.page.waitForSelector('#mesa .chip >> nth=1');
  await caja2.page.fill('#monto', '58500');
  await caja2.page.fill('#comens', '2');
  await caja2.page.click('#emitir');
  await caja2.page.waitForSelector('text=Coronas acreditadas');
  await foto(caja2, 'boleta-acreditada');
  const ticket = await caja2.page.textContent('#ticket');
  assert.match(ticket, /Dcto\. Club del Rey/);
  await gabi.page.waitForSelector('#aviso-mov .vaso', { timeout: 15000 });
  await foto(gabi, 'coronas-acreditadas-en-su-celular');
  console.log('• la boleta se acreditó por código y su celular mostró las coronas ganadas');
  // sin ingresar ningún código de boleta: el saldo de Gabi subió (parte de $29.250 al 8%)
  const yoGabi = (await api(gabi, '/api/me')).data;
  assert.equal(yoGabi.saldo.disponible, 900 + 2340);

  const adm = await nuevo('admin', false);
  await adm.page.goto(BASE + '/admin');
  await adm.page.fill('#clave', 'rey-admin');
  await adm.page.click('#entrar');
  await adm.page.waitForSelector('.metricas');
  await adm.page.click('#tabs button[data-t="codigos"]');
  await adm.page.waitForSelector('tr[data-cod="RANGO1"]');
  await adm.page.fill('#n-cod', 'cumple');
  await adm.page.fill('#n-monto', '400000');
  await adm.page.fill('#n-pers', '8');
  await adm.page.fill('#n-nota', 'Cumpleaños de 8');
  await adm.page.click('#n-ok');
  await adm.page.waitForSelector('tr[data-cod="CUMPLE"]');
  await foto(adm, 'codigos');
  await adm.page.click('#tabs button[data-t="config"]');
  await adm.page.waitForSelector('#guardar');
  await foto(adm, 'config');
  console.log('• admin: agrega CUMPLE y lo ve en la lista');
  await usarCodigo(diego, 'CUMPLE');
  console.log('• CUMPLE recién creado funciona en la app');

  /* ───────── Restaurar la demostración desde el panel ───────── */
  await adm.page.click('#tabs button[data-t="socios"]');
  await adm.page.waitForSelector('#lista tr[data-id]');
  assert.match(await adm.page.textContent('#lista'), new RegExp(codigoGabi));
  await foto(adm, 'socios-con-codigo');
  await adm.page.click('#restaurar');
  await adm.page.waitForSelector('#rest-conf');
  assert.equal(await adm.page.isDisabled('#rest-si'), true, 'el botón espera la confirmación escrita');
  await adm.page.fill('#rest-conf', 'RESTAURAR');
  await foto(adm, 'restaurar-confirmar');
  await adm.page.click('#rest-si');
  await adm.page.waitForSelector('text=Demostración restaurada');
  const estadoFinal = await api(adm, '/api/admin/resumen');
  assert.equal(estadoFinal.data.socios, 0);
  // la persona que tenía la app abierta vuelve a la portada y puede registrarse de nuevo, desde cero
  await gabi.page.goto(BASE + '/');
  await gabi.page.waitForSelector('text=Unirme al Club');
  await gabi.page.click('text=Unirme al Club');
  await entrar(gabi, '9 6666 0001', 'Gabriela Soto');
  await gabi.page.waitForSelector('.socio');
  assert.match(await gabi.page.textContent('.socio'), /Plebeyo/i);
  assert.equal(((await api(gabi, '/api/me')).data.saldo.disponible), 0);
  await foto(gabi, 'otra-vez-desde-cero');
  console.log('• restaurar demo: todo vuelve al primer día y Gabriela se registra de nuevo con el mismo teléfono');

  assert.deepEqual(errores, [], 'errores de consola/página: ' + errores.join(' | '));
  console.log('\nOK: modo MVP completo. Capturas en test/capturas-mvp/');
} finally {
  await navegador.close();
  servidor.kill();
}
