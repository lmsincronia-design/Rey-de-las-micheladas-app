// El garzón confirma el canje en el celular del cliente con el PIN del local.
import test from 'node:test';
import assert from 'node:assert/strict';
import { montar, registrarSocio, navegador } from './helpers.js';

async function conFicha(c, monto = 1000) {
  const s = await registrarSocio(c);
  assert.equal((await s.nav.post('/api/boletas/reclamar', { codigo: 'MESA5K', personas: 5 })).status, 201);
  const f = await s.nav.post('/api/canjes', { monto });
  assert.equal(f.status, 201, JSON.stringify(f.data));
  return { s, ficha: f.data.ficha };
}

test('confirmar canje: PIN correcto aplica la ficha y el cliente queda con el descuento usado', async () => {
  const c = await montar({ env: { MODO_MVP: '1' } });
  const { s, ficha } = await conFicha(c);
  const r = await s.nav.post('/api/canjes/confirmar', { local: 'REY-X', pin: c.pin });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.ficha.estado, 'usada');
  assert.equal(r.data.ficha.monto_aplicado, 1000);
  assert.equal(r.data.local.codigo, 'REY-X');
  const yo = (await s.nav.get('/api/me')).data;
  assert.equal(yo.ficha_activa, null);
  assert.equal(yo.saldo.disponible, 2400 - 1000);
  // la misma ficha no se puede volver a confirmar
  const otra = await s.nav.post('/api/canjes/confirmar', { local: 'REY-X', pin: c.pin });
  assert.equal(otra.status, 404);
  assert.equal(otra.data.error.codigo, 'sin_ficha');
  // y la caja tampoco puede aplicarla de nuevo
  const caja = navegador(c.app, { ip: '10.0.0.6' });
  const dos = await caja.pedir('POST', `/api/caja/fichas/${ficha.codigo}/aplicar`, {}, { headers: { authorization: `Bearer ${c.llaves['REY-X']}` } });
  assert.equal(dos.status, 409);
});

test('confirmar canje: PIN incorrecto, sin sesión o sin ficha no descuentan nada', async () => {
  const c = await montar({ env: { MODO_MVP: '1' } });
  const { s } = await conFicha(c);
  const malo = await s.nav.post('/api/canjes/confirmar', { local: 'REY-X', pin: '0000' });
  assert.equal(malo.status, 401);
  assert.equal((await s.nav.post('/api/canjes/confirmar', { local: 'REY-NO-EXISTE', pin: c.pin })).status, 401);
  assert.equal((await s.nav.post('/api/canjes/confirmar', { local: 'REY-X' })).status, 401);
  const yo = (await s.nav.get('/api/me')).data;
  assert.equal(yo.ficha_activa.estado, 'reservada', 'la ficha sigue activa');
  const anon = navegador(c.app, { ip: '10.9.9.9' });
  assert.equal((await anon.post('/api/canjes/confirmar', { local: 'REY-X', pin: c.pin })).status, 401);
  // otro cliente sin ficha
  const otro = await registrarSocio(c);
  assert.equal((await otro.nav.post('/api/canjes/confirmar', { local: 'REY-X', pin: c.pin })).data.error.codigo, 'sin_ficha');
});

test('confirmar canje: adivinar el PIN tiene límite de intentos', async () => {
  const c = await montar({ env: { MODO_MVP: '1' } });
  const { s } = await conFicha(c);
  let ultimo = 0;
  for (let i = 0; i < 12; i++) ultimo = (await s.nav.post('/api/canjes/confirmar', { local: 'REY-X', pin: String(1000 + i) })).status;
  assert.equal(ultimo, 429);
  // ya bloqueado: ni siquiera el PIN correcto pasa hasta que termine la espera
  assert.equal((await s.nav.post('/api/canjes/confirmar', { local: 'REY-X', pin: c.pin })).status, 429);
  // y esos intentos NO bloquean la pantalla de caja del local
  const caja = navegador(c.app, { ip: '10.0.0.77' });
  assert.equal((await caja.post('/api/caja/login', { local: 'REY-X', pin: c.pin })).status, 200);
});

test('confirmar canje: una ficha vencida no se puede confirmar y las coronas vuelven', async () => {
  const c = await montar({ env: { MODO_MVP: '1' } });
  const { s } = await conFicha(c);
  c.reloj.avanzar(13 * 60_000 + 5_000); // 10 min de vida + 2 min de gracia
  const r = await s.nav.post('/api/canjes/confirmar', { local: 'REY-X', pin: c.pin });
  assert.equal(r.status, 404);
  assert.equal((await s.nav.get('/api/me')).data.saldo.disponible, 2400);
});

test('confirmar canje también entrega el regalo de cumpleaños, una sola vez', async () => {
  const c = await montar({ env: { MODO_MVP: '1' } });
  const s = await registrarSocio(c, { nacimiento: '1995-10-08' }); // cumple el día de la prueba (hora de Chile)
  assert.equal((await s.nav.post('/api/boletas/reclamar', { codigo: 'PAREJA', personas: 2 })).status, 201);
  const g = await s.nav.post('/api/regalo');
  assert.equal(g.status, 201, JSON.stringify(g.data));
  assert.equal(g.data.ficha.tipo, 'regalo');
  const r = await s.nav.post('/api/canjes/confirmar', { local: 'REY-X', pin: c.pin });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.ficha.tipo, 'regalo');
  assert.equal(r.data.ficha.estado, 'usada');
  const yo = (await s.nav.get('/api/me')).data;
  assert.equal(yo.regalo.disponible, false);
  assert.equal(yo.regalo.motivo, 'ya_usado');
});
