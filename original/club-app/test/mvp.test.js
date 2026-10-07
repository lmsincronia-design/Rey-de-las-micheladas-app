// Modo MVP: códigos de prueba fijos, sin esperas, para mostrar el sistema completo en una reunión.
import test from 'node:test';
import assert from 'node:assert/strict';
import { montar, registrarSocio, navegador } from './helpers.js';

const reclamar = (s, codigo, personas) => s.nav.post('/api/boletas/reclamar', { codigo, personas });

test('sin MODO_MVP los códigos de prueba no existen', async () => {
  const c = await montar();
  const s = await registrarSocio(c);
  assert.equal((await reclamar(s, 'RANGO1', 1)).status, 400);
  assert.deepEqual((await s.nav.get('/api/demo/codigos')).data.codigos, []);
});

test('MVP: los códigos se reusan sin límite y suben de rango hasta Rey', async () => {
  const c = await montar({ env: { MODO_MVP: '1' } });
  const s = await registrarSocio(c);
  const lista = (await s.nav.get('/api/demo/codigos')).data.codigos;
  assert.ok(lista.length >= 7);
  const seguido = [];
  for (const cod of ['RANGO1', 'RANGO2', 'RANGO3', 'RANGO4']) {
    const r = await reclamar(s, cod, 1);
    assert.equal(r.status, 201, JSON.stringify(r.data));
    seguido.push(r.data.rango.id);
  }
  assert.deepEqual(seguido, ['comerciante', 'guardia', 'noble', 'rey']);
  // repetir el mismo código funciona (y no cae en límites diarios)
  for (let i = 0; i < 6; i++) assert.equal((await reclamar(s, 'suma10', 1)).status, 201);
  // las coronas están disponibles al instante: se puede canjear en la misma visita
  const canje = await s.nav.post('/api/canjes', { monto: 1000 });
  assert.equal(canje.status, 201, JSON.stringify(canje.data));
});

test('MVP: cada persona recibe coronas según SU rango, aunque comparta la misma cuenta', async () => {
  const c = await montar({ env: { MODO_MVP: '1' } });
  const noble = await registrarSocio(c);
  for (const cod of ['RANGO1', 'RANGO2', 'RANGO3']) await reclamar(noble, cod, 1);
  const plebeyo = await registrarSocio(c);
  const r = await reclamar(plebeyo, 'MESA5K', 5);
  assert.equal(r.status, 201);
  assert.equal(r.data.coronas_ganadas, 2400); // $30.000 al 8%
  const m = await noble.nav.post(`/api/mesas/${r.data.mesa.token}/reclamar`);
  assert.equal(m.status, 200, JSON.stringify(m.data));
  assert.equal(m.data.coronas_ganadas, 4200); // la misma parte de $30.000 al 14%
});

test('MVP: el admin edita los códigos de prueba y se usan al instante', async () => {
  const c = await montar({ env: { MODO_MVP: '1' } });
  const adm = navegador(c.app, { ip: '10.0.0.9' });
  await adm.post('/api/admin/login', { password: 'clave-admin' });
  assert.equal((await adm.post('/api/admin/codigos', { codigo: 'FIESTA', monto: 300000, personas: 10, nota: 'Cumpleaños' })).status, 200);
  assert.equal((await adm.post('/api/admin/codigos', { codigo: '??', monto: 300000, personas: 10 })).status, 400);
  assert.equal((await adm.post('/api/admin/codigos', { codigo: 'MALO', monto: 300000, personas: 99 })).status, 400);
  const s = await registrarSocio(c);
  const r = await reclamar(s, 'fiesta', 3);
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.mesa.personas, 10);
  assert.equal(r.data.gasto_sumado, 30000);
  await adm.post('/api/admin/codigos/borrar', { codigo: 'FIESTA' });
  assert.equal((await reclamar(s, 'FIESTA', 10)).status, 400);
  assert.equal((await adm.get('/api/admin/codigos')).data.mvp, true);
});
