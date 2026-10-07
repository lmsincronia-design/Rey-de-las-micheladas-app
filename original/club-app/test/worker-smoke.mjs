// Prueba de humo contra el Worker REAL de Cloudflare (wrangler dev --local con D1).
//   1) npx wrangler d1 migrations apply club-del-rey --local
//   2) npx wrangler dev --local --port 8801      (con .dev.vars: SECRET y ADMIN_PASSWORD=admin-wrangler)
//   3) node test/worker-smoke.mjs
// No puede adelantar el reloj, así que pone las horas de activación en 0 desde el panel de administración.
import assert from 'node:assert/strict';

const BASE = process.env.BASE || 'http://127.0.0.1:8801';
const ADMIN = process.env.ADMIN_PASSWORD || 'admin-wrangler';

class Cliente {
  constructor(ip) { this.cookies = new Map(); this.ip = ip; }
  async pedir(metodo, ruta, cuerpo, headers = {}) {
    const h = { 'x-forwarded-for': this.ip, 'cf-connecting-ip': this.ip, ...headers };
    if (this.cookies.size) h.cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    if (cuerpo !== undefined) h['content-type'] = 'application/json';
    const r = await fetch(BASE + ruta, { method: metodo, headers: h, body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined });
    for (const c of r.headers.getSetCookie?.() ?? []) {
      const [par] = c.split(';');
      const i = par.indexOf('=');
      if (/Max-Age=0/i.test(c) || par.slice(i + 1) === '') this.cookies.delete(par.slice(0, i)); else this.cookies.set(par.slice(0, i), par.slice(i + 1));
    }
    const t = await r.text();
    let data = null;
    try { data = t ? JSON.parse(t) : null; } catch { data = t; }
    return { status: r.status, data };
  }
  get(r) { return this.pedir('GET', r); }
  post(r, c = {}, h) { return this.pedir('POST', r, c, h); }
}

let tel = 5_000_000 + Math.floor(Math.random() * 1_000_000);
async function socio(nombre) {
  const c = new Cliente(`10.50.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`);
  const t = `9${String(++tel).padStart(8, '0')}`;
  const a = await c.post('/api/auth/codigo', { telefono: t });
  assert.equal(a.status, 200, JSON.stringify(a.data));
  const b = await c.post('/api/auth/verificar', { telefono: t, codigo: a.data.codigo_demo });
  const r = await c.post('/api/auth/registro', { registro_token: b.data.registro_token, nombre: nombre, nacimiento: '1994-06-15', acepta: true });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return { c, tel: t };
}
const ok = (t) => console.log('✔', t);

// 1) Administración: crea locales y baja la activación a 0 horas
const admin = new Cliente('10.60.0.1');
const lg = await admin.post('/api/admin/login', { password: ADMIN });
assert.equal(lg.status, 200, JSON.stringify(lg.data));
const ej = await admin.post('/api/admin/locales/ejemplo', {});
let local = ej.data.creados.find((l) => l.codigo === 'REY-X');
if (!local) { // ya existían de una corrida anterior: crea uno nuevo
  const n = await admin.post('/api/admin/locales', { codigo: 'REY-S' + Date.now().toString(36).toUpperCase().slice(-4), nombre: 'Local de humo' });
  local = n.data.local;
}
const cfg = (await admin.get('/api/admin/config')).data.config;
const guardado = await admin.post('/api/admin/config', { config: { ...cfg, horas_activacion: 0, reclamos_boleta_por_dia: 50, reclamos_boleta_por_semana: 200, partes_por_dia: 50, canjes_por_dia: 10 } });
assert.equal(guardado.status, 200);
ok(`admin crea local ${local.codigo} y ajusta la configuración (D1 + Worker)`);

const cajaAPI = (folio, monto, extra = {}) => new Cliente('10.70.0.1').post('/api/caja/boletas', { folio, monto, ...extra }, { authorization: `Bearer ${local.api_key}` });
const ejec = Date.now().toString(36);

// 2) Registro verificado + boleta + mesa
const camila = await socio('Camila Rojas');
const b1 = await cajaAPI(`H${ejec}-1`, 150000);
assert.equal(b1.status, 201, JSON.stringify(b1.data));
const r1 = await camila.c.post('/api/boletas/reclamar', { codigo: b1.data.boleta.codigo, personas: 5 });
assert.equal(r1.status, 201, JSON.stringify(r1.data));
assert.equal(r1.data.coronas_ganadas, 2400);
ok('registro con código, boleta por API y reclamo (+$2.400)');

// 3) Carrera por la misma boleta con 6 personas distintas
const b2 = await cajaAPI(`H${ejec}-2`, 60000);
const rivales = await Promise.all(Array.from({ length: 6 }, (_, i) => socio('Rival ' + String.fromCharCode(65 + i))));
const carrera = await Promise.all(rivales.map((s) => s.c.post('/api/boletas/reclamar', { codigo: b2.data.boleta.codigo, personas: 4 })));
assert.equal(carrera.filter((r) => r.status === 201).length, 1, JSON.stringify(carrera.map((r) => r.status)));
assert.equal(carrera.filter((r) => r.status === 409).length, 5);
ok('6 personas reclamando la misma boleta a la vez: gana solo una');

// 4) Carrera por los lugares de una mesa (3 lugares, 6 personas)
const b3 = await cajaAPI(`H${ejec}-3`, 120000);
const dueno = await socio('Dueña Mesa');
const m3 = await dueno.c.post('/api/boletas/reclamar', { codigo: b3.data.boleta.codigo, personas: 4 });
assert.equal(m3.status, 201, JSON.stringify(m3.data));
const amigos = await Promise.all(Array.from({ length: 6 }, (_, i) => socio('Amigo ' + String.fromCharCode(65 + i))));
const partes = await Promise.all(amigos.map((s) => s.c.post(`/api/mesas/${m3.data.mesa.token}/reclamar`)));
assert.equal(partes.filter((r) => r.status === 200).length, 3, JSON.stringify(partes.map((r) => r.status)));
ok('6 amigos para 3 lugares: entran exactamente 3');
// vista previa del enlace de la mesa (la lee WhatsApp): la escribe el Worker con datos de D1
const previa = await (await fetch(`${BASE}/m/${m3.data.mesa.token}`)).text();
assert.match(previa, /og:title" content="Dueña te guardó tu parte en el Club del Rey/);
assert.ok(previa.includes(`og:image" content="${BASE}/assets/og-club.jpg`));
ok('el enlace de la mesa trae vista previa con el nombre de quien pagó (Worker + D1)');
// confirmar un canje con PIN desde el celular del cliente: el PIN malo no descuenta
const sinPin = await camila.c.post('/api/canjes/confirmar', { local: 'REY-X', pin: '0000' });
assert.ok([401, 404, 429].includes(sinPin.status), 'PIN malo no debe pasar');

// 5) Canje: ficha, doble gasto en paralelo y aplicación por la caja
const saldo = (await camila.c.get('/api/me')).data.saldo.disponible;
assert.equal(saldo, 2400, 'sin espera de activación en esta configuración');
const fichas = await Promise.all([1, 2, 3].map(() => camila.c.post('/api/canjes', { monto: 1000 })));
assert.equal(fichas.filter((r) => r.status === 201).length, 1, JSON.stringify(fichas.map((r) => r.status)));
const ficha = fichas.find((r) => r.status === 201).data.ficha;
const apl = await Promise.all([1, 2].map(() => new Cliente('10.70.0.2').post(`/api/caja/fichas/${ficha.codigo}/aplicar`, {}, { authorization: `Bearer ${local.api_key}` })));
assert.deepEqual(apl.map((r) => r.status).sort(), [200, 409]);
assert.equal((await camila.c.get('/api/me')).data.saldo.disponible, 1400);
ok('canje: una sola ficha en carrera de 3, y aplicada una sola vez desde 2 cajas');

// 6) Ficha enviada junto con la boleta + anulación que devuelve las coronas
const f2 = (await camila.c.post('/api/canjes', { monto: 1000 })).data.ficha;
const b4 = await cajaAPI(`H${ejec}-4`, 18000, { canje_codigo: f2.codigo });
assert.equal(b4.data.canje.ok, true, JSON.stringify(b4.data));
assert.equal((await camila.c.get('/api/me')).data.saldo.disponible, 400);
const an = await new Cliente('10.70.0.3').post('/api/caja/boletas/anular', { folio: `H${ejec}-4` }, { authorization: `Bearer ${local.api_key}` });
assert.equal(an.status, 200);
assert.equal((await camila.c.get('/api/me')).data.saldo.disponible, 1400);
ok('ficha aplicada por la integración y devuelta al anular la boleta');

// 7) Anulación de una boleta reclamada revierte coronas y rango
const an2 = await new Cliente('10.70.0.3').post('/api/caja/boletas/anular', { folio: `H${ejec}-1` }, { authorization: `Bearer ${local.api_key}` });
assert.equal(an2.status, 200);
const yo = (await camila.c.get('/api/me')).data;
assert.equal(yo.rango.gasto, 0);
ok('anular una boleta reclamada revierte el gasto del rango');

// 8) Importación CSV, resumen y limpieza programada
const csv = `Local;Folio;Monto\n${local.codigo};I${ejec}-1;12.000\n${local.codigo};I${ejec}-2;13.000`;
const imp = await admin.post('/api/admin/importar', { csv });
assert.equal(imp.data.creadas, 2, JSON.stringify(imp.data));
const res = await admin.get('/api/admin/resumen');
assert.ok(res.data.socios >= 14);
ok(`importación CSV y resumen (${res.data.socios} socios en la base local)`);

// 9) Archivos estáticos y SPA
const index = await fetch(BASE + '/m/cualquiera123');
assert.equal(index.status, 200);
assert.match(await index.text(), /Club del Rey/);
const csp = (await fetch(BASE + '/')).headers.get('content-security-policy');
assert.match(csp || '', /default-src 'self'/);
ok('las rutas de la app caen en index.html y las cabeceras de seguridad están activas');

// 10) Código personal: consulta, descuento antes de la boleta y acreditación por códigos (Worker + D1)
const kl = (m, r, c) => new Cliente('10.70.0.9').pedir(m, r, c, { authorization: `Bearer ${local.api_key}` });
const gabi = await socio('Gabriela Soto');
const ivan = await socio('Ivan Pino');
const codG = (await gabi.c.get('/api/me')).data.usuario.codigo_socio;
const codI = (await ivan.c.get('/api/me')).data.usuario.codigo_socio;
assert.match(codG, /^[A-HJKMNP-Z2-9]{6}$/);
const bg = await cajaAPI(`G${ejec}-1`, 150000);
await gabi.c.post('/api/boletas/reclamar', { codigo: bg.data.boleta.codigo, personas: 5 });
const v = await kl('GET', `/api/caja/socios/${codG}`);
assert.equal(v.data.socio.coronas.disponible, 2400, JSON.stringify(v.data));
const dc = await kl('POST', `/api/caja/socios/${codG}/canje`, { monto: 1500 });
assert.equal(dc.status, 201, JSON.stringify(dc.data));
assert.equal(dc.data.socio.coronas.disponible, 900);
const ba = await kl('POST', '/api/caja/boletas', { folio: `A${ejec}-1`, monto: 58500, comensales: 2, socios: [codG, codI], canje_codigo: dc.data.canje_codigo });
assert.equal(ba.data.acreditacion?.ok, true, JSON.stringify(ba.data));
assert.deepEqual(ba.data.acreditacion.socios.map((s) => s.coronas), [2340, 2340]);
assert.equal((await gabi.c.get('/api/me')).data.saldo.disponible, 900 + 2340);
const lista = await kl('GET', '/api/caja/socios?limite=500');
assert.ok(lista.data.socios.some((s) => s.codigo === codG));
const csvAdmin = await fetch(BASE + '/api/admin/socios.csv', { headers: { cookie: [...admin.cookies].map(([k, x]) => `${k}=${x}`).join('; ') } });
assert.equal(csvAdmin.status, 200);
assert.match(await csvAdmin.text(), new RegExp(codG));
ok('código personal: consulta, descuento antes de la boleta y acreditación a 2 socios (Worker + D1)');

// 11) Restaurar la demostración (borra todo y re-siembra) y volver a registrarse desde cero
const rest = await admin.post('/api/admin/restaurar', { confirmar: 'RESTAURAR' });
assert.equal(rest.status, 200, JSON.stringify(rest.data));
assert.equal((await admin.get('/api/admin/resumen')).data.socios, 0);
assert.equal((await gabi.c.get('/api/me')).status, 401);
const nueva = await new Cliente('10.70.0.20').post('/api/caja/login', { local: 'REY-X', pin: '1234' });
assert.equal(nueva.status, 200, JSON.stringify(nueva.data));
const otra = await socio('Camila Rojas');
assert.equal((await otra.c.get('/api/me')).data.saldo.disponible, 0);
ok('restaurar demo en D1: queda vacío, con locales de demostración (PIN 1234), y se puede registrar de nuevo');

console.log('\nWorker + D1: todo OK');
