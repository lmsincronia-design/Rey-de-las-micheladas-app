import test from 'node:test';
import assert from 'node:assert/strict';
import { montar, registrarSocio, boletaNueva, staff, navegador, emitirBoleta, MIN, HORA, DIA, telefonoNuevo } from './helpers.js';
import { proximoCumple, diaChile } from '../src/lib/util.js';

/** Socio con $2.400 en coronas ya activas. */
async function socioConCoronas(c, opciones = {}) {
  const s = await registrarSocio(c, opciones);
  const r = await s.nav.post('/api/boletas/reclamar', { codigo: await boletaNueva(c, { monto: 150000 }), personas: 5 });
  assert.equal(r.status, 201);
  c.reloj.avanzar(25 * HORA);
  return s;
}
const canjear = (s, monto) => s.nav.post('/api/canjes', { monto });

test('las coronas de la misma visita no se pueden canjear: el cliente tiene que volver', async () => {
  const c = await montar();
  const s = await registrarSocio(c);
  await s.nav.post('/api/boletas/reclamar', { codigo: await boletaNueva(c, { monto: 150000 }), personas: 5 });
  const r = await canjear(s, 1000);
  assert.equal(r.status, 400);
  assert.equal(r.data.error.codigo, 'saldo_insuficiente');
  assert.equal(r.data.error.disponible, 0);
  assert.equal(r.data.error.por_activar, 2400);
  assert.equal(r.data.error.proxima_activacion, c.reloj.t + 24 * HORA);
  assert.match(r.data.error.mensaje, /24 horas/);
  c.reloj.avanzar(23 * HORA + 59 * MIN);
  assert.equal((await canjear(s, 1000)).status, 400);
  c.reloj.avanzar(2 * MIN);
  assert.equal((await canjear(s, 1000)).status, 201);
});

test('crear una ficha reserva las coronas y la ficha dura 10 minutos', async () => {
  const c = await montar();
  const s = await socioConCoronas(c);
  const r = await canjear(s, 1000);
  assert.equal(r.status, 201);
  assert.match(r.data.ficha.codigo, /^[A-HJKMNP-Z2-9]{6}$/);
  assert.equal(r.data.ficha.monto, 1000);
  assert.equal(r.data.ficha.estado, 'reservada');
  assert.equal(r.data.ficha.restante_seg, 600);
  const yo = await s.nav.get('/api/me');
  assert.equal(yo.data.saldo.disponible, 1400);
  assert.equal(yo.data.ficha_activa.codigo, r.data.ficha.codigo);
  c.reloj.avanzar(4 * MIN);
  assert.equal((await s.nav.get('/api/me')).data.ficha_activa.restante_seg, 360);
});

test('validaciones del monto a canjear', async () => {
  const c = await montar();
  const s = await socioConCoronas(c);
  for (const m of [0, 500, 999, 1250, 1001, 21000, 25000, -1000, 'abc', null, undefined, 1500.5, '1e3']) {
    const r = await canjear(s, m);
    assert.equal(r.status, 400, String(m));
    assert.equal(r.data.error.codigo, 'monto_invalido', String(m));
  }
  assert.equal((await canjear(s, 2500)).data.error.codigo, 'saldo_insuficiente', 'más de lo que tiene');
  assert.equal((await canjear(s, '1500')).status, 201, 'un número como texto también vale');
  assert.equal((await s.nav.get('/api/me')).data.saldo.disponible, 900);
});

test('solo una ficha activa a la vez; cancelar devuelve las coronas', async () => {
  const c = await montar();
  const s = await socioConCoronas(c);
  assert.equal((await canjear(s, 1000)).status, 201);
  const otra = await canjear(s, 1000);
  assert.equal(otra.status, 409);
  assert.equal(otra.data.error.codigo, 'ficha_activa');
  assert.equal((await s.nav.get('/api/me')).data.saldo.disponible, 1400);
  assert.equal((await s.nav.post('/api/canjes/cancelar')).status, 200);
  assert.equal((await s.nav.get('/api/me')).data.saldo.disponible, 2400);
  assert.equal((await s.nav.post('/api/canjes/cancelar')).status, 404);
  assert.equal((await canjear(s, 2000)).status, 201, 'cancelar no gasta el cupo diario');
  const hist = await s.nav.get('/api/me/fichas');
  assert.deepEqual(hist.data.fichas.map((f) => f.estado), ['reservada', 'cancelada']);
});

test('una ficha vencida devuelve las coronas sola', async () => {
  const c = await montar();
  const s = await socioConCoronas(c);
  await canjear(s, 1000);
  c.reloj.avanzar(10 * MIN + 1000);
  const yo = await s.nav.get('/api/me');
  assert.equal(yo.data.ficha_activa, null);
  assert.equal(yo.data.saldo.disponible, 2400);
  await s.nav.get('/api/me');
  assert.equal((await c.db.get("SELECT COUNT(*) AS n FROM movimientos WHERE tipo = 'liberacion'")).n, 1, 'devuelve una sola vez');
  assert.equal((await s.nav.get('/api/me/fichas')).data.fichas[0].estado, 'vencida');
  assert.equal((await canjear(s, 1000)).status, 201);
});

test('la caja ve la ficha y la aplica a la cuenta: queda usada una sola vez', async () => {
  const c = await montar();
  const s = await socioConCoronas(c, { nombre: 'Camila Rojas' });
  const f = (await canjear(s, 1500)).data.ficha;
  const nav = navegador(c.app);
  assert.equal((await nav.get(`/api/caja/fichas/${f.codigo}`)).status, 401);
  const caja = await staff(c, 'REY-IV');
  const v = await caja.get(`/api/caja/fichas/${f.codigo.toLowerCase()}`);
  assert.equal(v.status, 200);
  assert.equal(v.data.ficha.monto, 1500);
  assert.equal(v.data.ficha.cliente.nombre, 'Camila');
  assert.equal(v.data.ficha.cliente.rango, 'Plebeyo');
  assert.equal(v.data.ficha.pedir_cedula, false);
  assert.equal((await caja.get('/api/caja/fichas/XX')).status, 400);
  assert.equal((await caja.get('/api/caja/fichas/ZZZZZZ')).status, 404);

  const a = await caja.post(`/api/caja/fichas/${f.codigo}/aplicar`, {});
  assert.equal(a.status, 200);
  assert.equal(a.data.ficha.estado, 'usada');
  assert.equal(a.data.ficha.monto_aplicado, 1500);
  const otra = await caja.post(`/api/caja/fichas/${f.codigo}/aplicar`, {});
  assert.equal(otra.status, 409);
  assert.equal(otra.data.error.codigo, 'ficha_usada');
  const yo = await s.nav.get('/api/me');
  assert.equal(yo.data.saldo.disponible, 900);
  assert.equal(yo.data.ficha_activa, null);
  assert.equal(yo.data.reglas.canjes_hoy, 1);
  assert.equal((await c.db.get('SELECT local_id FROM fichas WHERE codigo = ?', [f.codigo])).local_id, 3, 'queda registrado en qué local se usó');
  // la ficha usada ya no se puede cancelar ni liberar
  c.reloj.avanzar(HORA);
  assert.equal((await s.nav.get('/api/me')).data.saldo.disponible, 900);
  assert.equal((await s.nav.post('/api/canjes/cancelar')).status, 404);
});

test('máximo un canje por día (reservado o usado)', async () => {
  const c = await montar();
  const s = await socioConCoronas(c);
  const f = (await canjear(s, 1000)).data.ficha;
  const caja = await staff(c);
  await caja.post(`/api/caja/fichas/${f.codigo}/aplicar`, {});
  const otra = await canjear(s, 1000);
  assert.equal(otra.status, 429);
  assert.equal(otra.data.error.codigo, 'limite_canjes');
  c.reloj.avanzar(DIA); // al día siguiente (hora de Chile)
  assert.equal((await canjear(s, 1000)).status, 201);
});

test('descuento menor al reservado: la diferencia vuelve al saldo', async () => {
  const c = await montar();
  const s = await socioConCoronas(c);
  const f = (await canjear(s, 2000)).data.ficha;
  const caja = await staff(c);
  for (const mal of [2500, -1, 1.5, 'x']) {
    const r = await caja.post(`/api/caja/fichas/${f.codigo}/aplicar`, { monto_aplicado: mal });
    assert.equal(r.status, 400, String(mal));
  }
  const ok = await caja.post(`/api/caja/fichas/${f.codigo}/aplicar`, { monto_aplicado: 600 });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.ficha.monto_aplicado, 600);
  assert.equal((await s.nav.get('/api/me')).data.saldo.disponible, 2400 - 2000 + 1400);
  assert.equal((await c.db.get("SELECT COUNT(*) AS n FROM movimientos WHERE tipo = 'uso_dif'")).n, 1);
});

test('la caja tiene 2 minutos de tolerancia si la ficha venció mientras el cliente no abría la app', async () => {
  const c = await montar();
  const s = await socioConCoronas(c);
  const f = (await canjear(s, 1000)).data.ficha;
  const caja = await staff(c);
  c.reloj.avanzar(11 * MIN); // venció hace 1 minuto, dentro de la tolerancia
  const ok = await caja.post(`/api/caja/fichas/${f.codigo}/aplicar`, {});
  assert.equal(ok.status, 200);
  c.reloj.avanzar(DIA);
  const f2 = (await canjear(s, 1000)).data.ficha;
  const caja2 = await staff(c); // la sesión de la caja dura 12 horas
  c.reloj.avanzar(13 * MIN); // pasó la tolerancia
  const tarde = await caja2.post(`/api/caja/fichas/${f2.codigo}/aplicar`, {});
  assert.equal(tarde.status, 410);
  assert.equal(tarde.data.error.codigo, 'ficha_vencida');
  assert.equal((await s.nav.get('/api/me')).data.saldo.disponible, 1400, 'las coronas de la ficha vencida volvieron');
});

test('si el cliente abre la app después del vencimiento, la ficha ya no sirve para la caja', async () => {
  const c = await montar();
  const s = await socioConCoronas(c);
  const f = (await canjear(s, 1000)).data.ficha;
  c.reloj.avanzar(10 * MIN + 30 * 1000);
  await s.nav.get('/api/me'); // libera
  const caja = await staff(c);
  const r = await caja.post(`/api/caja/fichas/${f.codigo}/aplicar`, {});
  assert.equal(r.status, 410);
  assert.equal(r.data.error.codigo, 'ficha_no_vigente');
  assert.equal((await s.nav.get('/api/me')).data.saldo.disponible, 2400, 'sin doble descuento');
});

test('la integración de la caja aplica la ficha al emitir la boleta con el descuento', async () => {
  const c = await montar();
  const s = await socioConCoronas(c);
  const f = (await canjear(s, 1000)).data.ficha;
  const r = await emitirBoleta(c, 'REY-XI', { folio: 'D1', monto: 20000, canje_codigo: f.codigo });
  assert.equal(r.status, 201);
  assert.equal(r.data.canje.ok, true);
  assert.equal(r.data.canje.ficha.estado, 'usada');
  assert.equal((await c.db.get('SELECT canje_ficha_id FROM boletas WHERE folio = ?', ['D1'])).canje_ficha_id > 0, true);
  // reenviar la misma boleta no vuelve a aplicar la ficha
  const rep = await emitirBoleta(c, 'REY-XI', { folio: 'D1', monto: 20000, canje_codigo: f.codigo });
  assert.equal(rep.status, 200);
  assert.equal(rep.data.canje.ok, false);
  assert.equal(rep.data.canje.codigo, 'ficha_usada');
  assert.equal((await s.nav.get('/api/me')).data.saldo.disponible, 1400);
  // un código de canje inválido no impide registrar la boleta
  const mala = await emitirBoleta(c, 'REY-XI', { folio: 'D2', monto: 9000, canje_codigo: 'ZZZZZZ' });
  assert.equal(mala.status, 201);
  assert.equal(mala.data.canje.ok, false);
  assert.equal(mala.data.canje.codigo, 'ficha_no_encontrada');
});

test('si se anula la boleta que llevaba el descuento, las coronas vuelven', async () => {
  const c = await montar();
  const s = await socioConCoronas(c);
  const f = (await canjear(s, 1500)).data.ficha;
  await emitirBoleta(c, 'REY-XI', { folio: 'D9', monto: 20000, canje_codigo: f.codigo });
  assert.equal((await s.nav.get('/api/me')).data.saldo.disponible, 900);
  const caja = await staff(c, 'REY-XI');
  assert.equal((await caja.post('/api/caja/boletas/anular', { folio: 'D9' })).status, 200);
  assert.equal((await s.nav.get('/api/me')).data.saldo.disponible, 2400);
  assert.equal((await s.nav.get('/api/me/fichas')).data.fichas[0].estado, 'revertida');
  await caja.post('/api/caja/boletas/anular', { folio: 'D9' });
  assert.equal((await s.nav.get('/api/me')).data.saldo.disponible, 2400, 'no se devuelve dos veces');
});

test('carreras: no se puede gastar dos veces el mismo saldo', async () => {
  const c = await montar();
  const s = await socioConCoronas(c);
  const rs = await Promise.all([canjear(s, 1500), canjear(s, 1500), canjear(s, 1500)]);
  assert.equal(rs.filter((r) => r.status === 201).length, 1);
  assert.equal((await s.nav.get('/api/me')).data.saldo.disponible, 900);
  assert.equal((await c.db.get("SELECT COUNT(*) AS n FROM fichas WHERE estado = 'reservada'")).n, 1);

  // aplicar la misma ficha desde dos cajas a la vez: una sola gana
  const f = (await s.nav.get('/api/me')).data.ficha_activa;
  const c1 = await staff(c, 'REY-X');
  const c2 = await staff(c, 'REY-IV');
  const ap = await Promise.all([c1.post(`/api/caja/fichas/${f.codigo}/aplicar`, {}), c2.post(`/api/caja/fichas/${f.codigo}/aplicar`, {})]);
  assert.deepEqual(ap.map((r) => r.status).sort(), [200, 409]);
});

test('cuentas bloqueadas o eliminadas no pueden canjear', async () => {
  const c = await montar();
  const s = await socioConCoronas(c);
  await c.db.run("UPDATE usuarios SET estado = 'bloqueado'");
  assert.equal((await canjear(s, 1000)).status, 403);
});

/* ───────────── Regalo de cumpleaños ───────────── */

async function socioCumple(c, nacimiento = '1995-10-10', { visitas = 2, antiguedad = 40 } = {}) {
  const s = await registrarSocio(c, { nacimiento });
  await c.db.run('UPDATE usuarios SET creado_en = ?', [c.reloj.t - antiguedad * DIA]);
  for (let i = 0; i < visitas; i++) {
    const r = await s.nav.post('/api/boletas/reclamar', { codigo: await boletaNueva(c, { monto: 20000 }), personas: 2 });
    assert.equal(r.status, 201);
    await c.db.run('UPDATE mesas SET dia = ? WHERE id = (SELECT MAX(id) FROM mesas)', [`2026-09-${10 + i}`]);
  }
  return s;
}

test('regalo de cumpleaños: disponible en la semana del cumpleaños con requisitos cumplidos', async () => {
  const c = await montar(); // hoy: 8 de octubre
  const s = await socioCumple(c, '1995-10-10');
  const yo = await s.nav.get('/api/me');
  assert.equal(yo.data.regalo.disponible, true);
  const r = await s.nav.post('/api/regalo');
  assert.equal(r.status, 201);
  assert.equal(r.data.ficha.tipo, 'regalo');
  assert.equal(r.data.ficha.monto, 0);
  assert.equal(r.data.ficha.descripcion, 'Una michelada gratis');
  const caja = await staff(c);
  const v = await caja.get(`/api/caja/fichas/${r.data.ficha.codigo}`);
  assert.equal(v.data.ficha.pedir_cedula, true);
  assert.equal((await caja.post(`/api/caja/fichas/${r.data.ficha.codigo}/aplicar`, {})).status, 200);
  assert.equal((await s.nav.get('/api/me')).data.regalo.motivo, 'ya_usado');
  const otra = await s.nav.post('/api/regalo');
  assert.equal(otra.status, 403);
  assert.equal(otra.data.error.motivo, 'ya_usado');
});

test('regalo: una ficha vencida se puede volver a pedir, pero no dos activas ni con un canje abierto', async () => {
  const c = await montar();
  const s = await socioCumple(c);
  const a = await s.nav.post('/api/regalo');
  assert.equal(a.status, 201);
  assert.equal((await s.nav.post('/api/regalo')).status, 409);
  c.reloj.avanzar(11 * MIN);
  const b = await s.nav.post('/api/regalo');
  assert.equal(b.status, 201);
  assert.notEqual(b.data.ficha.codigo, a.data.ficha.codigo);
});

test('regalo: reglas de elegibilidad (fecha, antigüedad, visitas)', async () => {
  const fuera = await montar();
  const s1 = await socioCumple(fuera, '1995-03-20');
  assert.equal((await s1.nav.get('/api/me')).data.regalo.motivo, 'fuera_de_fecha');
  assert.equal((await s1.nav.post('/api/regalo')).status, 403);

  const nuevo = await montar();
  const s2 = await socioCumple(nuevo, '1995-10-10', { antiguedad: 5 });
  assert.equal((await s2.nav.get('/api/me')).data.regalo.motivo, 'registro_reciente');

  const pocas = await montar();
  const s3 = await socioCumple(pocas, '1995-10-10', { visitas: 1 });
  const m3 = (await s3.nav.get('/api/me')).data.regalo;
  assert.equal(m3.motivo, 'pocas_visitas');
  assert.equal(m3.visitas, 1);

  // bordes de la ventana: 3 días antes sí, 4 días antes no; 7 días después sí, 8 no
  for (const [nac, esperado] of [['1995-10-11', true], ['1995-10-12', false], ['1995-10-01', true], ['1995-09-30', false]]) {
    const c = await montar();
    const s = await socioCumple(c, nac);
    assert.equal((await s.nav.get('/api/me')).data.regalo.disponible, esperado, nac);
  }
});

test('regalo para quien cumple el 29 de febrero y cumpleaños cerca del cambio de año', async () => {
  assert.equal(diaChile(proximoCumple('2000-02-29', Date.parse('2026-02-27T15:00:00Z')).ms), '2026-02-28');
  assert.equal(diaChile(proximoCumple('2000-02-29', Date.parse('2028-03-01T15:00:00Z')).ms), '2028-02-29');
  const dic = proximoCumple('1990-01-02', Date.parse('2026-12-30T15:00:00Z'));
  assert.equal(dic.anio, 2027, 'el cumpleaños de enero cae en el año que viene');
});
