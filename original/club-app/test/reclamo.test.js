import test from 'node:test';
import assert from 'node:assert/strict';
import { montar, registrarSocio, boletaNueva, staff, telefonoNuevo, reingresar, MIN, HORA, DIA } from './helpers.js';

const reclamar = (s, codigo, personas, extra = {}) => s.nav.post('/api/boletas/reclamar', { codigo, personas, ...extra });

test('camino feliz: boleta de $150.000 con 5 personas', async () => {
  const c = await montar();
  const camila = await registrarSocio(c);
  const codigo = await boletaNueva(c, { monto: 150000 });
  const r = await reclamar(camila, codigo, 5);
  assert.equal(r.status, 201);
  assert.equal(r.data.coronas_ganadas, 2400); // 30.000 x 8%
  assert.equal(r.data.gasto_sumado, 30000);
  assert.equal(r.data.mesa.personas, 5);
  assert.equal(r.data.mesa.libres, 4);
  assert.equal(r.data.rango.nombre, 'Plebeyo');
  assert.equal(r.data.ascendio, false);
  assert.equal(r.data.saldo.disponible, 0);
  assert.equal(r.data.saldo.por_activar, 2400);
  assert.equal(r.data.disponibles_desde, c.reloj.t + 24 * HORA);

  const yo = await camila.nav.get('/api/me');
  assert.equal(yo.data.saldo.por_activar, 2400);
  assert.equal(yo.data.mesas.length, 1);
  assert.equal(yo.data.mesas[0].libres, 4);
  assert.equal(yo.data.rango.gasto, 30000);
  assert.equal(yo.data.rango.siguiente.nombre, 'Comerciante');
  assert.equal(yo.data.rango.siguiente.falta, 20000);

  // las coronas de esta visita NO se pueden usar en la misma visita: se activan a las 24 horas
  c.reloj.avanzar(23 * HORA);
  assert.equal((await camila.nav.get('/api/me')).data.saldo.disponible, 0);
  c.reloj.avanzar(HORA + 1000);
  const luego = await camila.nav.get('/api/me');
  assert.equal(luego.data.saldo.disponible, 2400);
  assert.equal(luego.data.saldo.por_activar, 0);
  const movs = await camila.nav.get('/api/me/movimientos');
  assert.equal(movs.data.movimientos[0].coronas, 2400);
});

test('el código se acepta en minúsculas, con espacios o con guion', async () => {
  const c = await montar();
  const s = await registrarSocio(c);
  const codigo = await boletaNueva(c, { monto: 12000 });
  const r = await reclamar(s, ` ${codigo.slice(0, 3).toLowerCase()} - ${codigo.slice(3).toLowerCase()} `, 2);
  assert.equal(r.status, 201);
});

test('errores de código: formato, inexistente, repetido, de otro, vencido', async () => {
  const c = await montar();
  const a = await registrarSocio(c);
  const b = await registrarSocio(c);
  for (const mal of ['', 'ABC', 'ABCDEFG', 'ABC0EF', 'ABCOEF', 'ABCIEF', 'ABCLEF', 'AB-1-EF', 123456, null]) {
    const r = await reclamar(a, mal, 2);
    assert.equal(r.status, 400, String(mal));
    assert.equal(r.data.error.codigo, 'codigo_invalido', String(mal));
  }
  assert.equal((await reclamar(a, 'ZZZZZZ', 2)).data.error.codigo, 'codigo_no_encontrado');

  const codigo = await boletaNueva(c, { monto: 20000 });
  assert.equal((await reclamar(a, codigo, 2)).status, 201);
  const otra = await reclamar(a, codigo, 2);
  assert.equal(otra.status, 409);
  assert.equal(otra.data.error.codigo, 'ya_reclamaste');
  assert.ok(otra.data.error.mesa);
  const deB = await reclamar(b, codigo, 2);
  assert.equal(deB.status, 409);
  assert.equal(deB.data.error.codigo, 'boleta_ya_usada');

  const vieja = await boletaNueva(c, { monto: 20000 });
  c.reloj.avanzar(24 * HORA + MIN);
  const v = await reclamar(b, vieja, 2);
  assert.equal(v.status, 410);
  assert.equal(v.data.error.codigo, 'boleta_vencida');

  const justo = await boletaNueva(c, { monto: 20000 });
  c.reloj.avanzar(23 * HORA + 59 * MIN);
  assert.equal((await reclamar(b, justo, 2)).status, 201, 'a 23 h 59 min todavía vale');
});

test('sin sesión no se puede reclamar', async () => {
  const c = await montar();
  const codigo = await boletaNueva(c);
  const { navegador } = await import('./helpers.js');
  const r = await navegador(c.app).post('/api/boletas/reclamar', { codigo, personas: 2 });
  assert.equal(r.status, 401);
});

test('cantidad de personas: acotada por el monto de la boleta', async () => {
  const c = await montar();
  const s = await registrarSocio(c);
  // $150.000: mínimo 3 personas (máx. $60.000 c/u) y máximo 20
  const codigo = await boletaNueva(c, { monto: 150000 });
  for (const [p, cod] of [[1, 'personas_fuera_de_rango'], [2, 'personas_fuera_de_rango'], [0, 'personas_invalidas'], [-1, 'personas_invalidas'], [21, 'personas_invalidas'], ['muchas', 'personas_invalidas'], [2.5, 'personas_invalidas'], [undefined, 'personas_invalidas']]) {
    const r = await reclamar(s, codigo, p);
    assert.equal(r.status, 400, String(p));
    assert.equal(r.data.error.codigo, cod, String(p));
  }
  const r = await reclamar(s, codigo, 3);
  assert.equal(r.status, 201);
  assert.equal(r.data.gasto_sumado, 50000);

  // $12.000: máximo 2 personas (mínimo $6.000 c/u)
  const chica = await boletaNueva(c, { monto: 12000 });
  const mal = await reclamar(s, chica, 3);
  assert.equal(mal.data.error.codigo, 'personas_fuera_de_rango');
  assert.equal(mal.data.error.max, 2);
  // una michelada sola ($2.990) siempre cabe como 1 persona
  const una = await boletaNueva(c, { monto: 2990 });
  const ok = await reclamar(s, una, 1);
  assert.equal(ok.status, 201);
  assert.equal(ok.data.coronas_ganadas, 299); // ya es Comerciante (10%) tras la boleta de 50.000
});

test('si la caja informa los comensales, la persona no puede declarar otra cantidad', async () => {
  const c = await montar();
  const s = await registrarSocio(c);
  const codigo = await boletaNueva(c, { monto: 150000, comensales: 5 });
  const mal = await reclamar(s, codigo, 3);
  assert.equal(mal.status, 400);
  assert.equal(mal.data.error.codigo, 'personas_no_coinciden');
  assert.equal(mal.data.error.comensales, 5);
  assert.equal((await reclamar(s, codigo, 5)).status, 201);
});

test('el tope de coronas por persona limita el premio de una boleta', async () => {
  const c = await montar();
  await c.db.run("INSERT INTO config (clave, valor) VALUES ('club', ?)", [JSON.stringify({ tope_coronas_por_persona: 1000 })]);
  const s = await registrarSocio(c);
  const codigo = await boletaNueva(c, { monto: 150000 });
  const r = await reclamar(s, codigo, 3); // 50.000 x 8% = 4.000 -> tope 1.000
  assert.equal(r.data.coronas_ganadas, 1000);
  assert.equal(r.data.gasto_sumado, 50000, 'el gasto para el rango no se recorta');
});

test('amigos asignados por teléfono: validaciones', async () => {
  const c = await montar();
  const s = await registrarSocio(c);
  const amigo = (t, e) => ({ telefono: t, etiqueta: e });
  const intentar = async (amigos, personas = 5) => reclamar(s, await boletaNueva(c, { monto: 150000 }), personas, { amigos });
  assert.equal((await intentar([amigo('basura')])).data.error.codigo, 'amigo_telefono_invalido');
  assert.equal((await intentar([amigo(`+56${s.tel}`)])).data.error.codigo, 'amigo_repetido', 'no puede agregarse a sí mismo');
  const t = telefonoNuevo();
  assert.equal((await intentar([amigo(t), amigo(`+56 ${t}`)])).data.error.codigo, 'amigo_repetido');
  assert.equal((await intentar(Array.from({ length: 5 }, () => amigo(telefonoNuevo())))).data.error.codigo, 'demasiados_amigos');
  assert.equal((await intentar([amigo(telefonoNuevo())], 3)).status, 201, 'ocupa 1 de los 2 lugares libres');
  const ok = await intentar([amigo(telefonoNuevo(), 'Fran'), amigo(telefonoNuevo())]);
  assert.equal(ok.status, 201);
  assert.equal(ok.data.mesa.asignadas, 2);
  assert.equal(ok.data.mesa.libres, 2);
  // los teléfonos de los amigos se guardan cifrados, nunca en claro
  const guardado = JSON.stringify(await c.db.all('SELECT * FROM partes'));
  assert.ok(!guardado.includes(t.slice(-6)), 'no hay teléfonos en claro en partes');
});

test('límite diario y semanal de boletas por persona (y alerta)', async () => {
  const c = await montar();
  const s = await registrarSocio(c);
  const nueva = async () => reclamar(s, await boletaNueva(c, { monto: 20000 }), 2);
  for (let i = 0; i < 3; i++) assert.equal((await nueva()).status, 201);
  const cuarta = await nueva();
  assert.equal(cuarta.status, 429);
  assert.equal(cuarta.data.error.codigo, 'limite_diario');
  assert.equal((await c.db.get("SELECT COUNT(*) AS n FROM alertas WHERE tipo = 'limite_diario'")).n, 1);
  c.reloj.avanzar(DIA + MIN); // día 2: 3 más (llevamos 6 en la semana)
  for (let i = 0; i < 3; i++) assert.equal((await nueva()).status, 201);
  c.reloj.avanzar(DIA + MIN); // día 3: 2 más (llevamos 8)
  for (let i = 0; i < 2; i++) assert.equal((await nueva()).status, 201);
  const novena = await nueva();
  assert.equal(novena.status, 429);
  assert.equal(novena.data.error.codigo, 'limite_semanal');
});

test('adivinar códigos: 10 intentos por hora', async () => {
  const c = await montar();
  const s = await registrarSocio(c);
  for (let i = 0; i < 10; i++) assert.equal((await reclamar(s, 'ZZZZZZ', 2)).status, 404);
  const r = await reclamar(s, 'ZZZZZZ', 2);
  assert.equal(r.status, 429);
  assert.equal(r.data.error.codigo, 'demasiados_intentos');
  const real = await boletaNueva(c, { monto: 20000 });
  assert.equal((await reclamar(s, real, 2)).status, 429, 'ni el código bueno mientras dura el bloqueo');
  c.reloj.avanzar(HORA + MIN);
  assert.equal((await reclamar(s, real, 2)).status, 201);
});

test('las cuentas del personal no acumulan y quedan en alertas', async () => {
  const c = await montar();
  const garzon = await registrarSocio(c);
  await c.db.run('UPDATE usuarios SET es_personal = 1');
  const r = await reclamar(garzon, await boletaNueva(c, { monto: 20000 }), 2);
  assert.equal(r.status, 403);
  assert.equal(r.data.error.codigo, 'cuenta_personal');
  const alertas = await c.db.all("SELECT * FROM alertas WHERE tipo = 'personal_intento'");
  assert.equal(alertas.length, 1);
  assert.equal(alertas[0].usuario_id, 1);
  assert.equal((await c.db.get('SELECT COUNT(*) AS n FROM mesas')).n, 0);
});

test('subir de rango: se avisa y la tasa mejora desde la boleta siguiente', async () => {
  const c = await montar();
  const s = await registrarSocio(c);
  const r1 = await reclamar(s, await boletaNueva(c, { monto: 150000 }), 5);
  assert.equal(r1.data.ascendio, false);
  const r2 = await reclamar(s, await boletaNueva(c, { monto: 150000 }), 5);
  assert.equal(r2.data.coronas_ganadas, 2400, 'la segunda se calcula con el rango que tenía antes (Plebeyo 8%)');
  assert.equal(r2.data.ascendio, true);
  assert.equal(r2.data.rango_antes, 'Plebeyo');
  assert.equal(r2.data.rango.nombre, 'Comerciante');
  c.reloj.avanzar(DIA + MIN);
  const r3 = await reclamar(s, await boletaNueva(c, { monto: 150000 }), 5);
  assert.equal(r3.data.coronas_ganadas, 3000, 'Comerciante: 10% de 30.000');
  assert.equal(r3.data.ascendio, false);
});

test('las coronas vencen tras 12 meses sin actividad y se puede volver a ganar', async () => {
  const c = await montar();
  const s = await registrarSocio(c);
  await reclamar(s, await boletaNueva(c, { monto: 150000 }), 5);
  c.reloj.avanzar(DIA + MIN);
  assert.equal((await s.nav.get('/api/me')).data.saldo.disponible, 2400);
  c.reloj.avanzar(11 * 30 * DIA);
  await reingresar(c, s); // la sesión dura 90 días
  assert.equal((await s.nav.get('/api/me')).data.saldo.disponible, 2400, 'a los 11 meses siguen');
  c.reloj.avanzar(2 * 30 * DIA);
  await reingresar(c, s);
  const luego = await s.nav.get('/api/me');
  assert.equal(luego.data.saldo.disponible, 0);
  assert.equal(luego.data.rango.nombre, 'Plebeyo', 'el gasto de hace más de 12 meses ya no cuenta');
  const movs = await s.nav.get('/api/me/movimientos');
  assert.equal(movs.data.movimientos[0].tipo, 'vencimiento');
  assert.equal(movs.data.movimientos[0].coronas, -2400);
  // idempotente
  await s.nav.get('/api/me');
  assert.equal((await c.db.get("SELECT COUNT(*) AS n FROM movimientos WHERE tipo = 'vencimiento'")).n, 1);
  const nueva = await reclamar(s, await boletaNueva(c, { monto: 30000 }), 3);
  assert.equal(nueva.status, 201);
});

test('dos personas reclamando la misma boleta a la vez: solo una gana', async () => {
  const c = await montar();
  const a = await registrarSocio(c);
  const b = await registrarSocio(c);
  const codigo = await boletaNueva(c, { monto: 60000 });
  const [ra, rb] = await Promise.all([reclamar(a, codigo, 4), reclamar(b, codigo, 4)]);
  assert.deepEqual([ra.status, rb.status].sort(), [201, 409]);
  assert.equal((await c.db.get('SELECT COUNT(*) AS n FROM mesas')).n, 1);
  assert.equal((await c.db.get("SELECT COUNT(*) AS n FROM movimientos WHERE tipo = 'compra'")).n, 1);
  assert.equal((await c.db.get("SELECT COUNT(*) AS n FROM partes WHERE idx = 0")).n, 1);
});

test('la misma persona reclamando dos veces en paralelo: una sola mesa', async () => {
  const c = await montar();
  const a = await registrarSocio(c);
  const codigo = await boletaNueva(c, { monto: 60000 });
  const rs = await Promise.all([reclamar(a, codigo, 4), reclamar(a, codigo, 4), reclamar(a, codigo, 4)]);
  assert.equal(rs.filter((r) => r.status === 201).length, 1);
  assert.equal((await c.db.get('SELECT COUNT(*) AS n FROM mesas')).n, 1);
});
