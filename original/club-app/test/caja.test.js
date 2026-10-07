import test from 'node:test';
import assert from 'node:assert/strict';
import { montar, navegador, emitirBoleta, staff, registrarSocio, boletaNueva, MIN, HORA, DIA } from './helpers.js';

test('la caja registra una boleta con su llave y recibe un código de 6 caracteres', async () => {
  const c = await montar();
  const r = await emitirBoleta(c, 'REY-X', { folio: 'A-100', monto: 150000, comensales: 5 });
  assert.equal(r.status, 201);
  assert.match(r.data.boleta.codigo, /^[A-HJKMNP-Z2-9]{6}$/);
  assert.equal(r.data.boleta.monto, 150000);
  assert.equal(r.data.boleta.comensales, 5);
  assert.equal(r.data.boleta.estado, 'emitida');
  assert.equal(r.data.repetida, false);
});

test('la misma boleta enviada dos veces es idempotente; con otro monto es un conflicto', async () => {
  const c = await montar();
  const a = await emitirBoleta(c, 'REY-X', { folio: 'A-1', monto: 20000 });
  const b = await emitirBoleta(c, 'REY-X', { folio: 'A-1', monto: 20000 });
  assert.equal(b.status, 200);
  assert.equal(b.data.repetida, true);
  assert.equal(b.data.boleta.codigo, a.data.boleta.codigo);
  const d = await emitirBoleta(c, 'REY-X', { folio: 'A-1', monto: 25000 });
  assert.equal(d.status, 409);
  assert.equal(d.data.error.codigo, 'folio_distinto');
  // el mismo folio en otro local es otra boleta
  const e = await emitirBoleta(c, 'REY-IV', { folio: 'A-1', monto: 20000 });
  assert.equal(e.status, 201);
  assert.notEqual(e.data.boleta.codigo, a.data.boleta.codigo);
  assert.equal((await c.db.get('SELECT COUNT(*) AS n FROM boletas')).n, 2);
});

test('datos inválidos de la caja se rechazan', async () => {
  const c = await montar();
  const malo = async (datos, codigo) => {
    const r = await emitirBoleta(c, 'REY-X', datos);
    assert.equal(r.status, 400, JSON.stringify(datos));
    assert.equal(r.data.error.codigo, codigo, JSON.stringify(datos));
  };
  await malo({ monto: 1000 }, 'folio_invalido');
  await malo({ folio: '', monto: 1000 }, 'folio_invalido');
  await malo({ folio: 'con espacios', monto: 1000 }, 'folio_invalido');
  await malo({ folio: "x'; DROP TABLE boletas;--", monto: 1000 }, 'folio_invalido');
  await malo({ folio: 'x'.repeat(31), monto: 1000 }, 'folio_invalido');
  await malo({ folio: 'F1', monto: 0 }, 'monto_invalido');
  await malo({ folio: 'F1', monto: -5000 }, 'monto_invalido');
  await malo({ folio: 'F1', monto: 1500.5 }, 'monto_invalido');
  await malo({ folio: 'F1', monto: 'mucho' }, 'monto_invalido');
  await malo({ folio: 'F1', monto: 99999999 }, 'monto_invalido');
  await malo({ folio: 'F1', monto: 1000, comensales: 0 }, 'comensales_invalidos');
  await malo({ folio: 'F1', monto: 1000, comensales: 99 }, 'comensales_invalidos');
  await malo({ folio: 'F1', monto: 1000, emitida_en: 'ayer por la tarde' }, 'fecha_invalida');
  await malo({ folio: 'F1', monto: 1000, emitida_en: Date.now() + 5 * DIA }, 'fecha_futura');
  await malo({ folio: 'F1', monto: 1000, codigo: 'AB1' }, 'codigo_invalido');
  await malo({ folio: 'F1', monto: 1000, codigo: 'ABCOEF' }, 'codigo_invalido'); // lleva O
  assert.equal((await c.db.get('SELECT COUNT(*) AS n FROM boletas')).n, 0);
  // folio numérico y monto como texto numérico sí valen
  assert.equal((await emitirBoleta(c, 'REY-X', { folio: 123, monto: '4500' })).status, 201);
});

test('la caja puede mandar su propio código y no se pueden repetir', async () => {
  const c = await montar();
  const a = await emitirBoleta(c, 'REY-X', { folio: 'P1', monto: 5000, codigo: 'k7m-29x' });
  assert.equal(a.status, 201);
  assert.equal(a.data.boleta.codigo, 'K7M29X');
  const b = await emitirBoleta(c, 'REY-X', { folio: 'P2', monto: 5000, codigo: 'K7M29X' });
  assert.equal(b.status, 409);
  assert.equal(b.data.error.codigo, 'codigo_repetido');
});

test('fecha de emisión sin zona horaria se interpreta como hora de Chile', async () => {
  const c = await montar();
  const r = await emitirBoleta(c, 'REY-X', { folio: 'T1', monto: 5000, emitida_en: '2026-10-08 20:30' });
  assert.equal(r.status, 201);
  assert.equal(r.data.boleta.emitida_en, Date.parse('2026-10-08T23:30:00Z'));
  const z = await emitirBoleta(c, 'REY-X', { folio: 'T2', monto: 5000, emitida_en: '2026-10-08T20:30:00-03:00' });
  assert.equal(z.data.boleta.emitida_en, Date.parse('2026-10-08T23:30:00Z'));
});

test('autenticación de la caja: llave inválida, sin llave, y PIN en pantalla', async () => {
  const c = await montar();
  const nav = navegador(c.app);
  assert.equal((await nav.post('/api/caja/boletas', { folio: 'X1', monto: 1000 })).status, 401);
  const mala = await nav.pedir('POST', '/api/caja/boletas', { folio: 'X1', monto: 1000 }, { headers: { authorization: 'Bearer rey_falsa' } });
  assert.equal(mala.status, 401);
  assert.equal(mala.data.error.codigo, 'llave_invalida');
  // una llave de otro local registra en SU local
  const r = await emitirBoleta(c, 'REY-IV', { folio: 'X2', monto: 1000 });
  assert.equal(r.data.boleta.local.codigo, 'REY-IV');

  assert.equal((await navegador(c.app).post('/api/caja/login', { local: 'REY-X', pin: '0000' })).status, 401);
  assert.equal((await navegador(c.app).post('/api/caja/login', { local: 'NO-EXISTE', pin: c.pin })).status, 401);
  assert.equal((await navegador(c.app).post('/api/caja/login', { local: 'REY-X' })).status, 401);
  const ok = await staff(c, 'rey-x');
  const yo = await ok.get('/api/caja/yo');
  assert.equal(yo.data.local.codigo, 'REY-X');
  assert.equal(yo.data.via, 'sesion');
  await ok.post('/api/caja/salir');
  assert.equal((await ok.get('/api/caja/yo')).status, 401);
});

test('el PIN se frena a los 10 intentos fallidos', async () => {
  const c = await montar();
  const nav = navegador(c.app, { ip: '10.5.5.5' });
  for (let i = 0; i < 10; i++) assert.equal((await nav.post('/api/caja/login', { local: 'REY-X', pin: '9999' })).status, 401);
  const r = await nav.post('/api/caja/login', { local: 'REY-X', pin: c.pin });
  assert.equal(r.status, 429, 'ni el PIN correcto entra mientras dura el bloqueo');
  c.reloj.avanzar(11 * MIN);
  assert.equal((await nav.post('/api/caja/login', { local: 'REY-X', pin: c.pin })).status, 200);
});

test('en producción (sin modo demo) solo la integración con llave registra boletas', async () => {
  const c = await montar({ demo: false });
  const nav = await staff(c);
  const porPantalla = await nav.post('/api/caja/boletas', { folio: 'Z1', monto: 5000 });
  assert.equal(porPantalla.status, 403);
  assert.equal(porPantalla.data.error.codigo, 'solo_integracion');
  assert.equal((await emitirBoleta(c, 'REY-X', { folio: 'Z1', monto: 5000 })).status, 201);
  // sin demo, la contraseña de admin debe estar configurada
  const sinClave = await montar({ demo: false, env: { ADMIN_PASSWORD: '' } });
  const r = await navegador(sinClave.app).post('/api/admin/login', { password: 'rey-admin' });
  assert.equal(r.status, 503);
});

test('anular una boleta no reclamada la deja inutilizable', async () => {
  const c = await montar();
  const codigo = await boletaNueva(c, { monto: 20000 });
  const caja = await staff(c);
  const lista = await caja.get('/api/caja/boletas');
  assert.equal(lista.data.boletas.length, 1);
  assert.equal(lista.data.total, 20000);
  assert.equal((await caja.post('/api/caja/boletas/anular', { folio: 'F1001' })).status, 200);
  assert.equal((await caja.post('/api/caja/boletas/anular', { folio: 'F1001' })).data.ya_anulada, true);
  assert.equal((await caja.post('/api/caja/boletas/anular', { folio: 'NO-ESTA' })).status, 404);
  const s = await registrarSocio(c);
  const r = await s.nav.post('/api/boletas/reclamar', { codigo, personas: 1 });
  assert.equal(r.status, 410);
  assert.equal(r.data.error.codigo, 'boleta_anulada');
  assert.equal((await caja.get('/api/caja/boletas')).data.total, 0, 'las anuladas no suman');
});

test('el listado de boletas de la caja solo muestra su local y el día pedido', async () => {
  const c = await montar();
  await boletaNueva(c, { local: 'REY-X', monto: 10000 });
  await boletaNueva(c, { local: 'REY-IV', monto: 99999 });
  const caja = await staff(c, 'REY-X');
  const hoy = await caja.get('/api/caja/boletas');
  assert.equal(hoy.data.boletas.length, 1);
  assert.equal(hoy.data.boletas[0].monto, 10000);
  assert.equal(hoy.data.dia, '2026-10-08');
  const ayer = await caja.get('/api/caja/boletas?dia=2026-10-07');
  assert.equal(ayer.data.boletas.length, 0);
  assert.equal((await caja.get('/api/caja/boletas?dia=hoy')).status, 400);
});
