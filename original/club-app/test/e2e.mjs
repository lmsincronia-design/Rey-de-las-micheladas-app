// Prueba de punta a punta en un navegador real (Playwright): socio, amigo, caja y administración.
//   node test/e2e.mjs            -> arranca su propio servidor en memoria y deja capturas en test/capturas/
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
const PUERTO = Number(process.env.E2E_PUERTO) || 20000 + Math.floor(Math.random() * 20000);
const BASE = process.env.E2E_BASE || `http://localhost:${PUERTO}`;
const CAP = join(raiz, 'test', 'capturas');
rmSync(CAP, { recursive: true, force: true });
mkdirSync(CAP, { recursive: true });

let servidor = null;
if (!process.env.E2E_BASE) {
  servidor = spawn('node', ['dev-server.js', '--memoria', '--puerto', String(PUERTO)], { cwd: raiz, env: { ...process.env, DEV_RELOJ: '1', MODO_MVP: '0' } });
  await new Promise((ok, mal) => {
    servidor.stdout.on('data', (d) => String(d).includes('Club del Rey en') && ok());
    servidor.stderr.on('data', (d) => process.stderr.write(d));
    setTimeout(() => mal(new Error('el servidor no arrancó')), 15000);
  });
}
const avanzar = (horas) => fetch(`${BASE}/api/_dev/avanzar?horas=${horas}`).then((r) => r.json());

const navegador = await chromium.launch();
const errores = [];
async function nuevoCtx(nombre, { movil = true } = {}) {
  const ctx = await navegador.newContext(movil ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'es-CL', timezoneId: 'America/Santiago' } : { viewport: { width: 1280, height: 860 }, locale: 'es-CL', timezoneId: 'America/Santiago' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errores.push(`[${nombre}] pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errores.push(`[${nombre}] console: ${m.text()}`);
  });
  return { ctx, page, nombre };
}
let n = 0;
const foto = async (p, nombre) => { await p.page.screenshot({ path: join(CAP, `${String(++n).padStart(2, '0')}-${p.nombre}-${nombre}.png`), fullPage: true }); };
async function sinDesborde(p) {
  const ancho = await p.page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
  assert.ok(ancho[0] <= ancho[1] + 1, `desborde horizontal en ${p.nombre}: ${ancho}`);
}
const paso = (t) => console.log('•', t);

/** Entra (o se registra) con el flujo real de pantallas. */
async function entrar(p, { tel, nombre, nac = '1995-03-12' }) {
  const page = p.page;
  await page.waitForSelector('#tel');
  await page.fill('#tel', tel);
  await page.click('#enviar');
  await page.waitForSelector('#usar');
  await foto(p, 'codigo');
  await page.click('#usar');
  await page.waitForSelector('#nombre, .acciones');
  if (await page.$('#nombre')) {
    await page.fill('#nombre', nombre);
    await page.fill('#nac', nac);
    await foto(p, 'registro');
    await page.check('#acepta');
    await page.click('#crear');
  }
}

try {
  /* ───────── 0. El administrador relaja el regalo de cumpleaños para poder probarlo hoy ───────── */
  const admin = await nuevoCtx('admin', { movil: false });
  await admin.page.goto(BASE + '/admin');
  await admin.page.fill('#clave', 'rey-admin');
  await admin.page.click('#entrar');
  await admin.page.waitForSelector('.metricas');
  const cfgActual = await admin.page.evaluate(() => fetch('/api/admin/config').then((r) => r.json()));
  const nuevaCfg = { ...cfgActual.config, regalo: { ...cfgActual.config.regalo, dias_registro_minimos: 0, boletas_minimas: 1 } };
  const guardada = await admin.page.evaluate((c) => fetch('/api/admin/config', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ config: c }) }).then((r) => r.status), nuevaCfg);
  assert.equal(guardada, 200);
  const hoyChile = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());
  const cumpleHoy = '1995-' + hoyChile.slice(5);

  /* ───────── 1. Camila se une ───────── */
  const camila = await nuevoCtx('camila');
  await camila.page.goto(BASE + '/');
  await camila.page.waitForSelector('text=Unirme al Club');
  await foto(camila, 'landing');
  await sinDesborde(camila);
  await camila.page.click('text=Unirme al Club');
  await entrar(camila, { tel: '9 1111 0001', nombre: 'Camila Rojas', nac: cumpleHoy });
  await camila.page.waitForSelector('text=Hola, Camila');
  await foto(camila, 'inicio-nuevo');
  await sinDesborde(camila);
  paso('Camila se registró con código verificado y llegó al inicio');

  // sin sesión de otro: pantalla de registro de boleta pide código
  /* ───────── 2. La caja emite una boleta ───────── */
  const caja = await nuevoCtx('caja', { movil: false });
  await caja.page.goto(BASE + '/caja');
  await caja.page.waitForSelector('#pin');
  await caja.page.selectOption('#local', 'REY-X');
  await caja.page.fill('#pin', '0000');
  await caja.page.click('#entrar');
  await caja.page.waitForSelector('.error');
  paso('PIN incorrecto muestra error');
  await caja.page.fill('#pin', '1234');
  await caja.page.click('#entrar');
  await caja.page.waitForSelector('#emitir');
  await caja.page.fill('#monto', '150000');
  await caja.page.click('#emitir');
  await caja.page.waitForSelector('.ticket .club b');
  const codigoBoleta = (await caja.page.textContent('.ticket .club b')).trim();
  assert.match(codigoBoleta, /^[A-HJKMNP-Z2-9]{3}-[A-HJKMNP-Z2-9]{3}$/);
  await foto(caja, 'boleta-emitida');
  paso(`La caja emitió una boleta de $150.000 con código ${codigoBoleta}`);

  /* ───────── 3. Camila reclama la boleta ───────── */
  await camila.page.goto(BASE + '/boleta');
  await camila.page.waitForSelector('#cod');
  // código mal escrito
  await camila.page.fill('#cod', 'ZZZ-ZZZ');
  await camila.page.click('#enviar');
  await camila.page.waitForSelector('.error:has-text("No encontramos esa boleta")');
  await foto(camila, 'boleta-error');
  // personas fuera de rango (1 persona en $150.000 no se permite)
  await camila.page.fill('#cod', codigoBoleta.toLowerCase());
  await camila.page.click('#menos');
  await camila.page.click('#enviar');
  await camila.page.waitForSelector('.error:has-text("entre 3 y 20 personas")');
  assert.equal((await camila.page.textContent('#n')).trim(), '3', 'el selector se corrige al mínimo permitido');
  paso('Errores de código y de cantidad de personas se explican bien');
  // 5 personas + una amiga asignada por teléfono
  await camila.page.click('#mas');
  await camila.page.click('#mas');
  await camila.page.check('#chk-amigos');
  await camila.page.fill('.am-nombre', 'Fran');
  await camila.page.fill('.am-tel', '9 2222 0002');
  await foto(camila, 'boleta-formulario');
  await camila.page.click('#enviar');
  await camila.page.waitForSelector('.gran-num');
  assert.equal((await camila.page.textContent('.gran-num')).replace(/\s/g, ''), '+$2.400');
  await foto(camila, 'boleta-resultado');
  const href = await camila.page.getAttribute('a.btn.verde', 'href');
  const urlMesa = decodeURIComponent(href.split('text=')[1]).match(/https?:\/\/\S+/)[0];
  assert.match(urlMesa, /\/m\/[A-Za-z0-9_-]+$/);
  assert.ok(await camila.page.$('.qrbox svg'), 'se muestra el QR de la mesa');
  paso(`Camila sumó +$2.400 coronas; enlace de mesa: ${urlMesa}`);
  const rutaMesa = new URL(urlMesa).pathname;

  /* ───────── 4. Diego (sin cuenta) abre el enlace y reclama su parte ───────── */
  const diego = await nuevoCtx('diego');
  await diego.page.goto(BASE + rutaMesa);
  await diego.page.waitForSelector('text=Mesa de Camila');
  assert.ok((await diego.page.textContent('body')).includes('Entra al Club para reclamar tu parte'));
  await foto(diego, 'mesa-anonimo');
  await sinDesborde(diego);
  await diego.page.click('#entrar');
  await entrar(diego, { tel: '9 3333 0003', nombre: 'Diego Soto' });
  await diego.page.waitForSelector('#reclamar');
  assert.ok(page_url(diego.page).endsWith(rutaMesa), 'tras registrarse vuelve a la mesa');
  await foto(diego, 'mesa-logueado');
  await diego.page.click('#reclamar');
  await diego.page.waitForSelector('.gran-num');
  assert.equal((await diego.page.textContent('.gran-num')).replace(/\s/g, ''), '+$2.400');
  await foto(diego, 'parte-reclamada');
  paso('Diego se registró desde el enlace y reclamó su parte');

  /* ───────── 4b. Camila vuelve a reclamar otra boleta y asciende a Comerciante ───────── */
  await caja.page.fill('#monto', '150000');
  await caja.page.click('#emitir');
  await caja.page.waitForFunction((anterior) => document.querySelector('.ticket .club b')?.textContent.trim() !== anterior, codigoBoleta);
  const codigoBoleta2 = (await caja.page.textContent('.ticket .club b')).trim();
  await camila.page.goto(BASE + '/boleta');
  await camila.page.fill('#cod', codigoBoleta2);
  for (let i = 0; i < 3; i++) await camila.page.click('#mas');
  await camila.page.click('#enviar');
  await camila.page.waitForSelector('text=Ascendiste a Comerciante');
  await foto(camila, 'ascenso');
  paso('Camila subió de rango: Plebeyo → Comerciante');

  /* ───────── 5. Fran (amiga asignada) ve su parte sin abrir el enlace ───────── */
  const fran = await nuevoCtx('fran');
  await fran.page.goto(BASE + '/entrar');
  await entrar(fran, { tel: '9 2222 0002', nombre: 'Francisca Mena' });
  await fran.page.waitForSelector('text=te guardó tu parte');
  await foto(fran, 'inicio-con-pendiente');
  paso('Fran vio su parte guardada en el inicio');

  // la tabla de la caja muestra la boleta reclamada por 2 socios (Camila y Diego)
  await caja.page.click('#refrescar');
  await caja.page.waitForSelector('#tabla :text("reclamada · 2 socios")');
  await foto(caja, 'tabla-reclamada');

  /* ───────── 6. Al día siguiente: Camila canjea ───────── */
  await camila.page.goto(BASE + '/');
  await camila.page.waitForSelector('text=Por activar');
  await foto(camila, 'inicio-por-activar');
  await camila.page.goto(BASE + '/canjear');
  await camila.page.waitForSelector('.aviso');
  assert.match(await camila.page.textContent('.aviso'), /se activan/);
  await foto(camila, 'canjear-antes');
  paso('Antes de las 24 horas Camila no puede canjear (el mensaje lo explica)');
  await avanzar(25);
  await camila.page.goto(BASE + '/canjear');
  await camila.page.waitForSelector('#generar');
  await foto(camila, 'canjear-opciones');
  await camila.page.click('#chips .chip:nth-child(1)'); // $1.000
  await camila.page.click('#generar');
  await camila.page.waitForSelector('.ficha .cod');
  const codFicha = (await camila.page.textContent('.ficha .cod')).replace(/\s|-/g, '');
  assert.match(codFicha, /^[A-HJKMNP-Z2-9]{6}$/);
  await foto(camila, 'ficha');
  await sinDesborde(camila);
  paso(`Camila generó la ficha ${codFicha}`);

  /* ───────── 7. La caja aplica la ficha ───────── */
  await caja.page.goto(BASE + '/caja');
  await caja.page.waitForSelector('#cod, #pin');
  if (await caja.page.$('#pin')) { // la sesión de la caja dura 12 horas: tras adelantar el reloj hay que entrar de nuevo
    await caja.page.fill('#pin', '1234');
    await caja.page.click('#entrar');
    await caja.page.waitForSelector('#cod');
  }
  await caja.page.fill('#cod', codFicha);
  await caja.page.click('#buscar');
  await caja.page.waitForSelector('#aplicar');
  assert.ok((await caja.page.textContent('#ficha')).includes('Camila'));
  await foto(caja, 'ficha-validada');
  await caja.page.click('#aplicar');
  await caja.page.waitForSelector('text=Descuento de $1.000 aplicado');
  await foto(caja, 'ficha-aplicada');
  // Camila ve el resultado sin recargar (la pantalla consulta cada 4 s)
  await camila.page.waitForSelector('text=Se descontaron $1.000', { timeout: 15000 });
  await foto(camila, 'canjeado');
  paso('La caja aplicó la ficha y la pantalla de Camila mostró "Canjeado"');


  /* ───────── 7b. Regalo de cumpleaños ───────── */
  await camila.page.goto(BASE + '/canjear');
  await camila.page.waitForSelector('#regalo');
  await foto(camila, 'regalo-disponible');
  await camila.page.click('#regalo');
  await camila.page.waitForSelector('.ficha .cod');
  assert.ok((await camila.page.textContent('.ficha')).includes('Lleva tu cédula'));
  const codRegalo = (await camila.page.textContent('.ficha .cod')).replace(/s|-/g, '');
  await foto(camila, 'regalo-ficha');
  await caja.page.reload();
  await caja.page.waitForSelector('#cod, #pin');
  if (await caja.page.$('#pin')) { await caja.page.fill('#pin', '1234'); await caja.page.click('#entrar'); await caja.page.waitForSelector('#cod'); }
  await caja.page.fill('#cod', codRegalo);
  await caja.page.click('#buscar');
  await caja.page.waitForSelector('#aplicar');
  assert.ok((await caja.page.textContent('#ficha')).includes('Pide la cédula'));
  await foto(caja, 'regalo-validado');
  await caja.page.click('#aplicar');
  await caja.page.waitForSelector('text=Regalo entregado');
  await camila.page.waitForSelector('text=Disfruta tu regalo', { timeout: 15000 });
  paso('El regalo de cumpleaños se pidió, la caja pidió la cédula y se entregó');

  /* ───────── 8. Rangos, historial y perfil ───────── */
  for (const [ruta, texto, nombre] of [['/rangos', 'Rangos del Club', 'rangos'], ['/historial', 'Mis movimientos', 'historial'], ['/perfil', 'Mi perfil', 'perfil'], ['/terminos', 'Términos del Club', 'terminos']]) {
    await camila.page.goto(BASE + ruta);
    await camila.page.waitForSelector(`text=${texto}`);
    await foto(camila, nombre);
    await sinDesborde(camila);
  }
  paso('Rangos, historial, perfil y términos cargan sin desbordes');
  await camila.page.goto(BASE + '/perfil');
  await camila.page.waitForSelector('#compartir-rango');
  const [descarga] = await Promise.all([camila.page.waitForEvent('download'), camila.page.click('#compartir-rango')]);
  const rutaImg = join(CAP, 'mi-rango.png');
  await descarga.saveAs(rutaImg);
  const { readFileSync } = await import('node:fs');
  const png = readFileSync(rutaImg);
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  assert.ok(png.length > 20000, 'la imagen para compartir tiene contenido');
  paso('La imagen del rango se genera (' + Math.round(png.length / 1024) + ' KB)');
  // Fran elimina su cuenta
  await fran.page.goto(BASE + '/perfil');
  await fran.page.click('#eliminar');
  await fran.page.fill('#conf', 'ELIMINAR');
  await fran.page.click('#si');
  await fran.page.waitForSelector('text=Unirme al Club');
  paso('Fran eliminó su cuenta y volvió a la portada');

  /* ───────── 9. Administración ───────── */
  await admin.page.goto(BASE + '/admin');
  await admin.page.waitForSelector('.metricas, #clave');
  if (await admin.page.$('#clave')) { // la sesión del panel dura 8 horas: tras adelantar el reloj hay que entrar de nuevo
    await admin.page.fill('#clave', 'rey-admin');
    await admin.page.click('#entrar');
    await admin.page.waitForSelector('.metricas');
  }
  assert.ok((await admin.page.textContent('.metricas')).includes('Socios'));
  await foto(admin, 'resumen');
  for (const [pest, espera] of [['Socios', 'Camila Rojas'], ['Boletas', 'Reclamada por'], ['Alertas', 'Alertas abiertas'], ['Locales', 'REY-X'], ['Configuración', 'Rangos'], ['Importar ventas', 'Importar ventas desde Excel'], ['Cartel QR', 'Únete al Club del Rey'], ['Auditoría', 'aplicar_ficha']]) {
    await admin.page.click(`#tabs button:has-text("${pest}")`);
    await admin.page.waitForSelector(`#vista >> text=${espera}`, { timeout: 8000 });
    await foto(admin, pest.toLowerCase().replace(/\W+/g, '-'));
  }
  // detalle de un socio y ajuste manual
  await admin.page.click('#tabs button:has-text("Socios")');
  await admin.page.click('tr[data-id] >> nth=0');
  await admin.page.waitForSelector('.modal #aj');
  await foto(admin, 'detalle-socio');
  paso('El panel de administración cargó todas sus pestañas');

  assert.equal(errores.length, 0, 'errores de JavaScript:\n' + errores.join('\n'));
  console.log(`\nE2E OK · ${n} capturas en ${CAP}`);
} catch (e) {
  console.error('\nE2E FALLÓ:', e.message);
  if (errores.length) console.error(errores.join('\n'));
  process.exitCode = 1;
} finally {
  await navegador.close();
  servidor?.kill();
}

function page_url(page) {
  return new URL(page.url()).pathname;
}
