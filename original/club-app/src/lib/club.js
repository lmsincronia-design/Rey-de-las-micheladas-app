// Lógica de saldo, vencimientos, fichas y regalo. Funciones que leen/escriben la base.
import { DIA, HORA, MIN, diaChile, proximoCumple } from './util.js';
import { calcularRango } from './config.js';

const DIAS_VENTANA_RANGO = 365;

/** Saldo = suma del libro de movimientos. Las coronas ganadas quedan "por activar" hasta su efectivo_desde. */
export async function saldoUsuario(db, usuarioId, ahora) {
  const r = await db.get(
    `SELECT
       COALESCE(SUM(CASE WHEN efectivo_desde <= ? THEN coronas ELSE 0 END), 0) AS disponible,
       COALESCE(SUM(CASE WHEN efectivo_desde > ? THEN coronas ELSE 0 END), 0) AS por_activar,
       COALESCE(SUM(CASE WHEN gasto_fecha >= ? THEN gasto ELSE 0 END), 0) AS gasto12m,
       MIN(CASE WHEN efectivo_desde > ? THEN efectivo_desde END) AS proxima_activacion,
       MAX(CASE WHEN tipo IN ('compra', 'reserva', 'uso_dif') THEN creado_en END) AS ultima_actividad
     FROM movimientos WHERE usuario_id = ?`,
    [ahora, ahora, ahora - DIAS_VENTANA_RANGO * DIA, ahora, usuarioId],
  );
  return {
    disponible: Math.max(0, r.disponible),
    disponible_bruto: r.disponible,
    por_activar: r.por_activar,
    gasto12m: Math.max(0, r.gasto12m),
    proxima_activacion: r.proxima_activacion ?? null,
    ultima_actividad: r.ultima_actividad ?? null,
  };
}

/** Si pasó mucho tiempo sin actividad, las coronas disponibles vencen. Idempotente (ref única). */
export async function aplicarVencimiento(db, usuarioId, cfg, ahora, saldoPrevio = null) {
  const s = saldoPrevio || (await saldoUsuario(db, usuarioId, ahora));
  if (!s.ultima_actividad || s.disponible <= 0) return false;
  const limite = s.ultima_actividad + cfg.meses_inactividad_vence * 30.4375 * DIA;
  if (ahora < limite) return false;
  await db.run(
    `INSERT OR IGNORE INTO movimientos (usuario_id, tipo, coronas, gasto, gasto_fecha, efectivo_desde, creado_en, ref, nota)
     VALUES (?, 'vencimiento', ?, 0, ?, ?, ?, ?, ?)`,
    [usuarioId, -s.disponible, ahora, ahora, ahora, `venc:${s.ultima_actividad}`, 'Coronas vencidas por inactividad'],
  );
  return true;
}

/** Igual que aplicarVencimiento + infoRango, pero con una sola consulta de saldo (en el caso normal). */
export async function infoRangoAlDia(db, usuarioId, cfg, ahora) {
  let s = await saldoUsuario(db, usuarioId, ahora);
  if (await aplicarVencimiento(db, usuarioId, cfg, ahora, s)) s = await saldoUsuario(db, usuarioId, ahora);
  return { saldo: s, rango: calcularRango(s.gasto12m, cfg) };
}

export async function infoRango(db, usuarioId, cfg, ahora) {
  const s = await saldoUsuario(db, usuarioId, ahora);
  return { saldo: s, rango: calcularRango(s.gasto12m, cfg) };
}

/** Libera las reservas de fichas vencidas (devuelve las coronas). Seguro de llamar muchas veces. */
export async function liberarFichasVencidas(db, ahora, usuarioId = null) {
  const filtro = usuarioId ? 'AND usuario_id = ?' : '';
  const vencidas = await db.all(
    `SELECT id, usuario_id FROM fichas WHERE estado = 'reservada' AND vence_en <= ? ${filtro}`,
    usuarioId ? [ahora, usuarioId] : [ahora],
  );
  for (const f of vencidas) {
    await db.batch([
      ["UPDATE fichas SET estado = 'vencida' WHERE id = ? AND estado = 'reservada'", [f.id]],
      [
        `INSERT OR IGNORE INTO movimientos (usuario_id, tipo, coronas, gasto, gasto_fecha, efectivo_desde, creado_en, ref, ficha_id, nota)
         SELECT f.usuario_id, 'liberacion', f.monto, 0, ?, ?, ?, 'lib:' || f.id, f.id, 'Ficha vencida: coronas devueltas'
         FROM fichas f WHERE f.id = ? AND f.estado = 'vencida' AND f.monto > 0`,
        [ahora, ahora, ahora, f.id],
      ],
    ]);
  }
  return vencidas.length;
}

/** Regalo de cumpleaños: ¿puede esta persona pedirlo hoy? */
export async function estadoRegalo(db, usuario, cfg, ahora) {
  const g = cfg.regalo;
  if (!g.activo) return { disponible: false, motivo: 'desactivado' };
  const cumple = proximoCumple(usuario.nacimiento, ahora);
  const desde = cumple.ms - g.dias_antes * DIA - 12 * HORA;
  const hasta = cumple.ms + g.dias_despues * DIA + 12 * HORA;
  const hoy = Date.parse(diaChile(ahora) + 'T12:00:00Z');
  const base = { anio: cumple.anio, cumple_mmdd: usuario.nacimiento.slice(5), descripcion: g.descripcion };
  if (hoy < desde || hoy > hasta) return { disponible: false, motivo: 'fuera_de_fecha', ...base };
  if (ahora - usuario.creado_en < g.dias_registro_minimos * DIA) return { disponible: false, motivo: 'registro_reciente', ...base };
  const b = await db.get(
    `SELECT COUNT(DISTINCT m.dia) AS dias FROM mesas m JOIN partes p ON p.mesa_id = m.id
     WHERE p.usuario_id = ? AND p.estado = 'reclamada'`,
    [usuario.id],
  );
  if ((b?.dias ?? 0) < g.boletas_minimas) return { disponible: false, motivo: 'pocas_visitas', visitas: b?.dias ?? 0, requeridas: g.boletas_minimas, ...base };
  const usado = await db.get("SELECT id FROM fichas WHERE usuario_id = ? AND tipo = 'regalo' AND anio = ? AND estado = 'usada'", [usuario.id, cumple.anio]);
  if (usado) return { disponible: false, motivo: 'ya_usado', ...base };
  return { disponible: true, ...base };
}

export const vigenciaFichaMs = (cfg) => cfg.canje_vigencia_min * MIN;
