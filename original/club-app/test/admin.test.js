import test from 'node:test';
import assert from 'node:assert/strict';
import { montar, navegador, registrarSocio, boletaNueva, staff, admin, telefonoNuevo, reingresar, MIN, HORA, DIA } from './helpers.js';
import { CONFIG_BASE, validarConfig } from '../src/lib/config.js';

test('el panel exige la clave de administración y se frena ante intentos', async () => {
  const c = await montar();
  const nav = navegador(c.app, { ip: '10.6.6.6' });
  assert.equal((await nav.get('/api/admin/resumen')).status, 401);
  for (let i = 0; i < 8; i++) assert.equal((await nav.post('/api/admin/login', { password: 'mala' })).status, 401);
  assert.equal((await nav.post('/api/admin/login', { password: c.env.ADMIN_PASSWORD })).status, 429);
  c.reloj.avanzar(16 * MIN);
  assert.equal((await nav.post('/api/admin/login', { password: c.env.ADMIN_PASSWORD })).status, 200);
  assert.equal((await nav.get('/api/admin/resumen')).status, 200);
  await nav.post('/api/admin/salir');
  assert.equal((await nav.get('/api/admin/resumen')).status, 401);
  // las sesiones de cliente o de caja no abren el panel
  const s = await registrarSocio(c);
  assert.equal((await s.nav.get('/api/admin/resumen')).status, 401);
  assert.equal((await (await staff(c)).get('/api/admin/resumen')).status, 401);
});

test('resumen: socios, ventas, tasa de reclamo, pasivo y rangos', async () => {
  const c = await montar();
  const a = await registrarSocio(c);
  await a.nav.post('/api/boletas/reclamar', { codigo: await boletaNueva(c, { monto: 150000 }), personas: 5 });
  await boletaNueva(c, { monto: 50000 }); // sin reclamar
  const adm = await admin(c);
  const r = await adm.get('/api/admin/resumen');
  assert.equal(r.data.socios, 1);
  assert.equal(r.data.boletas_30d, 2);
  assert.equal(r.data.ventas_30d, 200000);
  assert.equal(r.data.tasa_reclamo, 50);
  assert.equal(r.data.coronas_emitidas_30d, 2400);
  assert.equal(r.data.pasivo_coronas, 2400);
  assert.equal(r.data.por_rango.plebeyo, 1);
  const x = r.data.locales.find((l) => l.codigo === 'REY-X');
  assert.equal(x.boletas, 2);
  assert.equal(x.tasa, 50);
});

test('ajuste manual de saldo con motivo obligatorio y auditoría', async () => {
  const c = await montar();
  const s = await registrarSocio(c);
  const adm = await admin(c);
  assert.equal((await adm.post('/api/admin/socios/1/ajuste', { coronas: 1000, nota: 'x' })).data.error.codigo, 'nota_invalida');
  assert.equal((await adm.post('/api/admin/socios/1/ajuste', { coronas: 0, nota: 'motivo válido' })).data.error.codigo, 'monto_invalido');
  assert.equal((await adm.post('/api/admin/socios/1/ajuste', { coronas: 999999, nota: 'motivo válido' })).data.error.codigo, 'monto_invalido');
  assert.equal((await adm.post('/api/admin/socios/99/ajuste', { coronas: 100, nota: 'motivo válido' })).status, 404);
  assert.equal((await adm.post('/api/admin/socios/1/ajuste', { coronas: 3000, nota: 'Compensación por error de caja' })).status, 200);
  assert.equal((await s.nav.get('/api/me')).data.saldo.disponible, 3000, 'el ajuste se puede usar de inmediato');
  assert.equal((await adm.post('/api/admin/socios/1/ajuste', { coronas: -1000, nota: 'Corrección del ajuste' })).status, 200);
  assert.equal((await s.nav.get('/api/me')).data.saldo.disponible, 2000);
  const det = await adm.get('/api/admin/socios/1');
  assert.equal(det.data.saldo, 2000);
  assert.equal(det.data.movimientos[0].tipo, 'ajuste');
  const aud = await adm.get('/api/admin/auditoria');
  assert.ok(aud.data.auditoria.some((a) => a.accion === 'ajuste_saldo' && a.detalle.coronas === 3000));
});

test('bloquear y desbloquear socios; marcar personal', async () => {
  const c = await montar();
  const s = await registrarSocio(c);
  const adm = await admin(c);
  assert.equal((await adm.post('/api/admin/socios/1/estado', { estado: 'raro' })).status, 400);
  assert.equal((await adm.post('/api/admin/socios/1/estado', { estado: 'bloqueado' })).status, 200);
  assert.equal((await s.nav.get('/api/me')).status, 401, 'se cierran sus sesiones');
  assert.equal((await navegador(c.app).post('/api/auth/codigo', { telefono: s.tel })).status, 403);
  assert.equal((await adm.post('/api/admin/socios/1/estado', { estado: 'activo' })).status, 200);
  await reingresar(c, s);
  assert.equal((await s.nav.get('/api/me')).status, 200);

  assert.equal((await adm.post('/api/admin/socios/1/personal', { es_personal: true })).status, 200);
  const r = await s.nav.post('/api/boletas/reclamar', { codigo: await boletaNueva(c), personas: 2 });
  assert.equal(r.data.error.codigo, 'cuenta_personal');
  // un número del personal cargado ANTES de registrarse queda marcado al crear la cuenta
  const telGarzon = telefonoNuevo();
  assert.equal((await adm.post('/api/admin/personal', { telefono: telGarzon, etiqueta: 'Juan - REY X' })).status, 200);
  assert.equal((await adm.post('/api/admin/personal', { telefono: 'xx' })).status, 400);
  const g = await registrarSocio(c, { tel: telGarzon });
  assert.equal((await g.nav.get('/api/me')).data.es_personal, true);
  await adm.post('/api/admin/socios/1/personal', { es_personal: false });
  assert.equal((await adm.post('/api/admin/socios/1/personal', { es_personal: 'si' })).status, 400);
});

test('lista y búsqueda de socios', async () => {
  const c = await montar();
  const a = await registrarSocio(c, { nombre: 'Camila Rojas' });
  await registrarSocio(c, { nombre: 'Pedro Soto' });
  const adm = await admin(c);
  assert.equal((await adm.get('/api/admin/socios')).data.socios.length, 2);
  assert.equal((await adm.get('/api/admin/socios?q=camila')).data.socios.length, 1);
  assert.equal((await adm.get(`/api/admin/socios?q=${a.tel}`)).data.socios.length, 1);
  assert.equal((await adm.get('/api/admin/socios?q=%25')).data.socios.length, 0, 'los comodines no se interpretan');
  assert.equal((await adm.get('/api/admin/socios/999')).status, 404);
});

test('boletas en el panel con filtros', async () => {
  const c = await montar();
  const a = await registrarSocio(c);
  await a.nav.post('/api/boletas/reclamar', { codigo: await boletaNueva(c, { monto: 20000 }), personas: 2 });
  await boletaNueva(c, { monto: 30000, local: 'REY-IV' });
  const adm = await admin(c);
  assert.equal((await adm.get('/api/admin/boletas')).data.boletas.length, 2);
  assert.equal((await adm.get('/api/admin/boletas?local=REY-IV')).data.boletas.length, 1);
  const r = await adm.get('/api/admin/boletas?estado=reclamada');
  assert.equal(r.data.boletas.length, 1);
  assert.equal(r.data.boletas[0].pagador, 'Camila Rojas');
});

test('locales: crear, PIN, llave de API, desactivar', async () => {
  const c = await montar();
  const adm = await admin(c);
  assert.equal((await adm.post('/api/admin/locales', { codigo: 'x', nombre: 'Mal' })).status, 400);
  assert.equal((await adm.post('/api/admin/locales', { codigo: 'REY-XX', nombre: '' })).status, 400);
  const n = await adm.post('/api/admin/locales', { codigo: 'rey-xx', nombre: 'REY XX · Prueba', direccion: 'Calle 1' });
  assert.equal(n.status, 201);
  assert.match(n.data.local.api_key, /^rey_/);
  assert.match(n.data.local.pin, /^\d{4}$/);
  assert.equal((await adm.post('/api/admin/locales', { codigo: 'REY-XX', nombre: 'Repetido' })).status, 409);
  // el local nuevo ya puede iniciar sesión y registrar boletas
  const caja = navegador(c.app);
  assert.equal((await caja.post('/api/caja/login', { local: 'REY-XX', pin: n.data.local.pin })).status, 200);
  const b = await caja.pedir('POST', '/api/caja/boletas', { folio: 'N1', monto: 5000 }, { headers: { authorization: `Bearer ${n.data.local.api_key}` } });
  assert.equal(b.status, 201);
  // regenerar la llave invalida la anterior
  const idl = n.data.local.id;
  const k = await adm.post(`/api/admin/locales/${idl}/apikey`);
  const viejaFalla = await navegador(c.app).pedir('POST', '/api/caja/boletas', { folio: 'N2', monto: 5000 }, { headers: { authorization: `Bearer ${n.data.local.api_key}` } });
  assert.equal(viejaFalla.status, 401);
  const nuevaOk = await navegador(c.app).pedir('POST', '/api/caja/boletas', { folio: 'N2', monto: 5000 }, { headers: { authorization: `Bearer ${k.data.api_key}` } });
  assert.equal(nuevaOk.status, 201);
  // cambiar PIN cierra sesiones del local
  const p = await adm.post(`/api/admin/locales/${idl}/pin`, { pin: '5678' });
  assert.equal(p.data.pin, '5678');
  assert.equal((await caja.get('/api/caja/yo')).status, 401);
  assert.equal((await navegador(c.app).post('/api/caja/login', { local: 'REY-XX', pin: '5678' })).status, 200);
  assert.equal((await navegador(c.app).post('/api/caja/login', { local: 'REY-XX', pin: n.data.local.pin })).status, 401);
  // desactivar
  assert.equal((await adm.post(`/api/admin/locales/${idl}`, { activo: false })).status, 200);
  assert.equal((await navegador(c.app).post('/api/caja/login', { local: 'REY-XX', pin: '5678' })).status, 401);
  assert.equal((await navegador(c.app).pedir('POST', '/api/caja/boletas', { folio: 'N3', monto: 5000 }, { headers: { authorization: `Bearer ${k.data.api_key}` } })).status, 401);
  assert.equal((await adm.post('/api/admin/locales/999/pin', {})).status, 404);
  const lista = await adm.get('/api/admin/locales');
  assert.ok(lista.data.locales.length >= 7);
  assert.ok(!JSON.stringify(lista.data).includes('hash'), 'no se filtran hashes');
});

test('locales de ejemplo se cargan una sola vez', async () => {
  const c = await montar();
  const adm = await admin(c);
  const r = await adm.post('/api/admin/locales/ejemplo', {});
  assert.equal(r.data.creados.length, 8, '14 conocidos menos los 6 de demostración');
  assert.equal((await adm.post('/api/admin/locales/ejemplo', {})).data.creados.length, 0);
});

test('configuración: validar, guardar y que cambie el comportamiento', async () => {
  const c = await montar();
  const adm = await admin(c);
  const act = (await adm.get('/api/admin/config')).data.config;
  assert.equal(act.rangos.length, 5);
  assert.deepEqual(act.rangos.map((r) => r.id), ['plebeyo', 'comerciante', 'guardia', 'noble', 'rey']);
  const malos = [
    { ...act, tope_coronas_por_persona: -5 },
    { ...act, rangos: act.rangos.slice(0, 4) },
    { ...act, rangos: act.rangos.map((r, i) => (i === 2 ? { ...r, desde: 10 } : r)) },
    { ...act, rangos: act.rangos.map((r, i) => (i === 0 ? { ...r, desde: 5 } : r)) },
    { ...act, rangos: act.rangos.map((r) => ({ ...r, pct: 99 })) },
    { ...act, canje_minimo: 99999, canje_maximo: 1000 },
    { ...act, gasto_minimo_por_persona: 90000, gasto_maximo_por_persona: 1000 },
    { ...act, regalo: { ...act.regalo, activo: 'si' } },
    { ...act, horas_activacion: 'mucho' },
  ];
  for (const m of malos) {
    const r = await adm.post('/api/admin/config', { config: m });
    assert.equal(r.status, 400, JSON.stringify(r.data.error.errores));
    assert.ok(r.data.error.errores.length > 0);
  }
  assert.equal((await adm.post('/api/admin/config', {})).status, 400);

  // activar al instante y subir la tasa del primer rango
  const nuevo = { ...act, horas_activacion: 0, rangos: act.rangos.map((r, i) => (i === 0 ? { ...r, pct: 20 } : r)) };
  assert.equal((await adm.post('/api/admin/config', { config: nuevo })).status, 200);
  const s = await registrarSocio(c);
  const r = await s.nav.post('/api/boletas/reclamar', { codigo: await boletaNueva(c, { monto: 150000 }), personas: 5 });
  assert.equal(r.data.coronas_ganadas, 6000, '30.000 x 20%');
  assert.equal((await s.nav.get('/api/me')).data.saldo.disponible, 6000, 'sin espera de activación');
  assert.equal(validarConfig(CONFIG_BASE).ok, true);
});

test('importar ventas desde Excel (CSV con ; o ,), con errores por fila', async () => {
  const c = await montar();
  const adm = await admin(c);
  const csv = [
    'Local;Folio;Monto;Fecha;Comensales',
    'REY-X;1001;$150.000;08/10/2026 20:30;5',
    'rey-iv;1002;28.500;2026-10-08 21:00;',
    'REY-X;1001;150000;08/10/2026 20:30;5',
    'REY-X;1003;abc;08/10/2026 20:30;',
    'NO-HAY;1004;1000;08/10/2026 20:30;',
    'REY-X;1005;5000;fecha rara;',
    '"REY-X";"1006";"7.000";"08/10/2026 22:00";"2"',
  ].join('\r\n');
  const r = await adm.post('/api/admin/importar', { csv });
  assert.equal(r.status, 200);
  assert.equal(r.data.creadas, 3);
  assert.equal(r.data.repetidas, 1);
  assert.equal(r.data.errores.length, 3);
  assert.deepEqual(r.data.errores.map((e) => e.fila), [5, 6, 7]);
  const b = await c.db.get("SELECT * FROM boletas WHERE folio = '1001'");
  assert.equal(b.monto, 150000);
  assert.equal(b.comensales, 5);
  assert.equal(b.emitida_en, Date.parse('2026-10-08T23:30:00Z'));
  // con comas y columna de código propio
  const csv2 = 'sucursal,numero,total,codigo\nREY-X,2001,12000,K7M29X\nREY-X,2002,12000,K7M29X';
  const r2 = await adm.post('/api/admin/importar', { csv: csv2 });
  assert.equal(r2.data.creadas, 1);
  assert.equal(r2.data.errores[0].fila, 3);
  assert.equal((await adm.post('/api/admin/importar', { csv: 'a,b\n1,2' })).data.error.codigo, 'csv_columnas');
  assert.equal((await adm.post('/api/admin/importar', { csv: '' })).data.error.codigo, 'csv_vacio');
  assert.equal((await adm.post('/api/admin/importar', { csv: 'solo,titulos' })).data.error.codigo, 'csv_vacio');
  assert.equal((await navegador(c.app).post('/api/admin/importar', { csv })).status, 401);
});

test('alertas: se listan, se resuelven y señalan quien reclama mucho', async () => {
  const c = await montar();
  const s = await registrarSocio(c);
  for (let i = 0; i < 3; i++) await s.nav.post('/api/boletas/reclamar', { codigo: await boletaNueva(c, { monto: 20000 }), personas: 2 });
  await s.nav.post('/api/boletas/reclamar', { codigo: await boletaNueva(c, { monto: 20000 }), personas: 2 });
  const adm = await admin(c);
  const r = await adm.get('/api/admin/alertas');
  assert.equal(r.data.alertas[0].tipo, 'limite_diario');
  assert.equal(r.data.muchos_reclamos[0].n, 3);
  assert.equal((await adm.post(`/api/admin/alertas/${r.data.alertas[0].id}/resolver`, {})).status, 200);
  assert.equal((await adm.get('/api/admin/alertas')).data.alertas.length, 0);
});

test('salón del rey: solo aparece quien lo autoriza, con nombre abreviado', async () => {
  const c = await montar();
  const a = await registrarSocio(c, { nombre: 'Camila Rojas Pérez' });
  const b = await registrarSocio(c, { nombre: 'Pedro Soto' });
  await a.nav.post('/api/boletas/reclamar', { codigo: await boletaNueva(c, { monto: 150000 }), personas: 5 });
  await b.nav.post('/api/boletas/reclamar', { codigo: await boletaNueva(c, { monto: 150000 }), personas: 3 });
  assert.equal((await navegador(c.app).get('/api/salon')).data.salon.length, 0);
  assert.equal((await a.nav.post('/api/me/salon', { publico: 'si' })).status, 400);
  await a.nav.post('/api/me/salon', { publico: true });
  const s = (await navegador(c.app).get('/api/salon')).data.salon;
  assert.equal(s.length, 1);
  assert.equal(s[0].nombre, 'Camila P.');
  assert.ok(!JSON.stringify(s).includes('Rojas'));
  await a.nav.post('/api/me/salon', { publico: false });
  assert.equal((await navegador(c.app).get('/api/salon')).data.salon.length, 0);
});

test('privacidad: exportar mis datos y eliminar mi cuenta', async () => {
  const c = await montar();
  const s = await registrarSocio(c, { nombre: 'Camila Rojas' });
  const amigo = await registrarSocio(c);
  const r = await s.nav.post('/api/boletas/reclamar', { codigo: await boletaNueva(c, { monto: 150000 }), personas: 5, amigos: [{ telefono: amigo.tel, etiqueta: 'Fran' }] });
  c.reloj.avanzar(25 * HORA);
  await s.nav.post('/api/canjes', { monto: 1000 });
  const datos = await s.nav.get('/api/me/datos');
  assert.equal(datos.data.usuario.nombre, 'Camila Rojas');
  assert.equal(datos.data.usuario.telefono, '+56' + s.tel);
  assert.ok(datos.data.movimientos.length >= 2);

  assert.equal((await s.nav.post('/api/me/eliminar', {})).data.error.codigo, 'falta_confirmacion');
  assert.equal((await s.nav.post('/api/me/eliminar', { confirmar: true })).status, 200);
  assert.equal((await s.nav.get('/api/me')).status, 401);
  const u = await c.db.get('SELECT * FROM usuarios WHERE id = 1');
  assert.equal(u.estado, 'eliminado');
  assert.equal(u.telefono, null);
  assert.equal(u.nombre, 'Socio eliminado');
  assert.equal((await c.db.get("SELECT COUNT(*) AS n FROM fichas WHERE estado = 'reservada'")).n, 0, 'la ficha activa se cancela');
  // el mismo teléfono puede volver a registrarse como persona nueva
  const otra = await registrarSocio(c, { tel: s.tel, nombre: 'Camila Rojas' });
  assert.equal((await otra.nav.get('/api/me')).data.saldo.disponible, 0);
  // la parte que esperaba a un amigo eliminado se libera
  c.reloj.avanzar(HORA);
  const fran = await amigo.nav.post('/api/me/eliminar', { confirmar: true });
  assert.equal(fran.status, 200);
  assert.equal((await c.db.get("SELECT COUNT(*) AS n FROM partes WHERE estado = 'asignada'")).n, 0);
});

test('el servidor no responde nada raro ante rutas inexistentes y sin cabeceras de secretos', async () => {
  const c = await montar();
  const nav = navegador(c.app);
  const r = await nav.get('/api/estado');
  assert.equal(r.data.ok, true);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.equal((await nav.get('/otra-cosa')).status, 404);
  const rangos = await nav.get('/api/rangos');
  assert.equal(rangos.data.rangos.length, 5);
  assert.ok(!JSON.stringify(rangos.data).includes('hash'));
});
