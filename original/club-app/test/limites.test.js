// Cloudflare limita las consultas a D1 por solicitud (50 en el plan gratis). Esta prueba cuenta cuántas hace cada pantalla.
import test from 'node:test';
import assert from 'node:assert/strict';
import { crearApp } from '../src/app.js';
import { crearDbNode, migrar } from '../src/db-node.js';
import { sembrarDemo } from '../src/seed.js';
import { navegador, telefonoNuevo } from './helpers.js';

const MAX_CONSULTAS = 40;

test(`ninguna solicitud usa más de ${MAX_CONSULTAS} consultas a la base`, async () => {
  const db = crearDbNode(':memory:');
  await migrar(db);
  let t = Date.parse('2026-10-09T01:00:00Z');
  const env = { MODO_DEMO: '1', SECRET: 's', ADMIN_PASSWORD: 'a' };
  await sembrarDemo(db, env.SECRET, t);
  let cuenta = 0;
  const contador = {
    ...db,
    run: (...a) => { cuenta++; return db.run(...a); },
    get: (...a) => { cuenta++; return db.get(...a); },
    all: (...a) => { cuenta++; return db.all(...a); },
    batch: (st) => { cuenta += st.length; return db.batch(st); },
  };
  const app = crearApp({ db: contador, env, reloj: () => t });
  const peor = {};
  const medir = async (nombre, fn) => {
    cuenta = 0;
    const r = await fn();
    peor[nombre] = Math.max(peor[nombre] || 0, cuenta);
    return r;
  };
  const nav = navegador(app, { ip: '10.0.0.5' });
  const tel = telefonoNuevo();
  const a = await medir('pedir código', () => nav.post('/api/auth/codigo', { telefono: tel }));
  const b = await medir('verificar código', () => nav.post('/api/auth/verificar', { telefono: tel, codigo: a.data.codigo_demo }));
  await medir('registro', () => nav.post('/api/auth/registro', { registro_token: b.data.registro_token, nombre: 'Camila Rojas', nacimiento: '1990-05-05', acepta: true }));
  const key = { authorization: 'Bearer rey_demo_rey-x' };
  const caja = navegador(app, { ip: '10.0.0.6' });
  const bo = await medir('caja: registrar boleta', () => caja.pedir('POST', '/api/caja/boletas', { folio: 'L1', monto: 150000 }, { headers: key }));
  const amigos = Array.from({ length: 4 }, () => ({ etiqueta: 'A', telefono: telefonoNuevo() }));
  const r = await medir('reclamar boleta (con 4 amigos)', () => nav.post('/api/boletas/reclamar', { codigo: bo.data.boleta.codigo, personas: 5, amigos }));
  await medir('perfil', () => nav.get('/api/me'));
  await medir('movimientos', () => nav.get('/api/me/movimientos'));
  await medir('ver mesa', () => nav.get(`/api/mesas/${r.data.mesa.token}`));
  // otro socio reclama una parte
  const otro = navegador(app, { ip: '10.0.0.7' });
  const t2 = telefonoNuevo();
  const a2 = await otro.post('/api/auth/codigo', { telefono: t2 });
  const b2 = await otro.post('/api/auth/verificar', { telefono: t2, codigo: a2.data.codigo_demo });
  await otro.post('/api/auth/registro', { registro_token: b2.data.registro_token, nombre: 'Diego Soto', nacimiento: '1990-05-05', acepta: true });
  const pend = await otro.post(`/api/mesas/${r.data.mesa.token}/reclamar`);
  assert.equal(pend.status, 409, 'las partes restantes estaban asignadas por teléfono');
  t += 25 * 3_600_000;
  await medir('canjear', () => nav.post('/api/canjes', { monto: 1000 }));
  const ficha = (await nav.get('/api/me')).data.ficha_activa;
  await medir('caja: ver ficha', () => caja.pedir('GET', `/api/caja/fichas/${ficha.codigo}`, undefined, { headers: key }));
  await medir('caja: aplicar ficha', () => caja.pedir('POST', `/api/caja/fichas/${ficha.codigo}/aplicar`, {}, { headers: key }));
  await medir('caja: anular boleta', () => caja.pedir('POST', '/api/caja/boletas/anular', { folio: 'L1' }, { headers: key }));
  const adm = navegador(app, { ip: '10.0.0.8' });
  await adm.post('/api/admin/login', { password: 'a' });
  await medir('admin: resumen', () => adm.get('/api/admin/resumen'));
  await medir('admin: socios', () => adm.get('/api/admin/socios'));
  const filas = Array.from({ length: 10 }, (_, i) => `REY-X;C${i};${10000 + i}`).join('\n');
  await medir('admin: importar 10 filas', () => adm.post('/api/admin/importar', { csv: `Local;Folio;Monto\n${filas}` }));
  // Código personal: consulta, descuento y boleta acreditada a 3 socios
  const registrar = async (ip, nombre) => {
    const n = navegador(app, { ip });
    const tl = telefonoNuevo();
    const a1 = await n.post('/api/auth/codigo', { telefono: tl });
    const b1 = await n.post('/api/auth/verificar', { telefono: tl, codigo: a1.data.codigo_demo });
    await n.post('/api/auth/registro', { registro_token: b1.data.registro_token, nombre, nacimiento: '1990-05-05', acepta: true });
    return n;
  };
  const p1 = await registrar('10.0.0.31', 'Ana Vera');
  const p2 = await registrar('10.0.0.32', 'Bruno Díaz');
  const p3 = await registrar('10.0.0.33', 'Carla Núñez');
  const boA = await caja.pedir('POST', '/api/caja/boletas', { folio: 'L2', monto: 150000, comensales: 5 }, { headers: key });
  await p1.post('/api/boletas/reclamar', { codigo: boA.data.boleta.codigo, personas: 5 });
  t += 25 * 3_600_000;
  const codigos = [];
  for (const p of [p1, p2, p3]) codigos.push((await p.get('/api/me')).data.usuario.codigo_socio);
  await medir('caja: ver socio por código', () => caja.pedir('GET', `/api/caja/socios/${codigos[0]}`, undefined, { headers: key }));
  await medir('caja: descuento por código', () => caja.pedir('POST', `/api/caja/socios/${codigos[0]}/canje`, { monto: 1000 }, { headers: key }));
  const bo3 = await medir('caja: boleta acreditada a 3 socios', () => caja.pedir('POST', '/api/caja/boletas', { folio: 'L3', monto: 90000, comensales: 5, socios: codigos }, { headers: key }));
  assert.equal(bo3.data.acreditacion?.ok, true, JSON.stringify(bo3.data));
  const ocho = [...codigos];
  for (let i = 0; i < 5; i++) ocho.push((await (await registrar(`10.0.1.${i}`, `Socio Uno${"ABCDE"[i]}`)).get('/api/me')).data.usuario.codigo_socio);
  const bo8 = await medir('caja: boleta acreditada a 8 socios', () => caja.pedir('POST', '/api/caja/boletas', { folio: 'L8', monto: 240000, comensales: 8, socios: ocho }, { headers: key }));
  assert.equal(bo8.data.acreditacion?.ok, true, JSON.stringify(bo8.data));
  await medir('caja: listado de socios', () => caja.pedir('GET', '/api/caja/socios', undefined, { headers: key }));
  await medir('admin: exportar CSV', () => adm.get('/api/admin/socios.csv'));
  console.log(Object.entries(peor).map(([k, v]) => `  ${String(v).padStart(3)} consultas · ${k}`).join('\n'));
  for (const [nombre, n] of Object.entries(peor)) assert.ok(n <= MAX_CONSULTAS, `${nombre}: ${n} consultas`);
});
