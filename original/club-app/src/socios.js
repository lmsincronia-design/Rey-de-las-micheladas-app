// Caja ↔ socio por CÓDIGO PERSONAL. Antes de emitir la boleta, el garzón/la caja escribe el código del cliente,
// ve sus coronas al día y aplica el descuento; al emitir la boleta se la acredita con los códigos de la mesa.
import { error, json, leerJSON, exigirLimite, exigirNoBloqueado, limitar } from './lib/http.js';
import { MIN, HORA, DIA, aInt, diaChile, nombrePublico } from './lib/util.js';
import { calcularRango } from './lib/config.js';
import { infoRango, aplicarVencimiento, liberarFichasVencidas, estadoRegalo } from './lib/club.js';
import { normalizarCodigoSocio } from './lib/acreditar.js';
import { exigirLocal, aplicarFichaInterna } from './caja.js';
import { reservarCanje, cancelarFichaActiva, reservarRegalo } from './cliente.js';

const fmt = (n) => '$' + Math.round(n).toLocaleString('es-CL');
const fechaCorta = (iso) => iso.split('-').reverse().join('/');

async function cargarSocio(ctx, local) {
  const codigo = normalizarCodigoSocio(ctx.params.codigo);
  if (!/^[A-HJKMNP-Z2-9]{6}$/.test(codigo)) throw error(400, 'codigo_invalido', 'El código del cliente son 6 letras y números (sin O, I, L, 0 ni 1).');
  const clave = `socio:fallos:${local.id}`;
  await exigirNoBloqueado(ctx.db, clave, 20, 10 * MIN, ctx.ahora, 'Demasiados códigos que no existen. Espera unos minutos.');
  await exigirLimite(ctx.db, `socio:ip:${ctx.ip}`, 240, 10 * MIN, ctx.ahora);
  const u = await ctx.db.get('SELECT * FROM usuarios WHERE codigo_socio = ?', [codigo]);
  if (!u) {
    await limitar(ctx.db, clave, 20, 10 * MIN, ctx.ahora);
    throw error(404, 'socio_no_encontrado', 'No existe un socio con ese código. Pídele que lo revise en su app (pestaña "Mi código").');
  }
  if (u.estado !== 'activo') throw error(403, 'cuenta_bloqueada', 'Esa cuenta está bloqueada. No se pueden usar sus coronas.');
  if (u.es_personal) throw error(403, 'cuenta_personal', 'Es una cuenta del equipo: no acumula ni canjea coronas.');
  return u;
}

async function vistaSocio(ctx, u) {
  await aplicarVencimiento(ctx.db, u.id, ctx.cfg, ctx.ahora);
  await liberarFichasVencidas(ctx.db, ctx.ahora, u.id);
  const { saldo, rango } = await infoRango(ctx.db, u.id, ctx.cfg, ctx.ahora);
  const hoy = await ctx.db.get(
    "SELECT COUNT(*) AS n FROM fichas WHERE usuario_id = ? AND tipo = 'canje' AND dia = ? AND estado IN ('reservada', 'usada')",
    [u.id, diaChile(ctx.ahora)],
  );
  const cfg = ctx.cfg;
  const tope = Math.floor(Math.min(saldo.disponible, cfg.canje_maximo) / cfg.canje_multiplo) * cfg.canje_multiplo;
  const sugeridos = [];
  for (let v = cfg.canje_minimo; v <= tope && sugeridos.length < 6; v += cfg.canje_multiplo * 2) sugeridos.push(v);
  if (tope >= cfg.canje_minimo && !sugeridos.includes(tope)) sugeridos.push(tope);
  const regalo = await estadoRegalo(ctx.db, u, cfg, ctx.ahora);
  let motivo = null;
  if (hoy.n >= cfg.canjes_por_dia) motivo = 'Ya canjeó hoy (máximo ' + cfg.canjes_por_dia + ' por día).';
  else if (saldo.disponible < cfg.canje_minimo) motivo = saldo.por_activar > 0 ? `Tiene ${fmt(saldo.por_activar)} por activar.` : `Necesita al menos ${fmt(cfg.canje_minimo)}.`;
  return {
    socio: {
      codigo: u.codigo_socio,
      nombre: nombrePublico(u.nombre),
      rango: { id: rango.id, nombre: rango.nombre, pct: rango.pct },
      miembro_desde: u.creado_en,
      coronas: { disponible: saldo.disponible, por_activar: saldo.por_activar, proxima_activacion: saldo.proxima_activacion },
      canje: {
        puede: motivo === null, motivo, minimo: cfg.canje_minimo, maximo: cfg.canje_maximo, multiplo: cfg.canje_multiplo,
        hoy: hoy.n, por_dia: cfg.canjes_por_dia, maximo_ahora: tope >= cfg.canje_minimo ? tope : 0, sugeridos,
      },
      regalo: regalo.disponible
        ? { disponible: true, descripcion: regalo.descripcion, nacimiento: fechaCorta(u.nacimiento), pedir_cedula: true }
        : { disponible: false, motivo: regalo.motivo },
    },
  };
}

/** GET /api/caja/socios/:codigo → coronas al día del cliente. */
export async function verSocio(ctx) {
  const { local } = await exigirLocal(ctx);
  const u = await cargarSocio(ctx, local);
  return json(await vistaSocio(ctx, u));
}

/** POST /api/caja/socios/:codigo/canje {monto} → descuenta las coronas y deja el descuento listo para emitir la boleta. */
export async function canjearSocio(ctx) {
  const { local } = await exigirLocal(ctx);
  const body = await leerJSON(ctx.req);
  const u = await cargarSocio(ctx, local);
  await exigirLimite(ctx.db, `canje:u:${u.id}`, 15, HORA, ctx.ahora);
  // si el cliente había generado una ficha en su app, se reemplaza por este descuento
  await cancelarFichaActiva(ctx, u);
  const ficha = await reservarCanje(ctx, u, aInt(body.monto));
  let aplicada;
  try {
    aplicada = await aplicarFichaInterna(ctx, local, ficha.codigo);
  } catch (e) {
    await cancelarFichaActiva(ctx, u);
    throw e;
  }
  return json({
    ok: true,
    descuento: aplicada.monto_aplicado,
    canje_codigo: ficha.codigo,
    mensaje: `Descuento de ${fmt(aplicada.monto_aplicado)} aplicado. Emite la boleta con ese descuento y envíala con "canje_codigo".`,
    ...(await vistaSocio(ctx, u)),
  }, 201);
}

/** POST /api/caja/socios/:codigo/regalo {cedula_verificada:true} → entrega el regalo de cumpleaños. */
export async function regaloSocio(ctx) {
  const { local } = await exigirLocal(ctx);
  const body = await leerJSON(ctx.req);
  const u = await cargarSocio(ctx, local);
  if (body.cedula_verificada !== true) {
    throw error(400, 'falta_cedula', `Pide la cédula y confirma que coincide con el cumpleaños (${fechaCorta(u.nacimiento)}) antes de entregar el regalo.`);
  }
  await cancelarFichaActiva(ctx, u);
  const ficha = await reservarRegalo(ctx, u);
  try {
    await aplicarFichaInterna(ctx, local, ficha.codigo);
  } catch (e) {
    await cancelarFichaActiva(ctx, u);
    throw e;
  }
  return json({ ok: true, regalo: ficha.descripcion, canje_codigo: ficha.codigo, ...(await vistaSocio(ctx, u)) }, 201);
}

/**
 * Base de datos de coronas por código personal. Un solo SELECT; se usa para el listado de la caja (API) y para el CSV del panel.
 * Pagina por id: ?desde=<ultimo id recibido>&limite=500
 */
export async function consultarSocios(ctx, { desdeId = 0, limite = 500 } = {}) {
  const filas = await ctx.db.all(
    `SELECT u.id, u.codigo_socio, u.nombre, u.creado_en,
       COALESCE(SUM(CASE WHEN m.efectivo_desde <= ? THEN m.coronas ELSE 0 END), 0) AS disponible,
       COALESCE(SUM(CASE WHEN m.efectivo_desde > ? THEN m.coronas ELSE 0 END), 0) AS por_activar,
       COALESCE(SUM(CASE WHEN m.gasto_fecha >= ? THEN m.gasto ELSE 0 END), 0) AS gasto12m,
       MAX(m.creado_en) AS ultimo_movimiento
     FROM usuarios u LEFT JOIN movimientos m ON m.usuario_id = u.id
     WHERE u.id > ? AND u.estado = 'activo' AND u.es_personal = 0 AND u.codigo_socio IS NOT NULL
     GROUP BY u.id ORDER BY u.id LIMIT ?`,
    [ctx.ahora, ctx.ahora, ctx.ahora - 365 * DIA, desdeId, limite],
  );
  return filas.map((f) => {
    const rango = calcularRango(Math.max(0, f.gasto12m), ctx.cfg);
    return {
      id: f.id,
      codigo: f.codigo_socio,
      nombre: f.nombre,
      rango: rango.nombre,
      pct: rango.pct,
      coronas_disponibles: Math.max(0, f.disponible),
      coronas_por_activar: f.por_activar,
      consumo_12m: Math.max(0, f.gasto12m),
      ultimo_movimiento: f.ultimo_movimiento,
      miembro_desde: f.creado_en,
    };
  });
}

/** GET /api/caja/socios?desde=0&limite=500 → listado actualizado (solo para la integración de la caja). */
export async function listarSociosCaja(ctx) {
  await exigirLocal(ctx);
  await exigirLimite(ctx.db, `socios:lista:${ctx.ip}`, 60, 10 * MIN, ctx.ahora);
  const desde = aInt(ctx.url.searchParams.get('desde')) ?? 0;
  const limite = Math.min(500, Math.max(1, aInt(ctx.url.searchParams.get('limite')) ?? 500));
  const socios = await consultarSocios(ctx, { desdeId: desde, limite });
  return json({
    actualizado_en: ctx.ahora,
    socios: socios.map(({ nombre, id, ...resto }) => ({ ...resto, nombre: nombrePublico(nombre) })),
    siguiente: socios.length === limite ? socios.at(-1).id : null,
  });
}
