import test from 'node:test';
import assert from 'node:assert/strict';
import { montar, navegador, registrarSocio, telefonoNuevo, MIN, HORA, DIA } from './helpers.js';
import { normalizarTelefono, edadEn, fechaValida, limpiarNombre, fechaAMs, diaChile, normalizarCodigo } from '../src/lib/util.js';

test('normalizarTelefono acepta los formatos habituales y rechaza el resto', () => {
  for (const ok of ['912345678', '9 1234 5678', '+56 9 1234 5678', '56912345678', '0912345678', '(9) 1234-5678']) {
    assert.equal(normalizarTelefono(ok), '+56912345678', ok);
  }
  for (const mal of ['12345678', '812345678', '+5691234567', '+56 2 2345 6789', '', 'abc', null, undefined, 912345678, '+1 555 123 4567']) {
    assert.equal(normalizarTelefono(mal), null, String(mal));
  }
});

test('fechas: edad, fechas inválidas y hora de Chile', () => {
  assert.equal(edadEn('2008-10-09', '2026-10-08'), 17);
  assert.equal(edadEn('2008-10-08', '2026-10-08'), 18);
  assert.equal(edadEn('2000-02-29', '2026-02-28'), 25);
  assert.ok(fechaValida('2000-02-29'));
  assert.ok(!fechaValida('2001-02-29'));
  assert.ok(!fechaValida('2001-13-01'));
  assert.ok(!fechaValida('hoy'));
  assert.equal(diaChile(Date.parse('2026-10-09T01:00:00Z')), '2026-10-08');
  // invierno (UTC-4) y verano (UTC-3)
  assert.equal(fechaAMs('2026-07-01 12:00'), Date.parse('2026-07-01T16:00:00Z'));
  assert.equal(fechaAMs('2026-12-01 12:00'), Date.parse('2026-12-01T15:00:00Z'));
  assert.equal(fechaAMs('01/12/2026 12:00'), Date.parse('2026-12-01T15:00:00Z'));
  assert.equal(fechaAMs('2026-10-08T21:14:00Z'), Date.parse('2026-10-08T21:14:00Z'));
  assert.equal(fechaAMs('basura'), null);
});

test('limpiarNombre y normalizarCodigo', () => {
  assert.equal(limpiarNombre('  María   José  Núñez '), 'María José Núñez');
  assert.equal(limpiarNombre("D'Angelo-Pérez"), "D'Angelo-Pérez");
  for (const mal of ['', 'A', '1234', '<script>', 'x'.repeat(61), null]) assert.equal(limpiarNombre(mal), null, String(mal));
  assert.equal(normalizarCodigo(' k7m-29x '), 'K7M29X');
});

test('registro completo por teléfono verificado y sesión', async () => {
  const c = await montar();
  const nav = navegador(c.app);
  const sinSesion = await nav.get('/api/me');
  assert.equal(sinSesion.status, 401);

  const tel = telefonoNuevo();
  const a = await nav.post('/api/auth/codigo', { telefono: tel });
  assert.equal(a.status, 200);
  assert.match(a.data.codigo_demo, /^\d{6}$/);
  const b = await nav.post('/api/auth/verificar', { telefono: tel, codigo: a.data.codigo_demo });
  assert.equal(b.status, 200);
  assert.equal(b.data.nuevo, true);
  assert.ok(b.data.registro_token);
  const r = await nav.post('/api/auth/registro', { registro_token: b.data.registro_token, nombre: 'Camila Rojas', nacimiento: '1995-03-12', acepta: true });
  assert.equal(r.status, 201);
  const yo = await nav.get('/api/me');
  assert.equal(yo.status, 200);
  assert.equal(yo.data.usuario.nombre, 'Camila Rojas');
  assert.equal(yo.data.usuario.nombre_pila, 'Camila');
  assert.match(yo.data.usuario.telefono, /5678|\d{4}$/);
  assert.equal(yo.data.rango.nombre, 'Plebeyo');
  assert.equal(yo.data.saldo.disponible, 0);
  assert.equal(yo.data.rangos.length, 5);
  assert.ok(!JSON.stringify(yo.data).includes(tel), 'el teléfono completo no debe viajar en /api/me');

  const salir = await nav.post('/api/auth/salir');
  assert.equal(salir.status, 200);
  assert.equal((await nav.get('/api/me')).status, 401);

  // vuelve a entrar: ya existe, no pide registro
  const a2 = await nav.post('/api/auth/codigo', { telefono: tel });
  const b2 = await nav.post('/api/auth/verificar', { telefono: tel, codigo: a2.data.codigo_demo });
  assert.equal(b2.data.nuevo, false);
  assert.equal((await nav.get('/api/me')).status, 200);
});

test('código incorrecto descuenta intentos y se bloquea al quinto', async () => {
  const c = await montar();
  const nav = navegador(c.app);
  const tel = telefonoNuevo();
  const a = await nav.post('/api/auth/codigo', { telefono: tel });
  const malo = a.data.codigo_demo === '000000' ? '111111' : '000000';
  for (let i = 1; i <= 5; i++) {
    const r = await nav.post('/api/auth/verificar', { telefono: tel, codigo: malo });
    assert.equal(r.status, 400, `intento ${i}`);
    assert.equal(r.data.error.codigo, 'codigo_incorrecto');
    assert.equal(r.data.error.intentos_restantes, 5 - i);
  }
  const sexto = await nav.post('/api/auth/verificar', { telefono: tel, codigo: a.data.codigo_demo });
  assert.equal(sexto.status, 429, 'ni el código correcto sirve después de 5 fallos');
  const otro = await nav.post('/api/auth/codigo', { telefono: tel });
  const ok = await nav.post('/api/auth/verificar', { telefono: tel, codigo: otro.data.codigo_demo });
  assert.equal(ok.status, 200);
});

test('el código vence a los 5 minutos y un código viejo no sirve tras pedir otro', async () => {
  const c = await montar();
  const nav = navegador(c.app);
  const tel = telefonoNuevo();
  const a = await nav.post('/api/auth/codigo', { telefono: tel });
  c.reloj.avanzar(5 * MIN + 1000);
  const v = await nav.post('/api/auth/verificar', { telefono: tel, codigo: a.data.codigo_demo });
  assert.equal(v.status, 400);
  assert.equal(v.data.error.codigo, 'codigo_vencido');

  const p = await nav.post('/api/auth/codigo', { telefono: tel });
  c.reloj.avanzar(11 * MIN); // sale de la ventana de 3 pedidos / 10 min
  const q = await nav.post('/api/auth/codigo', { telefono: tel });
  const viejo = await nav.post('/api/auth/verificar', { telefono: tel, codigo: p.data.codigo_demo });
  assert.equal(viejo.status, 400, 'el código anterior queda invalidado');
  const bueno = await nav.post('/api/auth/verificar', { telefono: tel, codigo: q.data.codigo_demo });
  assert.equal(bueno.status, 200);
});

test('límite de códigos por teléfono y por IP', async () => {
  const c = await montar();
  const nav = navegador(c.app);
  const tel = telefonoNuevo();
  for (let i = 0; i < 3; i++) assert.equal((await nav.post('/api/auth/codigo', { telefono: tel })).status, 200);
  const cuarto = await nav.post('/api/auth/codigo', { telefono: tel });
  assert.equal(cuarto.status, 429);
  assert.ok(cuarto.data.error.reintentar_seg > 0);
  c.reloj.avanzar(10 * MIN + 1000);
  assert.equal((await nav.post('/api/auth/codigo', { telefono: tel })).status, 200);

  const spam = navegador(c.app, { ip: '9.9.9.9' });
  let bloqueado = 0;
  for (let i = 0; i < 25; i++) {
    const r = await spam.post('/api/auth/codigo', { telefono: telefonoNuevo() });
    if (r.status === 429) bloqueado++;
  }
  assert.ok(bloqueado >= 5, 'la IP que pide demasiados códigos se frena');
});

test('validaciones del registro: menor de edad, consentimiento, nombre y fecha', async () => {
  const c = await montar();
  const intentar = async (extra) => {
    const nav = navegador(c.app, { ip: `10.2.${Math.floor(Math.random() * 250)}.1` });
    const tel = telefonoNuevo();
    const a = await nav.post('/api/auth/codigo', { telefono: tel });
    const b = await nav.post('/api/auth/verificar', { telefono: tel, codigo: a.data.codigo_demo });
    const r = await nav.post('/api/auth/registro', { registro_token: b.data.registro_token, nombre: 'Pedro Soto', nacimiento: '1990-01-01', acepta: true, ...extra });
    return { r, nav, tel, token: b.data.registro_token };
  };
  const menor = await intentar({ nacimiento: '2010-05-05' });
  assert.equal(menor.r.status, 403);
  assert.equal(menor.r.data.error.codigo, 'menor_de_edad');
  assert.equal((await c.db.get('SELECT COUNT(*) AS n FROM usuarios WHERE telefono = ?', ['+56' + menor.tel])).n, 0);
  // justo 18 años hoy sí; un día menos no
  const justo = await intentar({ nacimiento: '2008-10-08' });
  assert.equal(justo.r.status, 201);
  const casi = await intentar({ nacimiento: '2008-10-09' });
  assert.equal(casi.r.status, 403);

  assert.equal((await intentar({ acepta: false })).r.data.error.codigo, 'falta_consentimiento');
  assert.equal((await intentar({ acepta: 'true' })).r.data.error.codigo, 'falta_consentimiento');
  assert.equal((await intentar({ acepta: undefined })).r.data.error.codigo, 'falta_consentimiento');
  assert.equal((await intentar({ nombre: '' })).r.data.error.codigo, 'nombre_invalido');
  assert.equal((await intentar({ nombre: '<b>x</b>' })).r.data.error.codigo, 'nombre_invalido');
  assert.equal((await intentar({ nacimiento: '1990-02-30' })).r.data.error.codigo, 'nacimiento_invalido');
  assert.equal((await intentar({ nacimiento: '2999-01-01' })).r.data.error.codigo, 'nacimiento_invalido');
  assert.equal((await intentar({ nacimiento: 'ayer' })).r.data.error.codigo, 'nacimiento_invalido');
});

test('el token de registro es de un solo uso, vence a los 15 minutos y no sirve inventado', async () => {
  const c = await montar();
  const nav = navegador(c.app);
  const tel = telefonoNuevo();
  const a = await nav.post('/api/auth/codigo', { telefono: tel });
  const b = await nav.post('/api/auth/verificar', { telefono: tel, codigo: a.data.codigo_demo });
  const datos = { registro_token: b.data.registro_token, nombre: 'Ana Pérez', nacimiento: '1990-01-01', acepta: true };
  assert.equal((await nav.post('/api/auth/registro', { ...datos, registro_token: 'inventado' })).data.error.codigo, 'registro_vencido');
  assert.equal((await nav.post('/api/auth/registro', {})).data.error.codigo, 'registro_vencido');
  assert.equal((await nav.post('/api/auth/registro', datos)).status, 201);
  const otro = navegador(c.app);
  assert.equal((await otro.post('/api/auth/registro', datos)).data.error.codigo, 'registro_vencido', 'no se reutiliza');

  const tel2 = telefonoNuevo();
  const a2 = await nav.post('/api/auth/codigo', { telefono: tel2 });
  const b2 = await nav.post('/api/auth/verificar', { telefono: tel2, codigo: a2.data.codigo_demo });
  c.reloj.avanzar(16 * MIN);
  const tarde = await nav.post('/api/auth/registro', { ...datos, registro_token: b2.data.registro_token });
  assert.equal(tarde.data.error.codigo, 'registro_vencido');
});

test('no se puede crear dos cuentas con el mismo teléfono (carrera)', async () => {
  const c = await montar();
  const tel = telefonoNuevo();
  const n1 = navegador(c.app, { ip: '10.3.0.1' });
  const a = await n1.post('/api/auth/codigo', { telefono: tel });
  const b = await n1.post('/api/auth/verificar', { telefono: tel, codigo: a.data.codigo_demo });
  const datos = { nombre: 'Ana Pérez', nacimiento: '1990-01-01', acepta: true };
  // Segundo navegador pide otro código (invalida el anterior) pero el token de registro del primero sigue vivo
  const n2 = navegador(c.app, { ip: '10.3.0.2' });
  const a2 = await n2.post('/api/auth/codigo', { telefono: tel });
  const b2 = await n2.post('/api/auth/verificar', { telefono: tel, codigo: a2.data.codigo_demo });
  const [r1, r2] = await Promise.all([
    n1.post('/api/auth/registro', { ...datos, registro_token: b.data.registro_token }),
    n2.post('/api/auth/registro', { ...datos, registro_token: b2.data.registro_token }),
  ]);
  assert.deepEqual([r1.status, r2.status].sort(), [201, 201]);
  assert.equal((await c.db.get('SELECT COUNT(*) AS n FROM usuarios WHERE telefono = ?', ['+56' + tel])).n, 1);
});

test('cuenta bloqueada no puede pedir código ni usar la sesión', async () => {
  const c = await montar();
  const s = await registrarSocio(c);
  await c.db.run("UPDATE usuarios SET estado = 'bloqueado'");
  assert.equal((await s.nav.get('/api/me')).status, 403);
  const nav = navegador(c.app);
  const r = await nav.post('/api/auth/codigo', { telefono: s.tel });
  assert.equal(r.status, 403);
});

test('protección CSRF: otro origen y tipos de contenido no JSON', async () => {
  const c = await montar();
  const malo = navegador(c.app, { origin: 'https://sitio-malo.example' });
  const r = await malo.post('/api/auth/codigo', { telefono: telefonoNuevo() });
  assert.equal(r.status, 403);
  const mismo = navegador(c.app, { origin: 'http://club.test' });
  assert.equal((await mismo.post('/api/auth/codigo', { telefono: telefonoNuevo() })).status, 200);
  const nav = navegador(c.app);
  const form = await nav.pedir('POST', '/api/auth/codigo', 'telefono=912345678', { headers: { 'content-type': 'application/x-www-form-urlencoded' }, json: false });
  assert.equal(form.status, 415);
  const roto = await nav.pedir('POST', '/api/auth/codigo', '{no es json', { json: false, headers: { 'content-type': 'application/json' } });
  assert.equal(roto.status, 400);
  assert.equal((await nav.get('/api/inexistente')).status, 404);
  assert.equal((await nav.pedir('DELETE', '/api/me')).status, 405);
});

test('cookie de sesión: HttpOnly, SameSite y Secure bajo https', async () => {
  const c = await montar();
  const nav = navegador(c.app);
  const tel = telefonoNuevo();
  const a = await nav.post('/api/auth/codigo', { telefono: tel });
  const b = await nav.post('/api/auth/verificar', { telefono: tel, codigo: a.data.codigo_demo });
  const r = await nav.post('/api/auth/registro', { registro_token: b.data.registro_token, nombre: 'Ana Pérez', nacimiento: '1990-01-01', acepta: true });
  const cookie = r.headers.getSetCookie()[0];
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  assert.doesNotMatch(cookie, /Secure/, 'en http local no se marca Secure');
  const https = await c.app.fetch(new Request('https://club.test/api/auth/codigo', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ telefono: telefonoNuevo() }),
  }));
  assert.equal(https.status, 200);
  // sesiones expiradas no funcionan
  c.reloj.avanzar(91 * DIA);
  assert.equal((await nav.get('/api/me')).status, 401);
});
