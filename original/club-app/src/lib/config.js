// Reglas del Club. Todo lo que se puede ajustar sin tocar código vive aquí
// y se puede editar desde el panel de administración (se guarda en la tabla config).

export const CONFIG_BASE = {
  // Rangos por gasto acumulado en 12 meses (suma de "partes" reclamadas).
  // pct = porcentaje del gasto que vuelve en coronas.
  rangos: [
    { id: 'plebeyo', nombre: 'Plebeyo', desde: 0, pct: 8, beneficio: 'Entras al Club y vuelve el 8% de lo que consumes en coronas.' },
    { id: 'comerciante', nombre: 'Comerciante', desde: 50000, pct: 10, beneficio: 'Vuelve el 10% de tu consumo en coronas.' },
    { id: 'guardia', nombre: 'Guardia', desde: 150000, pct: 12, beneficio: 'Vuelve el 12% y recibes avisos de promos antes que nadie.' },
    { id: 'noble', nombre: 'Noble', desde: 350000, pct: 14, beneficio: 'Vuelve el 14% y tienes prioridad en reservas de eventos.' },
    { id: 'rey', nombre: 'Rey', desde: 700000, pct: 16, beneficio: 'Vuelve el 16%, entras al Salón del Rey y recibes una sorpresa al año.' },
  ],
  tope_coronas_por_persona: 8000, // máximo de coronas por persona por boleta
  gasto_minimo_por_persona: 6000, // define el máximo de personas que caben en una boleta
  gasto_maximo_por_persona: 60000, // define el mínimo de personas (nadie puede declarar "somos 1" en una cuenta enorme)
  max_personas: 20,
  horas_activacion: 24, // las coronas ganadas se activan después de este tiempo (no se pueden gastar en la misma visita)
  ventana_reclamo_horas: 24, // plazo para ingresar el código de la boleta
  ventana_mesa_horas: 48, // plazo para que los amigos reclamen su parte
  reclamos_boleta_por_dia: 3, // boletas distintas que una persona puede reclamar como pagador en 24 h
  reclamos_boleta_por_semana: 8,
  partes_por_dia: 3, // partes de mesas ajenas que una persona puede reclamar en 24 h
  canje_vigencia_min: 10, // minutos de vida de la ficha de canje
  canje_gracia_seg: 120, // tolerancia de la caja al validar una ficha recién vencida
  canje_minimo: 1000,
  canje_maximo: 20000,
  canje_multiplo: 500,
  canjes_por_dia: 1,
  meses_inactividad_vence: 12, // sin movimientos en este tiempo, las coronas disponibles vencen
  edad_minima: 18,
  amigos_max_asignados: 19,
  regalo: {
    activo: true,
    descripcion: 'Una michelada gratis',
    dias_antes: 3,
    dias_despues: 7,
    dias_registro_minimos: 30,
    boletas_minimas: 2,
  },
  terminos_version: '2026-10',
  alerta_reclamos_24h: 3,
};

// Reglas del modo MVP (demostración): todo se puede probar en el momento, sin esperas ni topes diarios.
// En producción (MODO_MVP apagado) rigen los valores de CONFIG_BASE. Se pueden editar igual desde /admin.
export const CONFIG_MVP = {
  horas_activacion: 0,
  reclamos_boleta_por_dia: 50,
  reclamos_boleta_por_semana: 200,
  partes_por_dia: 50,
  canjes_por_dia: 20,
  alerta_reclamos_24h: 100,
  regalo: { ...CONFIG_BASE.regalo, dias_registro_minimos: 0, boletas_minimas: 1 },
};

function fusionar(base, extra) {
  const out = { ...base };
  for (const [k, v] of Object.entries(extra || {})) {
    if (!(k in base)) continue;
    if (k === 'regalo' && v && typeof v === 'object') out.regalo = { ...base.regalo, ...v };
    else out[k] = v;
  }
  return out;
}

export async function cargarConfig(db, mvp = false) {
  const fila = await db.get("SELECT valor FROM config WHERE clave = 'club'");
  let guardado = {};
  if (fila) {
    try {
      guardado = JSON.parse(fila.valor);
    } catch {
      guardado = {};
    }
  }
  return fusionar(mvp ? fusionar(CONFIG_BASE, CONFIG_MVP) : CONFIG_BASE, guardado);
}

const ENTEROS = {
  tope_coronas_por_persona: [100, 1000000],
  gasto_minimo_por_persona: [100, 1000000],
  gasto_maximo_por_persona: [1000, 10000000],
  max_personas: [1, 50],
  horas_activacion: [0, 720],
  ventana_reclamo_horas: [1, 720],
  ventana_mesa_horas: [1, 720],
  reclamos_boleta_por_dia: [1, 50],
  reclamos_boleta_por_semana: [1, 200],
  partes_por_dia: [1, 50],
  canje_vigencia_min: [1, 240],
  canje_gracia_seg: [0, 3600],
  canje_minimo: [100, 1000000],
  canje_maximo: [100, 10000000],
  canje_multiplo: [1, 100000],
  canjes_por_dia: [1, 20],
  meses_inactividad_vence: [1, 120],
  edad_minima: [0, 99],
  amigos_max_asignados: [0, 49],
  alerta_reclamos_24h: [1, 100],
};

/** Devuelve { ok, errores, config } con la configuración propuesta ya fusionada y validada. */
export function validarConfig(propuesta) {
  const errores = [];
  if (!propuesta || typeof propuesta !== 'object') return { ok: false, errores: ['Configuración inválida'] };
  const cfg = fusionar(CONFIG_BASE, propuesta);
  for (const [k, [min, max]] of Object.entries(ENTEROS)) {
    const v = cfg[k];
    if (!Number.isInteger(v) || v < min || v > max) errores.push(`${k} debe ser un entero entre ${min} y ${max}`);
  }
  if (!Array.isArray(cfg.rangos) || cfg.rangos.length !== CONFIG_BASE.rangos.length) {
    errores.push(`Debe haber exactamente ${CONFIG_BASE.rangos.length} rangos`);
  } else {
    cfg.rangos.forEach((r, i) => {
      const ref = CONFIG_BASE.rangos[i];
      if (!r || r.id !== ref.id) errores.push(`El rango ${i + 1} debe ser ${ref.id}`);
      if (!Number.isInteger(r.desde) || r.desde < 0) errores.push(`${ref.id}: "desde" inválido`);
      if (i === 0 && r.desde !== 0) errores.push('El primer rango debe partir en 0');
      if (i > 0 && r.desde <= cfg.rangos[i - 1].desde) errores.push(`${ref.id}: el umbral debe ser mayor que el del rango anterior`);
      if (!Number.isInteger(r.pct) || r.pct < 0 || r.pct > 50) errores.push(`${ref.id}: pct debe ser un entero entre 0 y 50`);
      if (typeof r.nombre !== 'string' || !r.nombre.trim()) errores.push(`${ref.id}: nombre inválido`);
    });
  }
  if (cfg.gasto_minimo_por_persona > cfg.gasto_maximo_por_persona) errores.push('gasto_minimo_por_persona no puede superar al máximo');
  if (cfg.canje_minimo > cfg.canje_maximo) errores.push('canje_minimo no puede superar a canje_maximo');
  const g = cfg.regalo;
  if (typeof g?.activo !== 'boolean') errores.push('regalo.activo debe ser verdadero o falso');
  for (const k of ['dias_antes', 'dias_despues', 'dias_registro_minimos', 'boletas_minimas']) {
    if (!Number.isInteger(g?.[k]) || g[k] < 0 || g[k] > 365) errores.push(`regalo.${k} inválido`);
  }
  if (typeof g?.descripcion !== 'string' || !g.descripcion.trim()) errores.push('regalo.descripcion inválida');
  return { ok: errores.length === 0, errores, config: cfg };
}

export async function guardarConfig(db, cfg, ahora) {
  const ahoraStr = JSON.stringify(cfg);
  await db.run(
    "INSERT INTO config (clave, valor) VALUES ('club', ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor",
    [ahoraStr],
  );
  return ahora;
}

/** Rango y progreso para un gasto acumulado. */
export function calcularRango(gasto, cfg) {
  const r = cfg.rangos;
  let i = 0;
  for (let k = 0; k < r.length; k++) if (gasto >= r[k].desde) i = k;
  const sig = r[i + 1] || null;
  return {
    indice: i,
    id: r[i].id,
    nombre: r[i].nombre,
    pct: r[i].pct,
    gasto,
    siguiente: sig ? { id: sig.id, nombre: sig.nombre, desde: sig.desde, falta: sig.desde - gasto } : null,
    progreso: sig ? Math.max(0, Math.min(1, (gasto - r[i].desde) / (sig.desde - r[i].desde))) : 1,
  };
}

/** Coronas que corresponden a una parte, con aritmética entera (sin errores de punto flotante). */
export function coronasPorParte(parte, pct, tope) {
  return Math.max(0, Math.min(tope, Math.floor((parte * pct) / 100)));
}
