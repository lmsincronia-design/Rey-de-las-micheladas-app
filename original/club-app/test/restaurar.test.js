// Restaurar la demostración y exportar la base de coronas por código.
import test from 'node:test';
import assert from 'node:assert/strict';
import { montar, registrarSocio, navegador } from './helpers.js';

async function admin(c) {
  const adm = navegador(c.app, { ip: '10.0.0.9' });
  assert.equal((await adm.post('/api/admin/login', { password: 'clave-admin' })).status, 200);
  return adm;
}

test('restaurar demo: borra socios, boletas y canjes, y deja todo como el primer día (el admin sigue dentro)', async () => {
  const c = await montar({ env: { MODO_MVP: '1' } });
  const adm = await admin(c);
  const s = await registrarSocio(c, { nombre: 'Camila Rojas', tel: '+56 9 1111 2222' });
  await s.nav.post('/api/boletas/reclamar', { codigo: 'MESA5K', personas: 5 });
  await s.nav.post('/api/canjes', { monto: 1000 });
  // el admin cambia reglas y códigos
  const cfg = (await adm.get('/api/admin/config')).data.config;
  await adm.post('/api/admin/config', { config: { ...cfg, tope_coronas_por_persona: 1234 } });
  await adm.post('/api/admin/codigos', { codigo: 'RARO', monto: 5000, personas: 1 });
  await adm.post('/api/admin/codigos/borrar', { codigo: 'RANGO1' });

  assert.equal((await adm.post('/api/admin/restaurar', {})).status, 400, 'pide confirmación');
  assert.equal((await adm.post('/api/admin/restaurar', { confirmar: 'si' })).status, 400);
  const r = await adm.post('/api/admin/restaurar', { confirmar: 'RESTAURAR' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.borrados.socios, 1);
  assert.equal(r.data.pin, '1234');

  // lo de antes ya no existe
  assert.equal((await s.nav.get('/api/me')).status, 401, 'la sesión del cliente se cerró');
  const resumen = (await adm.get('/api/admin/resumen')).data;
  assert.equal(resumen.socios, 0);
  assert.equal((await adm.get('/api/admin/config')).data.config.tope_coronas_por_persona, 8000, 'reglas originales');
  const codigos = (await adm.get('/api/admin/codigos')).data.codigos.map((x) => x.codigo);
  assert.ok(codigos.includes('RANGO1') && !codigos.includes('RARO'));
  // y se puede volver a empezar con el mismo teléfono, desde cero
  const nuevo = await registrarSocio(c, { nombre: 'Camila Rojas', tel: '+56 9 1111 2222' });
  const yo = (await nuevo.nav.get('/api/me')).data;
  assert.equal(yo.saldo.disponible, 0);
  assert.equal(yo.rango.nombre, 'Plebeyo');
  assert.equal((await nuevo.nav.post('/api/boletas/reclamar', { codigo: 'MESA5K', personas: 5 })).status, 201);
  // la caja de demostración sigue funcionando con el PIN de siempre
  const caja = navegador(c.app, { ip: '10.0.0.5' });
  assert.equal((await caja.post('/api/caja/login', { local: 'REY-X', pin: '1234' })).status, 200);
});

test('restaurar demo: exige sesión de administración y no existe en producción', async () => {
  const c = await montar({ env: { MODO_MVP: '1' } });
  const anon = navegador(c.app);
  assert.equal((await anon.post('/api/admin/restaurar', { confirmar: 'RESTAURAR' })).status, 401);
  const prod = await montar({ demo: false, env: { MODO_MVP: '0', ADMIN_PASSWORD: 'clave-admin' } });
  const adm = await admin(prod);
  const r = await adm.post('/api/admin/restaurar', { confirmar: 'RESTAURAR' });
  assert.equal(r.status, 403);
  assert.equal(r.data.error.codigo, 'solo_demostracion');
});

test('el panel exporta la base de coronas por código personal (CSV)', async () => {
  const c = await montar({ env: { MODO_MVP: '1' } });
  const adm = await admin(c);
  const s = await registrarSocio(c, { nombre: 'Camila Rojas' });
  await s.nav.post('/api/boletas/reclamar', { codigo: 'MESA5K', personas: 5 });
  const codigo = (await s.nav.get('/api/me')).data.usuario.codigo_socio;
  const csv = await adm.pedir('GET', '/api/admin/socios.csv', undefined, { json: false });
  assert.equal(csv.status, 200);
  assert.ok(String(csv.headers.get('content-type')).includes('text/csv'));
  const texto = String(csv.data);
  assert.match(texto, /^Codigo;Nombre;Rango;Porcentaje;Coronas disponibles/);
  assert.ok(texto.includes(`${codigo};Camila Rojas;Plebeyo;8%;2400;0;30000`), texto);
  // el listado del panel muestra el código y se puede buscar por él
  const lista = await adm.get(`/api/admin/socios?q=${codigo}`);
  assert.equal(lista.data.socios.length, 1);
  assert.equal(lista.data.socios[0].codigo_socio, codigo);
  assert.equal((await navegador(c.app).get('/api/admin/socios.csv')).status, 401);
});
