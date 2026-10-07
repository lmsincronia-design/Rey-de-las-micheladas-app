// Piezas de HTTP compartidas: errores, respuestas JSON, cookies, límites de uso.

export class ApiError extends Error {
  constructor(estado, codigo, mensaje, extra = {}) {
    super(mensaje);
    this.estado = estado;
    this.codigo = codigo;
    this.extra = extra;
  }
}

export const error = (estado, codigo, mensaje, extra) => new ApiError(estado, codigo, mensaje, extra);

export function json(datos, estado = 200, cabeceras = {}) {
  const h = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  for (const [k, v] of Object.entries(cabeceras)) {
    if (Array.isArray(v)) v.forEach((x) => h.append(k, x));
    else h.set(k, v);
  }
  return new Response(JSON.stringify(datos), { status: estado, headers: h });
}

export function leerCookies(req) {
  const salida = {};
  const raw = req.headers.get('cookie');
  if (!raw) return salida;
  for (const par of raw.split(';')) {
    const i = par.indexOf('=');
    if (i < 0) continue;
    salida[par.slice(0, i).trim()] = decodeURIComponent(par.slice(i + 1).trim());
  }
  return salida;
}

export function crearCookie(nombre, valor, { maxAgeSeg, seguro = true } = {}) {
  let c = `${nombre}=${encodeURIComponent(valor)}; Path=/; HttpOnly; SameSite=Lax`;
  if (maxAgeSeg !== undefined) c += `; Max-Age=${maxAgeSeg}`;
  if (seguro) c += '; Secure';
  return c;
}

export const borrarCookie = (nombre, seguro = true) => crearCookie(nombre, '', { maxAgeSeg: 0, seguro });

/** Solo JSON (los navegadores no pueden mandar JSON entre sitios sin permiso: protege contra CSRF). */
export async function leerJSON(req, maxBytes = 50_000) {
  const tipo = req.headers.get('content-type') || '';
  if (!tipo.toLowerCase().includes('application/json')) throw error(415, 'tipo_invalido', 'Se esperaba JSON.');
  const texto = await req.text();
  if (texto.length > maxBytes) throw error(413, 'muy_grande', 'La solicitud es demasiado grande.');
  if (!texto.trim()) return {};
  try {
    const v = JSON.parse(texto);
    if (v === null || typeof v !== 'object' || Array.isArray(v)) throw new Error('no objeto');
    return v;
  } catch {
    throw error(400, 'json_invalido', 'No se pudo leer la solicitud.');
  }
}

/**
 * Contador por ventana de tiempo, atómico (un solo UPSERT).
 * Devuelve { ok, cuenta, max }. Cada llamada cuenta como un intento.
 */
export async function limitar(db, clave, max, ventanaMs, ahora) {
  await db.run(
    `INSERT INTO rate_limits (clave, inicio, cuenta) VALUES (?, ?, 1)
     ON CONFLICT(clave) DO UPDATE SET
       cuenta = CASE WHEN ? - inicio >= ? THEN 1 ELSE cuenta + 1 END,
       inicio = CASE WHEN ? - inicio >= ? THEN ? ELSE inicio END`,
    [clave, ahora, ahora, ventanaMs, ahora, ventanaMs, ahora],
  );
  const f = await db.get('SELECT cuenta, inicio FROM rate_limits WHERE clave = ?', [clave]);
  return { ok: f.cuenta <= max, cuenta: f.cuenta, max, reintentarMs: Math.max(0, f.inicio + ventanaMs - ahora) };
}

/** ¿Ya se alcanzó el máximo en esta ventana? No suma un intento (úsalo antes, y suma con limitar() al fallar). */
export async function exigirNoBloqueado(db, clave, max, ventanaMs, ahora, mensaje = 'Demasiados intentos. Espera un momento y vuelve a probar.') {
  const f = await db.get('SELECT cuenta, inicio FROM rate_limits WHERE clave = ?', [clave]);
  if (f && ahora - f.inicio < ventanaMs && f.cuenta >= max) {
    throw error(429, 'demasiados_intentos', mensaje, { reintentar_seg: Math.ceil((f.inicio + ventanaMs - ahora) / 1000) });
  }
}

export async function exigirLimite(db, clave, max, ventanaMs, ahora, mensaje = 'Demasiados intentos. Espera un momento y vuelve a probar.') {
  const r = await limitar(db, clave, max, ventanaMs, ahora);
  if (!r.ok) throw error(429, 'demasiados_intentos', mensaje, { reintentar_seg: Math.ceil(r.reintentarMs / 1000) });
  return r;
}

export async function auditar(db, actor, accion, detalle, ahora) {
  await db.run('INSERT INTO auditoria (actor, accion, detalle, creado_en) VALUES (?, ?, ?, ?)', [
    actor,
    accion,
    detalle === undefined ? null : JSON.stringify(detalle),
    ahora,
  ]);
}

export async function crearAlerta(db, tipo, usuarioId, detalle, ahora) {
  await db.run('INSERT INTO alertas (tipo, usuario_id, detalle, creado_en) VALUES (?, ?, ?, ?)', [
    tipo,
    usuarioId ?? null,
    detalle === undefined ? null : JSON.stringify(detalle),
    ahora,
  ]);
}
