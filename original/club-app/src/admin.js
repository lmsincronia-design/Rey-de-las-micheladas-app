// Panel de administración del Rey: resumen, socios, locales, alertas, configuración e importación desde Excel/CSV.
import { error, json, leerJSON, exigirLimite, auditar } from './lib/http.js';
import {
  MIN, DIA, HORA, sha256, hmac, iguales, tokenAleatorio, digitosAleatorios, normalizarTelefono, aInt,
  diaChile, fechaAMs, normalizarCodigo,
} from './lib/util.js';
import { cargarConfig, guardarConfig, validarConfig, calcularRango } from './lib/config.js';
import { crearSesion, leerSesion, cerrarSesionTipo } from './auth.js';
import { registrarBoleta } from './caja.js';
import { consultarSocios } from './socios.js';

export const LOCALES_EJEMPLO = [
  ['REY-I', 'REY I · Pío Nono', 'Pío Nono 105, Providencia'],
  ['REY-II', 'REY II · Pío Nono', 'Pío Nono 110, Recoleta'],
  ['REY-III', 'REY III · Ñuñoa', 'Av. Italia 1571, Ñuñoa'],
  ['REY-IV', 'REY IV · Providencia', 'Nueva Providencia 2020, Providencia'],
  ['REY-V', 'REY V · Castillo del Rey', 'Pío Nono 420, Recoleta'],
  ['REY-VI', 'REY VI · Pío Nono', 'Pío Nono 229, Providencia'],
  ['REY-VII', 'REY VII · Barros Borgoño', 'Dr. Manuel Barros Borgoño 147, Providencia'],
  ['REY-VIII', 'REY VIII · Providencia', 'Providencia 455, local 109, Providencia'],
  ['REY-X', 'REY X · Tobalaba', 'Nueva Providencia 2584, Providencia'],
  ['REY-XI', 'REY XI · Los Leones', 'Gral. Holley 109, Providencia'],
  ['REY-XII', 'REY XII · Manuel Montt', 'Providencia 1378, Providencia'],
  ['REY-XIII', 'REY XIII · Maipú', 'Chacabuco 73, Maipú'],
  ['REY-XIV', 'REY XIV · San Bernardo 1', 'Colón 1175, San Bernardo'],
  ['REY-XV', 'REY XV · San Bernardo 2', 'Eyzaguirre 581, San Bernardo'],
];

/* ───────────────────────── Acceso ───────────────────────── */

export async function loginAdmin(ctx) {
  const body = await leerJSON(ctx.req);
  await exigirLimite(ctx.db, `admin:ip:${ctx.ip}`, 8, 15 * MIN, ctx.ahora, 'Demasiados intentos. Espera unos minutos.');
  const esperada = ctx.env.ADMIN_PASSWORD || (ctx.demo ? 'rey-admin' : '');
  if (!esperada) throw error(503, 'admin_no_configurado', 'Falta configurar la clave de administración (ADMIN_PASSWORD).');
  const a = await hmac(ctx.secreto, `admin:${typeof body.password === 'string' ? body.password : ''}`);
  const b = await hmac(ctx.secreto, `admin:${esperada}`);
  if (!iguales(a, b)) throw error(401, 'clave_incorrecta', 'Clave incorrecta.');
  const { cookie } = await crearSesion(ctx, 'admin');
  await limpiar(ctx.db, ctx.ahora);
  await auditar(ctx.db, 'admin', 'login', { ip: ctx.ip }, ctx.ahora);
  return json({ ok: true, demo: ctx.demo }, 200, { 'set-cookie': cookie });
}

export async function salirAdmin(ctx) {
  const cookie = await cerrarSesionTipo(ctx, 'admin');
  return json({ ok: true }, 200, { 'set-cookie': cookie });
}

export async function exigirAdmin(ctx) {
  const s = await leerSesion(ctx, 'admin');
  if (!s) throw error(401, 'no_autenticado', 'Ingresa con la clave de administración.');
  return s;
}

export async function limpiar(db, ahora) {
  await db.run('DELETE FROM sesiones WHERE expira_en < ?', [ahora]);
  await db.run('DELETE FROM otps WHERE creado_en < ?', [ahora - DIA]);
  await db.run('DELETE FROM rate_limits WHERE inicio < ?', [ahora - DIA]);
}

/* ───────────────────────── Resumen y alertas ───────────────────────── */

export async function resumen(ctx) {
  await exigirAdmin(ctx);
  const ahora = ctx.ahora;
  const q = (sql, p = []) => ctx.db.get(sql, p);
  const socios = await q("SELECT COUNT(*) AS n FROM usuarios WHERE estado = 'activo'");
  const nuevos = await q("SELECT COUNT(*) AS n FROM usuarios WHERE estado = 'activo' AND creado_en >= ?", [ahora - 7 * DIA]);
  const boletas = await q(
    `SELECT COUNT(*) AS n, COALESCE(SUM(monto), 0) AS monto,
       SUM(CASE WHEN estado = 'reclamada' THEN 1 ELSE 0 END) AS reclamadas,
       COALESCE(SUM(CASE WHEN estado = 'reclamada' THEN monto ELSE 0 END), 0) AS monto_reclamado
     FROM boletas WHERE estado != 'anulada' AND emitida_en >= ?`,
    [ahora - 30 * DIA],
  );
  const emitidas = await q("SELECT COALESCE(SUM(coronas), 0) AS n FROM movimientos WHERE tipo = 'compra' AND creado_en >= ?", [ahora - 30 * DIA]);
  const canjeadas = await q("SELECT COALESCE(SUM(monto_aplicado), 0) AS n FROM fichas WHERE tipo = 'canje' AND estado = 'usada' AND usada_en >= ?", [ahora - 30 * DIA]);
  const pasivo = await q('SELECT COALESCE(SUM(coronas), 0) AS n FROM movimientos');
  const activas = await q("SELECT COUNT(*) AS n FROM fichas WHERE estado = 'reservada'");
  const alertas = await q('SELECT COUNT(*) AS n FROM alertas WHERE resuelta = 0');
  const locales = await ctx.db.all(
    `SELECT l.id, l.codigo, l.nombre,
       COUNT(b.id) AS boletas,
       COALESCE(SUM(b.monto), 0) AS ventas,
       COALESCE(SUM(CASE WHEN b.estado = 'reclamada' THEN 1 ELSE 0 END), 0) AS reclamadas,
       COALESCE(SUM(CASE WHEN b.estado = 'reclamada' THEN b.monto ELSE 0 END), 0) AS monto_reclamado
     FROM locales l LEFT JOIN boletas b ON b.local_id = l.id AND b.estado != 'anulada' AND b.emitida_en >= ?
     WHERE l.activo = 1 GROUP BY l.id ORDER BY ventas DESC`,
    [ahora - 7 * DIA],
  );
  const reparto = await ctx.db.all('SELECT gasto12m FROM (SELECT usuario_id, SUM(CASE WHEN gasto_fecha >= ? THEN gasto ELSE 0 END) AS gasto12m FROM movimientos GROUP BY usuario_id)', [ahora - 365 * DIA]);
  const porRango = Object.fromEntries(ctx.cfg.rangos.map((r) => [r.id, 0]));
  for (const f of reparto) porRango[calcularRango(Math.max(0, f.gasto12m), ctx.cfg).id]++;
  return json({
    socios: socios.n,
    nuevos_7d: nuevos.n,
    boletas_30d: boletas.n,
    ventas_30d: boletas.monto,
    boletas_reclamadas_30d: boletas.reclamadas ?? 0,
    tasa_reclamo: boletas.n ? Math.round(((boletas.reclamadas ?? 0) / boletas.n) * 100) : 0,
    coronas_emitidas_30d: emitidas.n,
    coronas_canjeadas_30d: canjeadas.n,
    pasivo_coronas: pasivo.n,
    fichas_activas: activas.n,
    alertas_abiertas: alertas.n,
    por_rango: porRango,
    locales: locales.map((l) => ({ ...l, tasa: l.boletas ? Math.round((l.reclamadas / l.boletas) * 100) : 0 })),
  });
}

export async function listarAlertas(ctx) {
  await exigirAdmin(ctx);
  const filas = await ctx.db.all(
    `SELECT a.*, u.nombre FROM alertas a LEFT JOIN usuarios u ON u.id = a.usuario_id
     WHERE a.resuelta = 0 ORDER BY a.id DESC LIMIT 100`,
  );
  // Señal calculada: personas con muchos reclamos en 24 h
  const activos = await ctx.db.all(
    `SELECT u.id, u.nombre, COUNT(*) AS n FROM mesas m JOIN usuarios u ON u.id = m.pagador_id
     WHERE m.creada_en >= ? GROUP BY u.id HAVING n >= ? ORDER BY n DESC LIMIT 20`,
    [ctx.ahora - DIA, ctx.cfg.alerta_reclamos_24h],
  );
  return json({
    alertas: filas.map((f) => ({ id: f.id, tipo: f.tipo, usuario_id: f.usuario_id, nombre: f.nombre, detalle: f.detalle ? JSON.parse(f.detalle) : null, creado_en: f.creado_en })),
    muchos_reclamos: activos,
  });
}

export async function resolverAlerta(ctx) {
  await exigirAdmin(ctx);
  await leerJSON(ctx.req);
  await ctx.db.run('UPDATE alertas SET resuelta = 1 WHERE id = ?', [aInt(ctx.params.id)]);
  return json({ ok: true });
}

/* ───────────────────────── Socios ───────────────────────── */

export async function listarSocios(ctx) {
  await exigirAdmin(ctx);
  const q = (ctx.url.searchParams.get('q') || '').trim();
  const params = [ctx.ahora - 365 * DIA];
  let filtro = "WHERE u.estado != 'eliminado'";
  if (q) {
    const tel = normalizarTelefono(q);
    const cod = normalizarCodigo(q);
    filtro += " AND (u.nombre LIKE ? ESCAPE '!' " + (tel ? 'OR u.telefono = ? ' : '') + (cod.length === 6 ? 'OR u.codigo_socio = ?' : '') + ')';
    params.push(`%${q.replace(/[!%_]/g, (m) => '!' + m)}%`);
    if (tel) params.push(tel);
    if (cod.length === 6) params.push(cod);
  }
  const filas = await ctx.db.all(
    `SELECT u.id, u.nombre, u.telefono, u.codigo_socio, u.estado, u.es_personal, u.creado_en,
       COALESCE(SUM(CASE WHEN mv.gasto_fecha >= ? THEN mv.gasto ELSE 0 END), 0) AS gasto,
       COALESCE(SUM(mv.coronas), 0) AS coronas
     FROM usuarios u LEFT JOIN movimientos mv ON mv.usuario_id = u.id
     ${filtro} GROUP BY u.id ORDER BY u.id DESC LIMIT 100`,
    params,
  );
  return json({
    socios: filas.map((f) => ({
      id: f.id, nombre: f.nombre, telefono: f.telefono, codigo_socio: f.codigo_socio, estado: f.estado, es_personal: !!f.es_personal, creado_en: f.creado_en,
      rango: calcularRango(Math.max(0, f.gasto), ctx.cfg).nombre, gasto: Math.max(0, f.gasto), coronas: f.coronas,
    })),
  });
}

/** Base de coronas por código personal, lista para abrir en Excel (separador ; y tildes correctas). */
export async function exportarSociosCSV(ctx) {
  await exigirAdmin(ctx);
  const filas = await consultarSocios(ctx, { desdeId: 0, limite: 5000 });
  const celda = (v) => {
    const t = String(v ?? '');
    return /[;"\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
  };
  const fecha = (ms) => (ms ? new Date(ms).toISOString().slice(0, 16).replace('T', ' ') : '');
  const lineas = [['Codigo', 'Nombre', 'Rango', 'Porcentaje', 'Coronas disponibles', 'Coronas por activar', 'Consumo 12 meses', 'Ultimo movimiento (UTC)'].join(';')];
  for (const f of filas) {
    lineas.push([f.codigo, f.nombre, f.rango, f.pct + '%', f.coronas_disponibles, f.coronas_por_activar, f.consumo_12m, fecha(f.ultimo_movimiento)].map(celda).join(';'));
  }
  return new Response('\uFEFF' + lineas.join('\r\n') + '\r\n', {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="coronas-por-codigo.csv"',
      'cache-control': 'no-store',
    },
  });
}

export async function verSocio(ctx) {
  await exigirAdmin(ctx);
  const id = aInt(ctx.params.id);
  const u = await ctx.db.get('SELECT * FROM usuarios WHERE id = ?', [id]);
  if (!u) throw error(404, 'no_encontrado', 'Socio no encontrado.');
  const movs = await ctx.db.all('SELECT * FROM movimientos WHERE usuario_id = ? ORDER BY id DESC LIMIT 100', [id]);
  const fichas = await ctx.db.all('SELECT * FROM fichas WHERE usuario_id = ? ORDER BY id DESC LIMIT 30', [id]);
  const mesas = await ctx.db.all('SELECT token, personas, monto, parte, creada_en FROM mesas WHERE pagador_id = ? ORDER BY id DESC LIMIT 30', [id]);
  const s = await ctx.db.get(
    `SELECT COALESCE(SUM(coronas), 0) AS saldo, COALESCE(SUM(CASE WHEN gasto_fecha >= ? THEN gasto ELSE 0 END), 0) AS gasto
     FROM movimientos WHERE usuario_id = ?`,
    [ctx.ahora - 365 * DIA, id],
  );
  return json({
    socio: { id: u.id, nombre: u.nombre, telefono: u.telefono, nacimiento: u.nacimiento, estado: u.estado, es_personal: !!u.es_personal, creado_en: u.creado_en },
    saldo: s.saldo,
    rango: calcularRango(Math.max(0, s.gasto), ctx.cfg),
    movimientos: movs,
    fichas,
    mesas,
  });
}

export async function ajustarSaldo(ctx) {
  await exigirAdmin(ctx);
  const body = await leerJSON(ctx.req);
  const id = aInt(ctx.params.id);
  const u = await ctx.db.get('SELECT id FROM usuarios WHERE id = ?', [id]);
  if (!u) throw error(404, 'no_encontrado', 'Socio no encontrado.');
  const coronas = aInt(body.coronas);
  const nota = typeof body.nota === 'string' ? body.nota.trim() : '';
  if (coronas === null || coronas === 0 || Math.abs(coronas) > 100000) throw error(400, 'monto_invalido', 'El ajuste debe ser un entero distinto de 0 (máximo ±$100.000).');
  if (nota.length < 5 || nota.length > 200) throw error(400, 'nota_invalida', 'Escribe el motivo del ajuste (5 a 200 caracteres).');
  await ctx.db.run(
    `INSERT INTO movimientos (usuario_id, tipo, coronas, gasto, gasto_fecha, efectivo_desde, creado_en, nota)
     VALUES (?, 'ajuste', ?, 0, ?, ?, ?, ?)`,
    [id, coronas, ctx.ahora, ctx.ahora, ctx.ahora, nota],
  );
  await auditar(ctx.db, 'admin', 'ajuste_saldo', { usuario: id, coronas, nota }, ctx.ahora);
  return json({ ok: true });
}

export async function cambiarEstadoSocio(ctx) {
  await exigirAdmin(ctx);
  const body = await leerJSON(ctx.req);
  const id = aInt(ctx.params.id);
  if (!['activo', 'bloqueado'].includes(body.estado)) throw error(400, 'estado_invalido', 'Estado inválido.');
  const r = await ctx.db.run("UPDATE usuarios SET estado = ? WHERE id = ? AND estado != 'eliminado'", [body.estado, id]);
  if (r.changes === 0) throw error(404, 'no_encontrado', 'Socio no encontrado.');
  if (body.estado === 'bloqueado') await ctx.db.run('DELETE FROM sesiones WHERE usuario_id = ?', [id]);
  await auditar(ctx.db, 'admin', 'estado_socio', { usuario: id, estado: body.estado }, ctx.ahora);
  return json({ ok: true });
}

export async function marcarPersonal(ctx) {
  await exigirAdmin(ctx);
  const body = await leerJSON(ctx.req);
  const id = aInt(ctx.params.id);
  if (typeof body.es_personal !== 'boolean') throw error(400, 'dato_invalido', 'Indica si es del equipo o no.');
  const u = await ctx.db.get('SELECT tel_hash FROM usuarios WHERE id = ?', [id]);
  if (!u) throw error(404, 'no_encontrado', 'Socio no encontrado.');
  await ctx.db.batch([
    ['UPDATE usuarios SET es_personal = ? WHERE id = ?', [body.es_personal ? 1 : 0, id]],
    body.es_personal
      ? ['INSERT OR IGNORE INTO personal (tel_hash, etiqueta, creado_en) VALUES (?, ?, ?)', [u.tel_hash, 'marcado desde socios', ctx.ahora]]
      : ['DELETE FROM personal WHERE tel_hash = ?', [u.tel_hash]],
  ]);
  await auditar(ctx.db, 'admin', 'marcar_personal', { usuario: id, es_personal: body.es_personal }, ctx.ahora);
  return json({ ok: true });
}

export async function agregarPersonal(ctx) {
  await exigirAdmin(ctx);
  const body = await leerJSON(ctx.req);
  const tel = normalizarTelefono(body.telefono);
  if (!tel) throw error(400, 'telefono_invalido', 'Teléfono inválido.');
  const h = await hmac(ctx.secreto, `tel:${tel}`);
  await ctx.db.batch([
    ['INSERT OR IGNORE INTO personal (tel_hash, etiqueta, creado_en) VALUES (?, ?, ?)', [h, String(body.etiqueta || '').slice(0, 40), ctx.ahora]],
    ['UPDATE usuarios SET es_personal = 1 WHERE tel_hash = ?', [h]],
  ]);
  await auditar(ctx.db, 'admin', 'agregar_personal', { etiqueta: body.etiqueta }, ctx.ahora);
  return json({ ok: true });
}

/* ───────────────────────── Boletas ───────────────────────── */

export async function listarBoletasAdmin(ctx) {
  await exigirAdmin(ctx);
  const local = ctx.url.searchParams.get('local');
  const estado = ctx.url.searchParams.get('estado');
  const cond = [];
  const params = [];
  if (local) {
    cond.push('l.codigo = ?');
    params.push(local);
  }
  if (['emitida', 'reclamada', 'anulada'].includes(estado)) {
    cond.push('b.estado = ?');
    params.push(estado);
  }
  const filas = await ctx.db.all(
    `SELECT b.id, b.folio, b.codigo, b.monto, b.comensales, b.estado, b.emitida_en, l.codigo AS local,
       u.nombre AS pagador, m.personas
     FROM boletas b JOIN locales l ON l.id = b.local_id
     LEFT JOIN mesas m ON m.boleta_id = b.id LEFT JOIN usuarios u ON u.id = m.pagador_id
     ${cond.length ? 'WHERE ' + cond.join(' AND ') : ''} ORDER BY b.emitida_en DESC LIMIT 150`,
    params,
  );
  return json({ boletas: filas });
}

/* ───────────────────────── Locales ───────────────────────── */

export async function listarLocales(ctx) {
  await exigirAdmin(ctx);
  const filas = await ctx.db.all('SELECT id, codigo, nombre, direccion, activo, (pin_hash IS NOT NULL) AS tiene_pin, (api_key_hash IS NOT NULL) AS tiene_api FROM locales ORDER BY id');
  return json({ locales: filas.map((f) => ({ ...f, activo: !!f.activo, tiene_pin: !!f.tiene_pin, tiene_api: !!f.tiene_api })) });
}

async function crearLocal(ctx, codigo, nombre, direccion, pin) {
  const apiKey = 'rey_' + tokenAleatorio(24);
  const r = await ctx.db.run(
    'INSERT INTO locales (codigo, nombre, direccion, pin_hash, api_key_hash, activo, creado_en) VALUES (?, ?, ?, ?, ?, 1, ?)',
    [codigo, nombre, direccion || null, null, await sha256(apiKey), ctx.ahora],
  );
  await ctx.db.run('UPDATE locales SET pin_hash = ? WHERE id = ?', [await hmac(ctx.secreto, `pin:${r.lastRowId}:${pin}`), r.lastRowId]);
  return { id: r.lastRowId, codigo, nombre, pin, api_key: apiKey };
}

export async function nuevoLocal(ctx) {
  await exigirAdmin(ctx);
  const body = await leerJSON(ctx.req);
  const codigo = String(body.codigo || '').trim().toUpperCase();
  const nombre = String(body.nombre || '').trim();
  if (!/^[A-Z0-9-]{2,20}$/.test(codigo)) throw error(400, 'codigo_invalido', 'El código del local debe tener 2 a 20 letras, números o guiones.');
  if (nombre.length < 2 || nombre.length > 60) throw error(400, 'nombre_invalido', 'El nombre del local debe tener entre 2 y 60 caracteres.');
  const pin = typeof body.pin === 'string' && /^\d{4,8}$/.test(body.pin) ? body.pin : digitosAleatorios(4);
  try {
    const l = await crearLocal(ctx, codigo, nombre, String(body.direccion || '').slice(0, 120), pin);
    await auditar(ctx.db, 'admin', 'nuevo_local', { codigo }, ctx.ahora);
    return json({ ok: true, local: l }, 201);
  } catch (e) {
    if (/UNIQUE/i.test(String(e?.message))) throw error(409, 'local_repetido', 'Ya existe un local con ese código.');
    throw e;
  }
}

export async function localesEjemplo(ctx) {
  await exigirAdmin(ctx);
  await leerJSON(ctx.req);
  const creados = [];
  for (const [codigo, nombre, direccion] of LOCALES_EJEMPLO) {
    const ya = await ctx.db.get('SELECT id FROM locales WHERE codigo = ?', [codigo]);
    if (ya) continue;
    creados.push(await crearLocal(ctx, codigo, nombre, direccion, digitosAleatorios(4)));
  }
  await auditar(ctx.db, 'admin', 'locales_ejemplo', { creados: creados.length }, ctx.ahora);
  return json({ ok: true, creados });
}

export async function editarLocal(ctx) {
  await exigirAdmin(ctx);
  const body = await leerJSON(ctx.req);
  const id = aInt(ctx.params.id);
  const l = await ctx.db.get('SELECT * FROM locales WHERE id = ?', [id]);
  if (!l) throw error(404, 'no_encontrado', 'Local no encontrado.');
  const nombre = body.nombre !== undefined ? String(body.nombre).trim() : l.nombre;
  if (nombre.length < 2 || nombre.length > 60) throw error(400, 'nombre_invalido', 'El nombre del local debe tener entre 2 y 60 caracteres.');
  const direccion = body.direccion !== undefined ? String(body.direccion).slice(0, 120) : l.direccion;
  const activo = typeof body.activo === 'boolean' ? (body.activo ? 1 : 0) : l.activo;
  await ctx.db.run('UPDATE locales SET nombre = ?, direccion = ?, activo = ? WHERE id = ?', [nombre, direccion, activo, id]);
  if (!activo) await ctx.db.run('DELETE FROM sesiones WHERE tipo = ? AND local_id = ?', ['staff', id]);
  return json({ ok: true });
}

export async function cambiarPin(ctx) {
  await exigirAdmin(ctx);
  const body = await leerJSON(ctx.req);
  const id = aInt(ctx.params.id);
  const l = await ctx.db.get('SELECT id FROM locales WHERE id = ?', [id]);
  if (!l) throw error(404, 'no_encontrado', 'Local no encontrado.');
  const pin = typeof body.pin === 'string' && /^\d{4,8}$/.test(body.pin) ? body.pin : digitosAleatorios(4);
  await ctx.db.run('UPDATE locales SET pin_hash = ? WHERE id = ?', [await hmac(ctx.secreto, `pin:${id}:${pin}`), id]);
  await ctx.db.run('DELETE FROM sesiones WHERE tipo = ? AND local_id = ?', ['staff', id]);
  await auditar(ctx.db, 'admin', 'cambiar_pin', { local: id }, ctx.ahora);
  return json({ ok: true, pin });
}

export async function regenerarApiKey(ctx) {
  await exigirAdmin(ctx);
  await leerJSON(ctx.req);
  const id = aInt(ctx.params.id);
  const l = await ctx.db.get('SELECT id FROM locales WHERE id = ?', [id]);
  if (!l) throw error(404, 'no_encontrado', 'Local no encontrado.');
  const apiKey = 'rey_' + tokenAleatorio(24);
  await ctx.db.run('UPDATE locales SET api_key_hash = ? WHERE id = ?', [await sha256(apiKey), id]);
  await auditar(ctx.db, 'admin', 'regenerar_api_key', { local: id }, ctx.ahora);
  return json({ ok: true, api_key: apiKey });
}

/* ───────────────────────── Configuración ───────────────────────── */

export async function verConfig(ctx) {
  await exigirAdmin(ctx);
  return json({ config: ctx.cfg, mvp: ctx.mvp });
}

export async function guardarConfigAdmin(ctx) {
  await exigirAdmin(ctx);
  const body = await leerJSON(ctx.req, 20_000);
  const v = validarConfig(body.config);
  if (!v.ok) throw error(400, 'config_invalida', 'La configuración tiene errores.', { errores: v.errores });
  await guardarConfig(ctx.db, v.config, ctx.ahora);
  await auditar(ctx.db, 'admin', 'guardar_config', undefined, ctx.ahora);
  return json({ ok: true, config: v.config });
}

/* ───────────────────────── Códigos de prueba (modo MVP) ───────────────────────── */

export async function listarCodigosPrueba(ctx) {
  await exigirAdmin(ctx);
  const filas = await ctx.db.all('SELECT codigo, monto, personas, nota, activo FROM codigos_prueba ORDER BY monto, codigo');
  return json({ mvp: ctx.mvp, codigos: filas });
}

export async function guardarCodigoPrueba(ctx) {
  await exigirAdmin(ctx);
  const b = await leerJSON(ctx.req, 5_000);
  const codigo = normalizarCodigo(String(b.codigo ?? ''));
  const monto = aInt(b.monto);
  const personas = aInt(b.personas);
  if (!/^[A-Z0-9]{3,12}$/.test(codigo)) throw error(400, 'codigo_invalido', 'El código debe tener entre 3 y 12 letras o números.');
  if (monto === null || monto < 1000 || monto > 20_000_000) throw error(400, 'monto_invalido', 'El monto debe estar entre $1.000 y $20.000.000.');
  if (personas === null || personas < 1 || personas > ctx.cfg.max_personas) throw error(400, 'personas_invalidas', `Las personas deben estar entre 1 y ${ctx.cfg.max_personas}.`);
  const nota = typeof b.nota === 'string' ? b.nota.trim().slice(0, 120) : '';
  const activo = b.activo === false ? 0 : 1;
  await ctx.db.run(
    `INSERT INTO codigos_prueba (codigo, monto, personas, nota, activo, creado_en) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(codigo) DO UPDATE SET monto = excluded.monto, personas = excluded.personas, nota = excluded.nota, activo = excluded.activo`,
    [codigo, monto, personas, nota, activo, ctx.ahora],
  );
  await auditar(ctx.db, 'admin', 'guardar_codigo_prueba', { codigo, monto, personas }, ctx.ahora);
  return json({ ok: true });
}

export async function borrarCodigoPrueba(ctx) {
  await exigirAdmin(ctx);
  const b = await leerJSON(ctx.req, 2_000);
  await ctx.db.run('DELETE FROM codigos_prueba WHERE codigo = ?', [normalizarCodigo(String(b.codigo ?? ''))]);
  await auditar(ctx.db, 'admin', 'borrar_codigo_prueba', { codigo: b.codigo }, ctx.ahora);
  return json({ ok: true });
}

export async function verAuditoria(ctx) {
  await exigirAdmin(ctx);
  const filas = await ctx.db.all('SELECT * FROM auditoria ORDER BY id DESC LIMIT 100');
  return json({ auditoria: filas.map((f) => ({ ...f, detalle: f.detalle ? JSON.parse(f.detalle) : null })) });
}

/* ───────────────────────── Importación desde Excel (CSV) ───────────────────────── */

function partirCSV(texto) {
  const filas = [];
  const primera = texto.split(/\r?\n/, 1)[0] || '';
  const delim = (primera.match(/;/g) || []).length > (primera.match(/,/g) || []).length ? ';' : ',';
  let campo = '';
  let fila = [];
  let comillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (comillas) {
      if (c === '"' && texto[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (c === '"') comillas = false;
      else campo += c;
    } else if (c === '"') comillas = true;
    else if (c === delim) {
      fila.push(campo);
      campo = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      fila.push(campo);
      campo = '';
      if (fila.some((x) => x.trim() !== '')) filas.push(fila);
      fila = [];
    } else campo += c;
  }
  fila.push(campo);
  if (fila.some((x) => x.trim() !== '')) filas.push(fila);
  return filas;
}

const quitarTildes = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const ALIAS = {
  local: ['local', 'sucursal', 'tienda'],
  folio: ['folio', 'numero', 'boleta', 'nro'],
  monto: ['monto', 'total', 'valor'],
  fecha: ['fecha', 'emitida', 'emitida_en', 'fecha_emision', 'hora'],
  comensales: ['comensales', 'personas', 'pax'],
  codigo: ['codigo', 'code'],
  canje: ['canje', 'canje_codigo', 'ficha'],
};

export async function importarCSV(ctx) {
  await exigirAdmin(ctx);
  const body = await leerJSON(ctx.req, 2_000_000);
  if (typeof body.csv !== 'string' || !body.csv.trim()) throw error(400, 'csv_vacio', 'Pega el contenido del archivo.');
  const filas = partirCSV(body.csv);
  if (filas.length < 2) throw error(400, 'csv_vacio', 'El archivo necesita una fila de títulos y al menos una boleta.');
  if (filas.length > 201) throw error(400, 'csv_muy_grande', 'Máximo 200 boletas por solicitud (la pantalla de importación las envía en tandas).');
  const cab = filas[0].map((x) => quitarTildes(x.trim().toLowerCase()).replace(/\s+/g, '_'));
  const col = {};
  for (const [k, nombres] of Object.entries(ALIAS)) col[k] = cab.findIndex((c) => nombres.includes(c));
  for (const req of ['local', 'folio', 'monto']) {
    if (col[req] < 0) throw error(400, 'csv_columnas', `Falta la columna "${req}". Títulos encontrados: ${cab.join(', ')}`);
  }
  const resultado = { creadas: 0, repetidas: 0, errores: [] };
  const cacheLocales = new Map();
  for (let i = 1; i < filas.length; i++) {
    const f = filas[i];
    const cod = (f[col.local] || '').trim().toUpperCase();
    try {
      if (!cacheLocales.has(cod)) cacheLocales.set(cod, await ctx.db.get('SELECT * FROM locales WHERE codigo = ? AND activo = 1', [cod]));
      const local = cacheLocales.get(cod);
      if (!local) throw error(400, 'local_desconocido', `Local desconocido: "${cod}"`);
      const monto = (f[col.monto] || '').replace(/[$.\s]/g, '').replace(',', '.');
      const fecha = col.fecha >= 0 && (f[col.fecha] || '').trim() ? fechaAMs((f[col.fecha] || '').trim()) : null;
      if (col.fecha >= 0 && (f[col.fecha] || '').trim() && fecha === null) throw error(400, 'fecha_invalida', 'Fecha no válida');
      const r = await registrarBoleta(ctx, local, {
        folio: (f[col.folio] || '').trim(),
        monto: monto === '' ? NaN : Number(monto),
        comensales: col.comensales >= 0 ? (f[col.comensales] || '').trim() || undefined : undefined,
        emitida_en: fecha ?? undefined,
        codigo: col.codigo >= 0 ? (f[col.codigo] || '').trim() || undefined : undefined,
        canje_codigo: col.canje >= 0 ? (f[col.canje] || '').trim() || undefined : undefined,
      });
      if (r.repetida) resultado.repetidas++;
      else resultado.creadas++;
    } catch (e) {
      resultado.errores.push({ fila: i + 1, motivo: e.message || 'Error' });
      if (resultado.errores.length >= 50) break;
    }
  }
  await auditar(ctx.db, 'admin', 'importar_csv', { creadas: resultado.creadas, repetidas: resultado.repetidas, errores: resultado.errores.length }, ctx.ahora);
  return json({ ok: true, ...resultado });
}
