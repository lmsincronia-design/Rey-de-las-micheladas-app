// Lo que ve la caja de cada local: emitir/anular boletas (por API) y validar fichas de canje.
import { error, json, leerJSON, exigirLimite, auditar } from './lib/http.js';
import {
  MIN, DIA, sha256, hmac, iguales, codigoAleatorio, normalizarCodigo, aInt, diaChile, nombrePila, fechaAMs,
} from './lib/util.js';
import { crearSesion, leerSesion, cerrarSesionTipo } from './auth.js';
import { liberarFichasVencidas, infoRango } from './lib/club.js';
import { buscarSocios, acreditarSocios, textoInvalidos, MAX_SOCIOS_POR_BOLETA } from './lib/acreditar.js';

const fmt = (n) => '$' + Math.round(n).toLocaleString('es-CL');

/* ───────────────────────── Autenticación del local ───────────────────────── */

export async function localesPublicos(ctx) {
  const filas = await ctx.db.all('SELECT codigo, nombre FROM locales WHERE activo = 1 ORDER BY id');
  return json({ locales: filas });
}

/** Valida local + PIN (con límites contra adivinanza). Lo usan la pantalla de caja y la confirmación de canje en el celular del cliente. */
export async function verificarPinLocal(ctx, codigoCrudo, pinCrudo, { desdeCliente = null } = {}) {
  const codigoLocal = typeof codigoCrudo === 'string' ? codigoCrudo.trim().toUpperCase() : '';
  const pin = typeof pinCrudo === 'string' ? pinCrudo.trim() : '';
  const aviso = 'Demasiados intentos con el PIN. Espera unos minutos.';
  if (desdeCliente) {
    // Desde el celular de un cliente los intentos van en cubetas propias: así nadie puede bloquear la pantalla de caja del local
    // adivinando a propósito, y aun así adivinar el PIN queda inviable (por cuenta, por IP y por local).
    await exigirLimite(ctx.db, `confirmar:u:${desdeCliente}`, 10, 10 * MIN, ctx.ahora, aviso);
    await exigirLimite(ctx.db, `confirmar:ip:${ctx.ip}`, 30, 10 * MIN, ctx.ahora, aviso);
    await exigirLimite(ctx.db, `confirmar:local:${codigoLocal}`, 60, 60 * MIN, ctx.ahora, aviso);
  } else {
    await exigirLimite(ctx.db, `staff:ip:${ctx.ip}`, 30, 10 * MIN, ctx.ahora);
    await exigirLimite(ctx.db, `staff:local:${codigoLocal}`, 10, 10 * MIN, ctx.ahora, aviso);
  }
  const local = await ctx.db.get('SELECT * FROM locales WHERE codigo = ? AND activo = 1', [codigoLocal]);
  const esperado = local?.pin_hash || '';
  const dado = await hmac(ctx.secreto, `pin:${local?.id ?? 0}:${pin}`);
  if (!local || !pin || !iguales(dado, esperado)) throw error(401, 'pin_incorrecto', 'Local o PIN incorrecto.');
  return local;
}

export async function loginLocal(ctx) {
  const body = await leerJSON(ctx.req);
  const local = await verificarPinLocal(ctx, body.local, body.pin);
  const { cookie } = await crearSesion(ctx, 'staff', { localId: local.id });
  return json({ ok: true, local: { id: local.id, codigo: local.codigo, nombre: local.nombre } }, 200, { 'set-cookie': cookie });
}

export async function salirLocal(ctx) {
  const cookie = await cerrarSesionTipo(ctx, 'staff');
  return json({ ok: true }, 200, { 'set-cookie': cookie });
}

/** Devuelve { local, via } con via = 'api' (llave de la caja) o 'sesion' (PIN en la pantalla de caja). */
export async function exigirLocal(ctx) {
  const auth = ctx.req.headers.get('authorization') || '';
  const m = /^Bearer\s+(\S+)$/i.exec(auth);
  if (m) {
    const local = await ctx.db.get('SELECT * FROM locales WHERE api_key_hash = ? AND activo = 1', [await sha256(m[1])]);
    if (!local) throw error(401, 'llave_invalida', 'Llave de API inválida.');
    return { local, via: 'api' };
  }
  const s = await leerSesion(ctx, 'staff');
  if (!s) throw error(401, 'no_autenticado', 'Ingresa con el PIN del local.');
  const local = await ctx.db.get('SELECT * FROM locales WHERE id = ? AND activo = 1', [s.local_id]);
  if (!local) throw error(401, 'no_autenticado', 'Ingresa con el PIN del local.');
  return { local, via: 'sesion' };
}

export async function yoLocal(ctx) {
  const { local, via } = await exigirLocal(ctx);
  return json({ local: { id: local.id, codigo: local.codigo, nombre: local.nombre }, via, demo: ctx.demo });
}

/* ───────────────────────── Fichas ───────────────────────── */

function vistaFicha(f, cliente, rango, ahora) {
  return {
    codigo: f.codigo,
    tipo: f.tipo,
    monto: f.monto,
    descripcion: f.descripcion,
    estado: f.estado,
    vence_en: f.vence_en,
    restante_seg: Math.max(0, Math.ceil((f.vence_en - ahora) / 1000)),
    monto_aplicado: f.monto_aplicado,
    cliente: cliente ? { nombre: nombrePila(cliente.nombre), rango: rango?.nombre, rango_id: rango?.id } : null,
    pedir_cedula: f.tipo === 'regalo',
  };
}

async function cargarFicha(ctx, codigoCrudo) {
  const codigo = normalizarCodigo(codigoCrudo || '');
  if (!/^[A-HJKMNP-Z2-9]{6}$/.test(codigo)) throw error(400, 'codigo_invalido', 'El código son 6 letras y números.');
  const f = await ctx.db.get('SELECT * FROM fichas WHERE codigo = ?', [codigo]);
  if (!f) throw error(404, 'ficha_no_encontrada', 'No existe una ficha con ese código.');
  return f;
}

export async function verFicha(ctx) {
  await exigirLocal(ctx);
  await exigirLimite(ctx.db, `ficha:ip:${ctx.ip}`, 60, 10 * MIN, ctx.ahora);
  const f = await cargarFicha(ctx, ctx.params.codigo);
  const u = await ctx.db.get('SELECT id, nombre FROM usuarios WHERE id = ?', [f.usuario_id]);
  const { rango } = await infoRango(ctx.db, f.usuario_id, ctx.cfg, ctx.ahora);
  return json({ ficha: vistaFicha(f, u, rango, ctx.ahora) });
}

/** Aplica la ficha al descuento de una boleta. Usada por la pantalla de caja y por la integración (canje_codigo). */
export async function aplicarFichaInterna(ctx, local, codigoCrudo, { montoAplicado = null, boletaId = null } = {}) {
  const f = await cargarFicha(ctx, codigoCrudo);
  if (f.estado === 'usada') throw error(409, 'ficha_usada', 'Esa ficha ya se usó.');
  if (f.estado !== 'reservada') throw error(410, 'ficha_no_vigente', 'Esa ficha ya no está vigente. El cliente debe generar otra.');
  if (f.vence_en + ctx.cfg.canje_gracia_seg * 1000 < ctx.ahora) {
    await liberarFichasVencidas(ctx.db, ctx.ahora, f.usuario_id);
    throw error(410, 'ficha_vencida', 'La ficha venció. El cliente debe generar otra (las coronas ya volvieron a su saldo).');
  }
  const aplicado = montoAplicado === null ? f.monto : montoAplicado;
  if (!Number.isInteger(aplicado) || aplicado < 0 || aplicado > f.monto) {
    throw error(400, 'monto_invalido', `El descuento aplicado debe estar entre $0 y ${fmt(f.monto)}.`);
  }
  const gracia = ctx.cfg.canje_gracia_seg * 1000;
  const res = await ctx.db.batch([
    [
      `UPDATE fichas SET estado = 'usada', usada_en = ?, monto_aplicado = ?, local_id = ?
       WHERE id = ? AND estado = 'reservada' AND vence_en + ? >= ?`,
      [ctx.ahora, aplicado, local.id, f.id, gracia, ctx.ahora],
    ],
    [
      `INSERT OR IGNORE INTO movimientos (usuario_id, tipo, coronas, gasto, gasto_fecha, efectivo_desde, creado_en, ref, ficha_id, local_id, nota)
       SELECT f.usuario_id, 'uso_dif', f.monto - f.monto_aplicado, 0, ?, ?, ?, 'dif:' || f.id, f.id, f.local_id, 'Coronas devueltas: descuento menor al reservado'
       FROM fichas f WHERE f.id = ? AND f.estado = 'usada' AND f.monto_aplicado < f.monto`,
      [ctx.ahora, ctx.ahora, ctx.ahora, f.id],
    ],
  ]);
  if (res[0].changes === 0) {
    const actual = await ctx.db.get('SELECT estado FROM fichas WHERE id = ?', [f.id]);
    if (actual?.estado === 'usada') throw error(409, 'ficha_usada', 'Esa ficha ya se usó.');
    throw error(410, 'ficha_no_vigente', 'Esa ficha ya no está vigente. El cliente debe generar otra.');
  }
  if (boletaId) await ctx.db.run('UPDATE boletas SET canje_ficha_id = ? WHERE id = ?', [f.id, boletaId]);
  await auditar(ctx.db, `local:${local.codigo}`, 'aplicar_ficha', { ficha: f.codigo, aplicado }, ctx.ahora);
  const u = await ctx.db.get('SELECT id, nombre FROM usuarios WHERE id = ?', [f.usuario_id]);
  const { rango } = await infoRango(ctx.db, f.usuario_id, ctx.cfg, ctx.ahora);
  const actualizada = await ctx.db.get('SELECT * FROM fichas WHERE id = ?', [f.id]);
  return vistaFicha(actualizada, u, rango, ctx.ahora);
}

export async function aplicarFicha(ctx) {
  const { local } = await exigirLocal(ctx);
  const body = await leerJSON(ctx.req);
  await exigirLimite(ctx.db, `ficha:ip:${ctx.ip}`, 60, 10 * MIN, ctx.ahora);
  let aplicado = null;
  if (body.monto_aplicado !== undefined && body.monto_aplicado !== null) {
    aplicado = aInt(body.monto_aplicado);
    if (aplicado === null) throw error(400, 'monto_invalido', 'El monto aplicado no es válido.');
  }
  const ficha = await aplicarFichaInterna(ctx, local, ctx.params.codigo, { montoAplicado: aplicado });
  return json({ ok: true, ficha });
}

/* ───────────────────────── Boletas ───────────────────────── */

function parsearFecha(v, ahora) {
  if (v === undefined || v === null || v === '') return ahora;
  return fechaAMs(v);
}

/**
 * Registra una boleta emitida por la caja. Idempotente por (local, folio).
 * `datos`: { folio, monto, comensales?, emitida_en?, codigo?, canje_codigo? }
 */
export async function registrarBoleta(ctx, local, datos) {
  const folio = typeof datos.folio === 'number' ? String(datos.folio) : typeof datos.folio === 'string' ? datos.folio.trim() : '';
  if (!/^[A-Za-z0-9_-]{1,30}$/.test(folio)) throw error(400, 'folio_invalido', 'El folio debe tener entre 1 y 30 letras, números o guiones.');
  const monto = aInt(datos.monto);
  if (monto === null || monto < 1 || monto > 20_000_000) throw error(400, 'monto_invalido', 'El monto debe ser un entero en pesos entre $1 y $20.000.000.');
  let comensales = null;
  if (datos.comensales !== undefined && datos.comensales !== null && datos.comensales !== '') {
    comensales = aInt(datos.comensales);
    if (comensales === null || comensales < 1 || comensales > ctx.cfg.max_personas) {
      throw error(400, 'comensales_invalidos', `Los comensales deben estar entre 1 y ${ctx.cfg.max_personas}.`);
    }
  }
  const emitida = parsearFecha(datos.emitida_en, ctx.ahora);
  if (emitida === null) throw error(400, 'fecha_invalida', 'La fecha de emisión no es válida.');
  if (emitida > ctx.ahora + 10 * MIN) throw error(400, 'fecha_futura', 'La fecha de emisión está en el futuro.');
  let codigoPropio = null;
  if (datos.codigo !== undefined && datos.codigo !== null && datos.codigo !== '') {
    codigoPropio = normalizarCodigo(String(datos.codigo));
    if (!/^[A-HJKMNP-Z2-9]{6}$/.test(codigoPropio)) throw error(400, 'codigo_invalido', 'El código de boleta son 6 letras y números (sin O, I, L, 0, 1).');
  }

  const existente = await ctx.db.get('SELECT * FROM boletas WHERE local_id = ? AND folio = ?', [local.id, folio]);
  let boleta;
  let repetida = false;
  if (existente) {
    if (existente.monto !== monto) throw error(409, 'folio_distinto', 'Ese folio ya existe con otro monto.', { codigo_boleta: existente.codigo });
    boleta = existente;
    repetida = true;
  } else {
    for (let i = 0; i < 8; i++) {
      const codigo = codigoPropio || codigoAleatorio(6);
      try {
        const r = await ctx.db.run(
          `INSERT INTO boletas (local_id, folio, monto, comensales, emitida_en, codigo, estado, creado_en)
           VALUES (?, ?, ?, ?, ?, ?, 'emitida', ?)`,
          [local.id, folio, monto, comensales, emitida, codigo, ctx.ahora],
        );
        boleta = await ctx.db.get('SELECT * FROM boletas WHERE id = ?', [r.lastRowId]);
        break;
      } catch (e) {
        const msg = String(e?.message);
        if (/boletas\.codigo/i.test(msg)) {
          if (codigoPropio) throw error(409, 'codigo_repetido', 'Ese código de boleta ya existe.');
          continue;
        }
        if (/boletas\.local_id/i.test(msg) || /boletas\.folio/i.test(msg)) {
          const otra = await ctx.db.get('SELECT * FROM boletas WHERE local_id = ? AND folio = ?', [local.id, folio]);
          boleta = otra;
          repetida = true;
          break;
        }
        throw e;
      }
    }
    if (!boleta) throw error(500, 'sin_codigo', 'No se pudo generar el código de la boleta.');
  }

  let canje = null;
  if (datos.canje_codigo) {
    try {
      const f = await ctx.db.get('SELECT * FROM fichas WHERE codigo = ?', [normalizarCodigo(String(datos.canje_codigo))]);
      const yaDescontada = f && f.estado === 'usada' && f.local_id === local.id && f.usada_en && ctx.ahora - f.usada_en < 6 * 60 * MIN
        && !(await ctx.db.get('SELECT 1 AS x FROM boletas WHERE canje_ficha_id = ?', [f.id]));
      if (yaDescontada) {
        // el descuento ya se aplicó en caja con el código personal del cliente: solo se vincula a esta boleta (para devolverlo si se anula)
        await ctx.db.run('UPDATE boletas SET canje_ficha_id = ? WHERE id = ?', [f.id, boleta.id]);
        canje = { ok: true, ya_aplicada: true, ficha: { codigo: f.codigo, monto_aplicado: f.monto_aplicado } };
      } else {
        const ficha = await aplicarFichaInterna(ctx, local, String(datos.canje_codigo), { boletaId: boleta.id });
        canje = { ok: true, ficha };
      }
    } catch (e) {
      canje = { ok: false, codigo: e.codigo || 'error', mensaje: e.message };
    }
  }
  const acreditacion = await acreditarDesdeCaja(ctx, local, boleta, datos);
  return { boleta: acreditacion?.ok ? { ...boleta, estado: 'reclamada' } : boleta, repetida, canje, acreditacion };
}

/** Si la caja informa los códigos personales de los socios de la mesa, la boleta se acredita al tiro (reintentable con el mismo folio). */
async function acreditarDesdeCaja(ctx, local, boleta, datos) {
  let lista = datos.socios;
  if (lista === undefined || lista === null || lista === '') return null;
  if (typeof lista === 'string') lista = lista.split(/[\s,;]+/).filter(Boolean);
  if (!Array.isArray(lista) || lista.length === 0 || lista.length > MAX_SOCIOS_POR_BOLETA) {
    return { ok: false, codigo: 'socios_invalidos', mensaje: `Indica entre 1 y ${MAX_SOCIOS_POR_BOLETA} códigos de socio (el primero es quien paga).` };
  }
  const actual = await ctx.db.get('SELECT * FROM boletas WHERE id = ?', [boleta.id]);
  if (actual.estado === 'anulada') return { ok: false, codigo: 'boleta_anulada', mensaje: 'Esa boleta fue anulada.' };
  if (actual.estado !== 'emitida') return { ok: false, codigo: 'boleta_ya_acreditada', mensaje: 'Esa boleta ya fue acreditada o reclamada por otra persona.' };
  const { usuarios, invalidos } = await buscarSocios(ctx.db, lista);
  if (invalidos.length) {
    return { ok: false, codigo: 'socios_invalidos', mensaje: `Revisa los códigos: ${textoInvalidos(invalidos)}. No se acreditó nada; reenvía la boleta con los códigos corregidos.`, invalidos };
  }
  try {
    const r = await acreditarSocios(ctx, actual, local, usuarios, actual.comensales);
    await auditar(ctx.db, `local:${local.codigo}`, 'acreditar_socios', { folio: actual.folio, socios: r.socios.map((s) => s.codigo) }, ctx.ahora);
    return r;
  } catch (e) {
    if (e.codigo) return { ok: false, codigo: e.codigo, mensaje: e.message };
    throw e;
  }
}

function vistaBoleta(b, local) {
  return {
    folio: b.folio,
    codigo: b.codigo,
    monto: b.monto,
    comensales: b.comensales,
    emitida_en: b.emitida_en,
    estado: b.estado,
    local: local ? { codigo: local.codigo, nombre: local.nombre } : undefined,
  };
}

export async function emitirBoleta(ctx) {
  const { local, via } = await exigirLocal(ctx);
  if (via === 'sesion' && !ctx.demo) {
    throw error(403, 'solo_integracion', 'Las boletas solo las registra la caja por integración (llave de API).');
  }
  const body = await leerJSON(ctx.req);
  const { boleta, repetida, canje, acreditacion } = await registrarBoleta(ctx, local, body);
  return json({ ok: true, repetida, boleta: vistaBoleta(boleta, local), canje, acreditacion }, repetida ? 200 : 201);
}

export async function anularBoleta(ctx) {
  const { local } = await exigirLocal(ctx);
  const body = await leerJSON(ctx.req);
  const folio = typeof body.folio === 'number' ? String(body.folio) : typeof body.folio === 'string' ? body.folio.trim() : '';
  const b = await ctx.db.get('SELECT * FROM boletas WHERE local_id = ? AND folio = ?', [local.id, folio]);
  if (!b) throw error(404, 'boleta_no_encontrada', 'No existe una boleta con ese folio en este local.');
  if (b.estado === 'anulada') return json({ ok: true, ya_anulada: true });
  await ctx.db.batch([
    ["UPDATE boletas SET estado = 'anulada' WHERE id = ? AND estado IN ('emitida', 'reclamada')", [b.id]],
    [
      `INSERT OR IGNORE INTO movimientos (usuario_id, tipo, coronas, gasto, gasto_fecha, efectivo_desde, creado_en, ref, mesa_id, local_id, nota)
       SELECT p.usuario_id, 'reversa', -p.coronas, -p.gasto,
         COALESCE((SELECT m2.gasto_fecha FROM movimientos m2 WHERE m2.usuario_id = p.usuario_id AND m2.ref = 'compra:' || p.id), ?),
         ?, ?, 'rev:' || p.id, p.mesa_id, ?, 'Boleta anulada'
       FROM partes p JOIN mesas m ON m.id = p.mesa_id WHERE m.boleta_id = ? AND p.estado = 'reclamada'`,
      [ctx.ahora, ctx.ahora, ctx.ahora, local.id, b.id],
    ],
    [
      `UPDATE partes SET estado = 'revertida'
       WHERE mesa_id IN (SELECT id FROM mesas WHERE boleta_id = ?) AND estado IN ('reclamada', 'libre', 'asignada')`,
      [b.id],
    ],
    ['UPDATE mesas SET expira_en = CASE WHEN expira_en > ? THEN ? ELSE expira_en END WHERE boleta_id = ?', [ctx.ahora, ctx.ahora, b.id]],
    [
      `INSERT OR IGNORE INTO movimientos (usuario_id, tipo, coronas, gasto, gasto_fecha, efectivo_desde, creado_en, ref, ficha_id, nota)
       SELECT f.usuario_id, 'liberacion', COALESCE(f.monto_aplicado, 0), 0, ?, ?, ?, 'canje_rev:' || f.id, f.id, 'Boleta anulada: coronas del canje devueltas'
       FROM fichas f WHERE f.id = (SELECT canje_ficha_id FROM boletas WHERE id = ?) AND f.estado = 'usada' AND COALESCE(f.monto_aplicado, 0) > 0`,
      [ctx.ahora, ctx.ahora, ctx.ahora, b.id],
    ],
    ["UPDATE fichas SET estado = 'revertida' WHERE id = (SELECT canje_ficha_id FROM boletas WHERE id = ?) AND estado = 'usada'", [b.id]],
  ]);
  await auditar(ctx.db, `local:${local.codigo}`, 'anular_boleta', { folio, codigo: b.codigo }, ctx.ahora);
  return json({ ok: true });
}

export async function listarBoletas(ctx) {
  const { local } = await exigirLocal(ctx);
  const dia = ctx.url.searchParams.get('dia') || diaChile(ctx.ahora);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) throw error(400, 'dia_invalido', 'Día inválido.');
  const desde = Date.parse(dia + 'T00:00:00Z') - 4 * 60 * MIN; // cubre el huso de Chile
  const filas = await ctx.db.all(
    `SELECT b.*, m.personas, (SELECT COUNT(*) FROM partes p WHERE p.mesa_id = m.id AND p.estado = 'reclamada') AS reclamadas
     FROM boletas b LEFT JOIN mesas m ON m.boleta_id = b.id
     WHERE b.local_id = ? AND b.emitida_en >= ? AND b.emitida_en < ? ORDER BY b.emitida_en DESC LIMIT 200`,
    [local.id, desde, desde + DIA + 8 * 60 * MIN],
  );
  const delDia = filas.filter((f) => diaChile(f.emitida_en) === dia);
  return json({
    dia,
    boletas: delDia.map((f) => ({ ...vistaBoleta(f), personas: f.personas ?? null, reclamadas: f.reclamadas ?? 0 })),
    total: delDia.filter((f) => f.estado !== 'anulada').reduce((a, f) => a + f.monto, 0),
  });
}
