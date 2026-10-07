// Código personal del socio: la caja lo escribe ANTES de emitir la boleta, ve las coronas, descuenta y acredita.
import test from 'node:test';
import assert from 'node:assert/strict';
import { montar, registrarSocio, navegador, emitirBoleta } from './helpers.js';

const cab = (c) => ({ authorization: `Bearer ${c.llaves['REY-X']}` });
const caja = (c, ip = '10.7.7.7') => {
  const n = navegador(c.app, { ip });
  return {
    get: (r) => n.pedir('GET', r, undefined, { headers: cab(c) }),
    post: (r, cuerpo = {}) => n.pedir('POST', r, cuerpo, { headers: cab(c) }),
  };
};
const codigoDe = async (s) => (await s.nav.get('/api/me')).data.usuario.codigo_socio;

test('cada socio recibe un código personal único al registrarse', async () => {
  const c = await montar();
  const a = await registrarSocio(c);
  const b = await registrarSocio(c);
  const ca = await codigoDe(a);
  const cb = await codigoDe(b);
  assert.match(ca, /^[A-HJKMNP-Z2-9]{6}$/);
  assert.notEqual(ca, cb);
  assert.equal(await codigoDe(a), ca, 'el código no cambia');
});

test('una cuenta anterior sin código recibe uno al abrir la app', async () => {
  const c = await montar();
  const s = await registrarSocio(c);
  await c.db.run('UPDATE usuarios SET codigo_socio = NULL');
  const nuevo = await codigoDe(s);
  assert.match(nuevo, /^[A-HJKMNP-Z2-9]{6}$/);
  assert.equal(await codigoDe(s), nuevo);
});

test('la caja consulta un código y ve nombre, rango y coronas al día (sin datos sensibles)', async () => {
  const c = await montar({ env: { MODO_MVP: '1' } });
  const s = await registrarSocio(c, { nombre: 'Camila Rojas' });
  await s.nav.post('/api/boletas/reclamar', { codigo: 'MESA5K', personas: 5 });
  const k = caja(c);
  const r = await k.get(`/api/caja/socios/${(await codigoDe(s)).toLowerCase()}`);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.socio.nombre, 'Camila R.');
  assert.equal(r.data.socio.rango.nombre, 'Plebeyo');
  assert.equal(r.data.socio.coronas.disponible, 2400);
  assert.equal(r.data.socio.canje.puede, true);
  assert.ok(r.data.socio.canje.sugeridos.length > 0);
  const txt = JSON.stringify(r.data);
  assert.ok(!txt.includes(s.tel) && !txt.includes('Rojas') && !txt.includes('1995'), 'sin teléfono, apellido ni nacimiento');
  assert.equal((await k.get('/api/caja/socios/ZZZZZZ')).status, 404);
  assert.equal((await k.get('/api/caja/socios/abc')).status, 400);
  const anon = navegador(c.app);
  assert.equal((await anon.get(`/api/caja/socios/${await codigoDe(s)}`)).status, 401);
});

test('descuento por código: se descuenta al tiro, antes de emitir la boleta, y la boleta lo vincula', async () => {
  const c = await montar({ env: { MODO_MVP: '1' } });
  const s = await registrarSocio(c);
  await s.nav.post('/api/boletas/reclamar', { codigo: 'MESA5K', personas: 5 });
  const codigo = await codigoDe(s);
  const k = caja(c);
  assert.equal((await k.post(`/api/caja/socios/${codigo}/canje`, { monto: 700 })).status, 400);
  assert.equal((await k.post(`/api/caja/socios/${codigo}/canje`, { monto: 5000 })).status, 400, 'más que el saldo');
  const r = await k.post(`/api/caja/socios/${codigo}/canje`, { monto: 2000 });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.descuento, 2000);
  assert.equal(r.data.socio.coronas.disponible, 400);
  assert.equal((await s.nav.get('/api/me')).data.saldo.disponible, 400);
  const b = await k.post('/api/caja/boletas', { folio: 'D1', monto: 48000, canje_codigo: r.data.canje_codigo });
  assert.equal(b.data.canje.ok, true);
  assert.equal(b.data.canje.ya_aplicada, true);
  await k.post('/api/caja/boletas/anular', { folio: 'D1' });
  assert.equal((await s.nav.get('/api/me')).data.saldo.disponible, 2400, 'anular la boleta devuelve las coronas del descuento');
});

test('descuento por código: con las reglas de producción, un descuento por día y coronas activas a las 24 h', async () => {
  const c = await montar();
  const s = await registrarSocio(c);
  const bol = await emitirBoleta(c, 'REY-X', { folio: 'P1', monto: 150000, comensales: 5 });
  await s.nav.post('/api/boletas/reclamar', { codigo: bol.data.boleta.codigo, personas: 5 });
  const k = caja(c);
  const codigo = await codigoDe(s);
  assert.equal((await k.post(`/api/caja/socios/${codigo}/canje`, { monto: 1000 })).status, 400, 'todavía por activar');
  assert.equal((await k.get(`/api/caja/socios/${codigo}`)).data.socio.coronas.por_activar, 2400);
  c.reloj.avanzar(25 * 3_600_000);
  assert.equal((await k.post(`/api/caja/socios/${codigo}/canje`, { monto: 1000 })).status, 201);
  assert.equal((await k.post(`/api/caja/socios/${codigo}/canje`, { monto: 1000 })).status, 429, 'un descuento por día');
});

test('descuento por código reemplaza una ficha que el cliente había generado en su app', async () => {
  const c = await montar({ env: { MODO_MVP: '1' } });
  const s = await registrarSocio(c);
  await s.nav.post('/api/boletas/reclamar', { codigo: 'MESA5K', personas: 5 });
  assert.equal((await s.nav.post('/api/canjes', { monto: 1000 })).status, 201);
  const r = await caja(c).post(`/api/caja/socios/${await codigoDe(s)}/canje`, { monto: 1500 });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const yo = (await s.nav.get('/api/me')).data;
  assert.equal(yo.ficha_activa, null);
  assert.equal(yo.saldo.disponible, 900);
});

test('acreditar por códigos: cada socio gana según SU rango y las partes sin código quedan libres', async () => {
  const c = await montar({ env: { MODO_MVP: '1' } });
  const ana = await registrarSocio(c, { nombre: 'Ana Vera' });
  const bruno = await registrarSocio(c, { nombre: 'Bruno Díaz' });
  for (const cod of ['RANGO1', 'RANGO2', 'RANGO3']) await bruno.nav.post('/api/boletas/reclamar', { codigo: cod, personas: 1 });
  const k = caja(c);
  const r = await k.post('/api/caja/boletas', { folio: 'M1', monto: 150000, comensales: 5, socios: [await codigoDe(ana), await codigoDe(bruno)] });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.acreditacion.ok, true);
  assert.deepEqual(r.data.acreditacion.socios.map((x) => [x.nombre, x.pct, x.coronas]), [['Ana', 8, 2400], ['Bruno', 14, 4200]]);
  assert.equal(r.data.acreditacion.mesa.libres, 3);
  assert.equal(r.data.boleta.estado, 'reclamada');
  const yo = (await ana.nav.get('/api/me')).data;
  assert.equal(yo.saldo.disponible, 2400);
  assert.equal(yo.mesas.length, 1);
  assert.equal(yo.mesas[0].libres, 3);
  const mesa = await bruno.nav.get(`/api/mesas/${r.data.acreditacion.mesa.token}`);
  assert.equal(mesa.data.reclamadas, 2);
  const carla = await registrarSocio(c);
  assert.equal((await carla.nav.post(`/api/mesas/${r.data.acreditacion.mesa.token}/reclamar`)).data.coronas_ganadas, 2400);
  assert.equal((await carla.nav.post('/api/boletas/reclamar', { codigo: r.data.boleta.codigo, personas: 5 })).status, 409);
  await k.post('/api/caja/boletas/anular', { folio: 'M1' });
  assert.equal((await ana.nav.get('/api/me')).data.saldo.disponible, 0);
  assert.equal((await bruno.nav.get('/api/me')).data.saldo.gasto12m, 350000);
});

test('acreditar por códigos: códigos inválidos no acreditan nada y se puede reintentar con el mismo folio', async () => {
  const c = await montar({ env: { MODO_MVP: '1' } });
  const ana = await registrarSocio(c);
  const k = caja(c);
  const mala = await k.post('/api/caja/boletas', { folio: 'R1', monto: 90000, comensales: 3, socios: [await codigoDe(ana), 'ZZZZZZ'] });
  assert.equal(mala.status, 201, 'la boleta se registra igual');
  assert.equal(mala.data.acreditacion.ok, false);
  assert.equal(mala.data.acreditacion.codigo, 'socios_invalidos');
  assert.equal((await ana.nav.get('/api/me')).data.saldo.disponible, 0, 'no se acreditó nada');
  const buena = await k.post('/api/caja/boletas', { folio: 'R1', monto: 90000, comensales: 3, socios: [await codigoDe(ana)] });
  assert.equal(buena.status, 200);
  assert.equal(buena.data.acreditacion.ok, true);
  assert.equal(buena.data.acreditacion.socios[0].coronas, 2400);
  const otra = await k.post('/api/caja/boletas', { folio: 'R1', monto: 90000, comensales: 3, socios: [await codigoDe(ana)] });
  assert.equal(otra.data.acreditacion.codigo, 'boleta_ya_acreditada');
  assert.equal((await ana.nav.get('/api/me')).data.saldo.disponible, 2400, 'sin duplicar');
  const rep = await k.post('/api/caja/boletas', { folio: 'R2', monto: 30000, socios: [await codigoDe(ana), await codigoDe(ana)] });
  assert.equal(rep.data.acreditacion.ok, false);
});

test('acreditar por códigos: la mesa se ajusta a los socios y las cuentas bloqueadas no acumulan', async () => {
  const c = await montar({ env: { MODO_MVP: '1' } });
  const a = await registrarSocio(c);
  const b = await registrarSocio(c);
  const k = caja(c);
  const exceso = await k.post('/api/caja/boletas', { folio: 'E1', monto: 60000, comensales: 1, socios: [await codigoDe(a), await codigoDe(b)] });
  assert.equal(exceso.data.acreditacion.ok, true);
  assert.equal(exceso.data.acreditacion.mesa.personas, 2);
  const cb = await codigoDe(b);
  await c.db.run("UPDATE usuarios SET estado = 'bloqueado' WHERE codigo_socio = ?", [cb]);
  const bloq = await k.post('/api/caja/boletas', { folio: 'E2', monto: 60000, comensales: 2, socios: [cb] });
  assert.equal(bloq.data.acreditacion.codigo, 'socios_invalidos');
  assert.equal((await k.get(`/api/caja/socios/${cb}`)).status, 403);
});

test('regalo por código: pide la cédula y se entrega una sola vez', async () => {
  const c = await montar({ env: { MODO_MVP: '1' } });
  const s = await registrarSocio(c, { nacimiento: '1995-10-08' });
  await s.nav.post('/api/boletas/reclamar', { codigo: 'PAREJA', personas: 2 });
  const k = caja(c);
  const codigo = await codigoDe(s);
  const v = await k.get(`/api/caja/socios/${codigo}`);
  assert.equal(v.data.socio.regalo.disponible, true);
  assert.equal(v.data.socio.regalo.nacimiento, '08/10/1995');
  assert.equal((await k.post(`/api/caja/socios/${codigo}/regalo`, {})).status, 400, 'sin confirmar la cédula');
  const r = await k.post(`/api/caja/socios/${codigo}/regalo`, { cedula_verificada: true });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal((await k.post(`/api/caja/socios/${codigo}/regalo`, { cedula_verificada: true })).status, 403);
  assert.equal((await s.nav.get('/api/me')).data.regalo.motivo, 'ya_usado');
});

test('listado de socios para la integración (base actualizada por código)', async () => {
  const c = await montar({ env: { MODO_MVP: '1' } });
  const a = await registrarSocio(c, { nombre: 'Ana Vera' });
  const b = await registrarSocio(c, { nombre: 'Bruno Díaz' });
  await a.nav.post('/api/boletas/reclamar', { codigo: 'MESA5K', personas: 5 });
  const k = caja(c);
  const l = await k.get('/api/caja/socios?limite=1');
  assert.equal(l.status, 200);
  assert.equal(l.data.socios.length, 1);
  assert.equal(l.data.socios[0].codigo, await codigoDe(a));
  assert.equal(l.data.socios[0].coronas_disponibles, 2400);
  assert.ok(l.data.siguiente);
  const pag2 = await k.get(`/api/caja/socios?desde=${l.data.siguiente}`);
  assert.equal(pag2.data.socios[0].codigo, await codigoDe(b));
  assert.equal(pag2.data.siguiente, null);
  assert.ok(!JSON.stringify(l.data).includes(a.tel));
});

test('adivinar códigos de socio tiene límite por local', async () => {
  const c = await montar();
  const k = caja(c);
  const alfabeto = 'ABCDEFGHJKMNPQRSTUVWXYZ';
  let ultimo = 0;
  for (let i = 0; i < 25; i++) ultimo = (await k.get('/api/caja/socios/ABCDE' + alfabeto[i % alfabeto.length])).status;
  assert.equal(ultimo, 429);
});
