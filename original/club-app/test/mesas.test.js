import test from 'node:test';
import assert from 'node:assert/strict';
import { montar, registrarSocio, boletaNueva, staff, navegador, telefonoNuevo, MIN, HORA, DIA } from './helpers.js';

const reclamar = (s, codigo, personas, extra = {}) => s.nav.post('/api/boletas/reclamar', { codigo, personas, ...extra });

async function mesaDe(c, pagador, { monto = 150000, personas = 5, amigos } = {}) {
  const codigo = await boletaNueva(c, { monto });
  const r = await reclamar(pagador, codigo, personas, amigos ? { amigos } : {});
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return { codigo, token: r.data.mesa.token };
}

test('el enlace de la mesa es público pero solo muestra lo necesario', async () => {
  const c = await montar();
  const camila = await registrarSocio(c, { nombre: 'Camila Rojas' });
  const { token } = await mesaDe(c, camila);
  const anon = navegador(c.app);
  const r = await anon.get(`/api/mesas/${token}`);
  assert.equal(r.status, 200);
  assert.equal(r.data.pagador, 'Camila');
  assert.equal(r.data.personas, 5);
  assert.equal(r.data.parte, 30000);
  assert.equal(r.data.libres, 4);
  assert.equal(r.data.reclamadas, 1);
  assert.equal(r.data.yo, null);
  const txt = JSON.stringify(r.data);
  assert.ok(!txt.includes('Rojas') && !txt.includes(camila.tel), 'sin apellido ni teléfono');
  assert.equal((await anon.get('/api/mesas/inexistente1')).status, 404);
  assert.equal((await anon.get('/api/mesas/%00%00')).status, 404);
  assert.equal((await anon.get('/api/mesas/' + 'x'.repeat(100))).status, 404);
});

test('los amigos reclaman su parte por el enlace y cada uno recibe la suya', async () => {
  const c = await montar();
  const camila = await registrarSocio(c);
  const { token } = await mesaDe(c, camila);
  const amigos = [];
  for (let i = 0; i < 4; i++) amigos.push(await registrarSocio(c));
  for (const [i, a] of amigos.entries()) {
    const vista = await a.nav.get(`/api/mesas/${token}`);
    assert.equal(vista.data.yo.ya_reclamo, false);
    assert.equal(vista.data.libres, 4 - i);
    assert.equal(vista.data.coronas_estimadas, 2400);
    const r = await a.nav.post(`/api/mesas/${token}/reclamar`);
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.coronas_ganadas, 2400);
    assert.equal(r.data.gasto_sumado, 30000);
    assert.equal(r.data.pagador, 'Camila');
    const yo = await a.nav.get('/api/me');
    assert.equal(yo.data.saldo.por_activar, 2400);
    assert.equal(yo.data.rango.gasto, 30000);
    const otra = await a.nav.post(`/api/mesas/${token}/reclamar`);
    assert.equal(otra.status, 409);
    assert.equal(otra.data.error.codigo, 'ya_en_mesa');
  }
  const final = await navegador(c.app).get(`/api/mesas/${token}`);
  assert.equal(final.data.libres, 0);
  assert.equal(final.data.reclamadas, 5);
  // un sexto no cabe
  const extra = await registrarSocio(c);
  const r = await extra.nav.post(`/api/mesas/${token}/reclamar`);
  assert.equal(r.status, 409);
  assert.equal(r.data.error.codigo, 'mesa_llena');
  // el total repartido nunca supera lo que corresponde a la cuenta
  const total = await c.db.get("SELECT SUM(coronas) AS n, SUM(gasto) AS g FROM movimientos WHERE tipo = 'compra'");
  assert.equal(total.n, 2400 * 5);
  assert.equal(total.g, 150000);
});

test('quien pagó no puede reclamar otra parte de su propia mesa; sin sesión pide ingresar', async () => {
  const c = await montar();
  const camila = await registrarSocio(c);
  const { token } = await mesaDe(c, camila);
  const r = await camila.nav.post(`/api/mesas/${token}/reclamar`);
  assert.equal(r.status, 409);
  assert.equal(r.data.error.codigo, 'eres_el_pagador');
  assert.equal((await navegador(c.app).post(`/api/mesas/${token}/reclamar`)).status, 401);
  const vista = await camila.nav.get(`/api/mesas/${token}`);
  assert.equal(vista.data.yo.es_pagador, true);
  assert.equal((await camila.nav.post('/api/mesas/inexistente1/reclamar')).status, 404);
});

test('el enlace vence a las 48 horas', async () => {
  const c = await montar();
  const camila = await registrarSocio(c);
  const { token } = await mesaDe(c, camila);
  const amigo = await registrarSocio(c);
  c.reloj.avanzar(47 * HORA);
  assert.equal((await amigo.nav.get(`/api/mesas/${token}`)).data.expirada, false);
  c.reloj.avanzar(HORA + MIN);
  const v = await amigo.nav.get(`/api/mesas/${token}`);
  assert.equal(v.data.expirada, true);
  const r = await amigo.nav.post(`/api/mesas/${token}/reclamar`);
  assert.equal(r.status, 410);
  assert.equal(r.data.error.codigo, 'mesa_vencida');
  assert.equal((await c.db.get('SELECT COUNT(*) AS n FROM movimientos WHERE usuario_id = 2')).n, 0);
});

test('amigos asignados por teléfono: ven su parte pendiente sin abrir el enlace', async () => {
  const c = await montar();
  const camila = await registrarSocio(c);
  const fran = await registrarSocio(c, { nombre: 'Fran Soto' });
  const intruso = await registrarSocio(c);
  const { token } = await mesaDe(c, camila, { personas: 3, monto: 150000, amigos: [{ telefono: fran.tel, etiqueta: 'Fran' }, { telefono: telefonoNuevo(), etiqueta: 'Otro' }] });

  const yo = await fran.nav.get('/api/me');
  assert.equal(yo.data.pendientes.length, 1);
  assert.equal(yo.data.pendientes[0].pagador, 'Camila');
  assert.equal(yo.data.pendientes[0].coronas_estimadas, 4000);
  assert.equal(yo.data.pendientes[0].token, token);
  assert.equal((await intruso.nav.get('/api/me')).data.pendientes.length, 0);

  // las partes que quedan están reservadas para esos amigos: un tercero no las puede tomar
  const r = await intruso.nav.post(`/api/mesas/${token}/reclamar`);
  assert.equal(r.status, 409);
  assert.match(r.data.error.mensaje, /reservados/);

  const ok = await fran.nav.post(`/api/mesas/${token}/reclamar`);
  assert.equal(ok.status, 200);
  assert.equal(ok.data.coronas_ganadas, 4000);
  assert.equal((await fran.nav.get('/api/me')).data.pendientes.length, 0);
});

test('un amigo asignado que se registra después igual ve su parte (antes de las 48 h)', async () => {
  const c = await montar();
  const camila = await registrarSocio(c);
  const telFutura = telefonoNuevo();
  const { token } = await mesaDe(c, camila, { personas: 5, amigos: [{ telefono: telFutura, etiqueta: 'Pedro' }] });
  c.reloj.avanzar(20 * HORA);
  const pedro = await registrarSocio(c, { tel: telFutura, nombre: 'Pedro Soto' });
  const yo = await pedro.nav.get('/api/me');
  assert.equal(yo.data.pendientes.length, 1, 'la parte lo esperaba');
  assert.equal((await pedro.nav.post(`/api/mesas/${token}/reclamar`)).status, 200);
  assert.equal((await pedro.nav.get('/api/me')).data.saldo.por_activar, 2400);
});

test('pendientes vencidos no se muestran', async () => {
  const c = await montar();
  const camila = await registrarSocio(c);
  const fran = await registrarSocio(c);
  await mesaDe(c, camila, { personas: 3, amigos: [{ telefono: fran.tel, etiqueta: 'Fran' }] });
  c.reloj.avanzar(49 * HORA);
  assert.equal((await fran.nav.get('/api/me')).data.pendientes.length, 0);
});

test('carrera por el último lugar: con 2 lugares y 5 personas, entran solo 2', async () => {
  const c = await montar();
  const camila = await registrarSocio(c);
  const { token } = await mesaDe(c, camila, { personas: 3, monto: 90000 });
  const amigos = [];
  for (let i = 0; i < 5; i++) amigos.push(await registrarSocio(c));
  const rs = await Promise.all(amigos.map((a) => a.nav.post(`/api/mesas/${token}/reclamar`)));
  assert.equal(rs.filter((r) => r.status === 200).length, 2, JSON.stringify(rs.map((r) => r.status)));
  assert.equal(rs.filter((r) => r.status === 409).length, 3);
  assert.equal((await c.db.get("SELECT COUNT(*) AS n FROM partes WHERE estado = 'reclamada'")).n, 3);
  assert.equal((await c.db.get("SELECT COUNT(*) AS n FROM movimientos WHERE tipo = 'compra'")).n, 3);
});

test('la misma persona reclamando su parte dos veces a la vez: una sola', async () => {
  const c = await montar();
  const camila = await registrarSocio(c);
  const { token } = await mesaDe(c, camila);
  const a = await registrarSocio(c);
  const rs = await Promise.all([1, 2, 3].map(() => a.nav.post(`/api/mesas/${token}/reclamar`)));
  assert.equal(rs.filter((r) => r.status === 200).length, 1);
  assert.equal((await c.db.get('SELECT COUNT(*) AS n FROM movimientos WHERE usuario_id = 2')).n, 1);
});

test('límite de partes ajenas por día (anti granja de cuentas)', async () => {
  const c = await montar();
  const a = await registrarSocio(c);
  const tokens = [];
  for (let i = 0; i < 4; i++) {
    const p = await registrarSocio(c);
    tokens.push((await mesaDe(c, p)).token);
  }
  for (let i = 0; i < 3; i++) assert.equal((await a.nav.post(`/api/mesas/${tokens[i]}/reclamar`)).status, 200);
  const cuarta = await a.nav.post(`/api/mesas/${tokens[3]}/reclamar`);
  assert.equal(cuarta.status, 429);
  assert.equal(cuarta.data.error.codigo, 'limite_partes');
  c.reloj.avanzar(DIA + MIN);
  assert.equal((await a.nav.post(`/api/mesas/${tokens[3]}/reclamar`)).status, 200);
});

test('el personal tampoco puede reclamar partes', async () => {
  const c = await montar();
  const camila = await registrarSocio(c);
  const { token } = await mesaDe(c, camila);
  const garzon = await registrarSocio(c);
  await c.db.run('UPDATE usuarios SET es_personal = 1 WHERE id = 2');
  const r = await garzon.nav.post(`/api/mesas/${token}/reclamar`);
  assert.equal(r.status, 403);
});

test('si se anula la boleta: se revierten coronas y rango, y el enlace deja de servir', async () => {
  const c = await montar();
  const camila = await registrarSocio(c);
  const { token } = await mesaDe(c, camila);
  const amigo = await registrarSocio(c);
  assert.equal((await amigo.nav.post(`/api/mesas/${token}/reclamar`)).status, 200);
  c.reloj.avanzar(25 * HORA);
  assert.equal((await camila.nav.get('/api/me')).data.saldo.disponible, 2400);

  const caja = await staff(c);
  const lista = await caja.get('/api/caja/boletas?dia=2026-10-08');
  const folio = lista.data.boletas[0].folio;
  assert.equal((await caja.post('/api/caja/boletas/anular', { folio })).status, 200);

  const yo = await camila.nav.get('/api/me');
  assert.equal(yo.data.saldo.disponible, 0);
  assert.equal(yo.data.rango.gasto, 0);
  assert.equal((await amigo.nav.get('/api/me')).data.saldo.por_activar, 0);
  const movs = await camila.nav.get('/api/me/movimientos');
  assert.equal(movs.data.movimientos[0].tipo, 'reversa');
  const otro = await registrarSocio(c);
  const r = await otro.nav.post(`/api/mesas/${token}/reclamar`);
  assert.equal(r.status, 410);
  assert.equal((await navegador(c.app).get(`/api/mesas/${token}`)).data.anulada, true);
  // anular dos veces no revierte dos veces
  await caja.post('/api/caja/boletas/anular', { folio });
  assert.equal((await c.db.get("SELECT COUNT(*) AS n FROM movimientos WHERE tipo = 'reversa'")).n, 2);
});

test('la mesa del pagador muestra cuántos lugares quedan', async () => {
  const c = await montar();
  const camila = await registrarSocio(c);
  const { token } = await mesaDe(c, camila, { personas: 5, amigos: [{ telefono: telefonoNuevo(), etiqueta: 'A' }] });
  const a = await registrarSocio(c);
  await a.nav.post(`/api/mesas/${token}/reclamar`);
  const yo = await camila.nav.get('/api/me');
  const m = yo.data.mesas[0];
  assert.equal(m.token, token);
  assert.equal(m.reclamadas, 2);
  assert.equal(m.libres, 2);
  assert.equal(m.asignadas, 1);
  assert.equal(m.vigente, true);
  c.reloj.avanzar(49 * HORA);
  assert.equal((await camila.nav.get('/api/me')).data.mesas[0].vigente, false);
});
