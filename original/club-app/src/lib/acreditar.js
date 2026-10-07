// Acreditar una boleta a los socios que dieron su código personal en caja (sin que nadie tenga que ingresar el código de la boleta).
// El primer código es de quien paga (dueño de la mesa); los demás son sus amigos. Cada uno gana según SU rango sobre SU parte.
// Las partes que queden sin código siguen disponibles en el enlace de la mesa (la app de quien pagó).
import { error } from './http.js';
import { HORA, diaChile, tokenAleatorio, nombrePila, normalizarCodigo } from './util.js';
import { coronasPorParte, calcularRango } from './config.js';
import { infoRangoAlDia } from './club.js';

// Máximo de socios por boleta: con 8 la solicitud usa unas 35 consultas, bajo el límite de 50 de D1 en el plan gratis.
export const MAX_SOCIOS_POR_BOLETA = 8;

export function normalizarCodigoSocio(c) {
  return normalizarCodigo(typeof c === 'string' || typeof c === 'number' ? String(c) : '');
}

/** Busca a los socios por código personal (una sola consulta). Devuelve { usuarios, invalidos } respetando el orden recibido. */
export async function buscarSocios(db, codigos) {
  const invalidos = [];
  const validos = [];
  const vistos = new Set();
  for (const cruda of codigos) {
    const codigo = normalizarCodigoSocio(cruda);
    if (!/^[A-HJKMNP-Z2-9]{6}$/.test(codigo)) invalidos.push({ codigo: String(cruda).slice(0, 12), motivo: 'formato' });
    else if (vistos.has(codigo)) invalidos.push({ codigo, motivo: 'repetido' });
    else {
      vistos.add(codigo);
      validos.push(codigo);
    }
  }
  const filas = validos.length
    ? await db.all(`SELECT * FROM usuarios WHERE codigo_socio IN (${validos.map(() => '?').join(',')})`, validos)
    : [];
  const porCodigo = new Map(filas.map((u) => [u.codigo_socio, u]));
  const usuarios = [];
  for (const codigo of validos) {
    const u = porCodigo.get(codigo);
    if (!u) invalidos.push({ codigo, motivo: 'no_existe' });
    else if (u.estado !== 'activo') invalidos.push({ codigo, motivo: 'bloqueado' });
    else if (u.es_personal) invalidos.push({ codigo, motivo: 'personal' });
    else usuarios.push(u);
  }
  return { usuarios, invalidos };
}

const MOTIVOS = {
  formato: 'no tiene el formato de un código de socio',
  repetido: 'está repetido',
  no_existe: 'no existe',
  bloqueado: 'pertenece a una cuenta bloqueada',
  personal: 'es de una cuenta del equipo (no acumula coronas)',
};

/**
 * Crea la mesa de la boleta y acredita las coronas a cada socio (todo o nada).
 * `personas` = comensales de la mesa (si la caja no lo informa, solo cuentan los socios).
 */
export async function acreditarSocios(ctx, boleta, local, usuarios, personasMesa = null) {
  if (usuarios.length === 0) throw error(400, 'sin_socios', 'No hay códigos de socio para acreditar.');
  if (usuarios.length > MAX_SOCIOS_POR_BOLETA) throw error(400, 'demasiados_socios', `Se pueden acreditar hasta ${MAX_SOCIOS_POR_BOLETA} socios por boleta.`);
  const personas = Math.max(personasMesa || 0, boleta.comensales || 0, usuarios.length);
  if (personas > ctx.cfg.max_personas) throw error(400, 'comensales_invalidos', `Los comensales deben estar entre 1 y ${ctx.cfg.max_personas}.`);
  const parte = Math.floor(boleta.monto / personas);
  const token = tokenAleatorio(9);
  const expira = ctx.ahora + ctx.cfg.ventana_mesa_horas * HORA;

  // coronas de cada uno, según su rango de hoy
  const detalle = [];
  for (const u of usuarios) {
    const antes = await infoRangoAlDia(ctx.db, u.id, ctx.cfg, ctx.ahora);
    detalle.push({ u, antes, coronas: coronasPorParte(parte, antes.rango.pct, ctx.cfg.tope_coronas_por_persona) });
  }

  const st = [
    [
      `INSERT INTO mesas (boleta_id, token, pagador_id, personas, monto, parte, dia, creada_en, expira_en)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM boletas WHERE id = ? AND estado = 'emitida')`,
      [boleta.id, token, usuarios[0].id, personas, boleta.monto, parte, diaChile(ctx.ahora), ctx.ahora, expira, boleta.id],
    ],
  ];
  detalle.forEach((d, i) => {
    st.push([
      `INSERT INTO partes (mesa_id, idx, usuario_id, estado, coronas, gasto, reclamada_en)
       VALUES ((SELECT id FROM mesas WHERE boleta_id = ?), ?, ?, 'reclamada', ?, ?, ?)`,
      [boleta.id, i, d.u.id, d.coronas, parte, ctx.ahora],
    ]);
  });
  for (let i = detalle.length; i < personas; i++) {
    st.push([`INSERT INTO partes (mesa_id, idx, estado) VALUES ((SELECT id FROM mesas WHERE boleta_id = ?), ?, 'libre')`, [boleta.id, i]]);
  }
  detalle.forEach((d, i) => {
    st.push([
      `INSERT INTO movimientos (usuario_id, tipo, coronas, gasto, gasto_fecha, efectivo_desde, creado_en, ref, mesa_id, local_id, nota)
       SELECT ?, 'compra', ?, ?, ?, ?, ?, 'compra:' || p.id, p.mesa_id, ?, ?
       FROM partes p JOIN mesas m ON m.id = p.mesa_id WHERE m.boleta_id = ? AND p.idx = ?`,
      [d.u.id, d.coronas, parte, ctx.ahora, ctx.ahora + ctx.cfg.horas_activacion * HORA, ctx.ahora, local.id, `Consumo en ${local.nombre}`, boleta.id, i],
    ]);
  });
  st.push(["UPDATE boletas SET estado = 'reclamada' WHERE id = ? AND estado = 'emitida'", [boleta.id]]);

  try {
    await ctx.db.batch(st);
  } catch {
    const actual = await ctx.db.get('SELECT estado FROM boletas WHERE id = ?', [boleta.id]);
    if (actual?.estado === 'anulada') throw error(410, 'boleta_anulada', 'Esa boleta fue anulada.');
    throw error(409, 'boleta_ya_acreditada', 'Esa boleta ya fue acreditada o reclamada por otra persona.');
  }

  const socios = [];
  for (const d of detalle) {
    const despues = { rango: calcularRango(d.antes.saldo.gasto12m + parte, ctx.cfg) }; // sin consultar de nuevo la base
    socios.push({
      codigo: d.u.codigo_socio,
      nombre: nombrePila(d.u.nombre),
      pct: d.antes.rango.pct,
      coronas: d.coronas,
      tope_aplicado: Math.floor((parte * d.antes.rango.pct) / 100) > ctx.cfg.tope_coronas_por_persona,
      rango_antes: d.antes.rango.nombre,
      rango: despues.rango.nombre,
      ascendio: despues.rango.indice > d.antes.rango.indice,
      disponible_desde: ctx.ahora + ctx.cfg.horas_activacion * HORA,
    });
  }
  return { ok: true, mesa: { token, personas, parte, libres: personas - detalle.length, expira_en: expira }, socios };
}

export const textoInvalidos = (invalidos) => invalidos.map((i) => `${i.codigo} ${MOTIVOS[i.motivo] || 'no sirve'}`).join('; ');
