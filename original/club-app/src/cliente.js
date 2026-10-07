// Todo lo que hace el socio: ver su perfil, reclamar una boleta, mesas compartidas, canjes y regalo.
import {
  error, json, leerJSON, exigirLimite, exigirNoBloqueado, limitar, crearAlerta, auditar,
} from './lib/http.js';
import {
  HORA, DIA, hmac, tokenAleatorio, codigoAleatorio, normalizarTelefono, normalizarCodigo, limpiarNombre,
  enmascararTelefono, nombrePila, nombrePublico, aInt, diaChile, codigoSocioAleatorio,
} from './lib/util.js';
import { calcularRango, coronasPorParte } from './lib/config.js';
import { exigirUsuario, leerSesion } from './auth.js';
import { verificarPinLocal, aplicarFichaInterna } from './caja.js';
import {
  saldoUsuario, aplicarVencimiento, infoRango, liberarFichasVencidas, estadoRegalo, vigenciaFichaMs,
} from './lib/club.js';

const SQL_MESA_VIGENTE = `EXISTS (SELECT 1 FROM mesas mm JOIN boletas bb ON bb.id = mm.boleta_id
  WHERE mm.id = ? AND bb.estado = 'reclamada' AND mm.expira_en >= ?)`;

async function telHashDe(ctx, telefono) {
  return hmac(ctx.secreto, `tel:${telefono}`);
}

const fmt = (n) => '$' + Math.round(n).toLocaleString('es-CL');

/* ───────────────────────── Perfil ───────────────────────── */

async function partesAsignadas(ctx, u, rango) {
  const filas = await ctx.db.all(
    `SELECT p.id, m.token, m.parte, m.expira_en, m.personas, pg.nombre AS pagador, l.nombre AS local
     FROM partes p
     JOIN mesas m ON m.id = p.mesa_id
     JOIN boletas b ON b.id = m.boleta_id
     JOIN locales l ON l.id = b.local_id
     JOIN usuarios pg ON pg.id = m.pagador_id
     WHERE p.tel_hash = ? AND p.estado = 'asignada' AND m.expira_en >= ? AND b.estado = 'reclamada'
     ORDER BY m.expira_en`,
    [u.tel_hash, ctx.ahora],
  );
  return filas.map((f) => ({
    token: f.token,
    pagador: nombrePila(f.pagador),
    local: f.local,
    expira_en: f.expira_en,
    personas: f.personas,
    parte: f.parte,
    coronas_estimadas: coronasPorParte(f.parte, rango.pct, ctx.cfg.tope_coronas_por_persona),
  }));
}

async function mesasDelPagador(ctx, u) {
  const filas = await ctx.db.all(
    `SELECT m.id, m.token, m.personas, m.parte, m.expira_en, m.creada_en, l.nombre AS local, b.estado AS boleta_estado,
       (SELECT COUNT(*) FROM partes p WHERE p.mesa_id = m.id AND p.estado = 'reclamada') AS reclamadas,
       (SELECT COUNT(*) FROM partes p WHERE p.mesa_id = m.id AND p.estado = 'libre') AS libres,
       (SELECT COUNT(*) FROM partes p WHERE p.mesa_id = m.id AND p.estado = 'asignada') AS asignadas
     FROM mesas m JOIN boletas b ON b.id = m.boleta_id JOIN locales l ON l.id = b.local_id
     WHERE m.pagador_id = ? AND m.creada_en >= ? ORDER BY m.creada_en DESC LIMIT 20`,
    [u.id, ctx.ahora - 7 * DIA],
  );
  return filas.map((f) => ({
    token: f.token,
    local: f.local,
    personas: f.personas,
    parte: f.parte,
    creada_en: f.creada_en,
    expira_en: f.expira_en,
    vigente: f.boleta_estado === 'reclamada' && f.expira_en >= ctx.ahora,
    anulada: f.boleta_estado === 'anulada',
    reclamadas: f.reclamadas,
    libres: f.libres,
    asignadas: f.asignadas,
  }));
}

export function fichaPublica(f, ahora) {
  if (!f) return null;
  return {
    codigo: f.codigo,
    tipo: f.tipo,
    monto: f.monto,
    descripcion: f.descripcion,
    estado: f.estado,
    creada_en: f.creada_en,
    vence_en: f.vence_en,
    restante_seg: Math.max(0, Math.ceil((f.vence_en - ahora) / 1000)),
    monto_aplicado: f.monto_aplicado,
    usada_en: f.usada_en,
  };
}

/** Devuelve el código personal del socio; si es una cuenta anterior a esta función, se le asigna uno. */
export async function asegurarCodigoSocio(ctx, u) {
  if (u.codigo_socio) return u.codigo_socio;
  for (let intento = 0; intento < 8; intento++) {
    const codigo = codigoSocioAleatorio();
    try {
      await ctx.db.run('UPDATE usuarios SET codigo_socio = ? WHERE id = ? AND codigo_socio IS NULL', [codigo, u.id]);
      const fila = await ctx.db.get('SELECT codigo_socio FROM usuarios WHERE id = ?', [u.id]);
      return fila.codigo_socio;
    } catch (e) {
      if (!/codigo_socio/i.test(String(e?.message))) throw e;
    }
  }
  throw error(500, 'sin_codigo', 'No pudimos generar tu código. Intenta de nuevo.');
}

export async function construirPerfil(ctx, u) {
  const codigoSocio = await asegurarCodigoSocio(ctx, u);
  await aplicarVencimiento(ctx.db, u.id, ctx.cfg, ctx.ahora);
  await liberarFichasVencidas(ctx.db, ctx.ahora, u.id);
  const { saldo, rango } = await infoRango(ctx.db, u.id, ctx.cfg, ctx.ahora);
  const ficha = await ctx.db.get("SELECT * FROM fichas WHERE usuario_id = ? AND estado = 'reservada'", [u.id]);
  const hoy = diaChile(ctx.ahora);
  const canjesHoy = await ctx.db.get(
    "SELECT COUNT(*) AS n FROM fichas WHERE usuario_id = ? AND tipo = 'canje' AND dia = ? AND estado IN ('reservada', 'usada')",
    [u.id, hoy],
  );
  return {
    usuario: {
      id: u.id,
      codigo_socio: codigoSocio,
      nombre: u.nombre,
      nombre_pila: nombrePila(u.nombre),
      telefono: enmascararTelefono(u.telefono),
      nacimiento: u.nacimiento,
      publico_salon: !!u.publico_salon,
      miembro_desde: u.creado_en,
    },
    saldo: {
      disponible: saldo.disponible,
      por_activar: saldo.por_activar,
      proxima_activacion: saldo.proxima_activacion,
      gasto12m: saldo.gasto12m,
    },
    rango,
    rangos: ctx.cfg.rangos.map((r) => ({ id: r.id, nombre: r.nombre, desde: r.desde, pct: r.pct, beneficio: r.beneficio })),
    reglas: {
      mvp: ctx.mvp,
      tope_coronas_por_persona: ctx.cfg.tope_coronas_por_persona,
      horas_activacion: ctx.cfg.horas_activacion,
      ventana_reclamo_horas: ctx.cfg.ventana_reclamo_horas,
      ventana_mesa_horas: ctx.cfg.ventana_mesa_horas,
      canje_minimo: ctx.cfg.canje_minimo,
      canje_maximo: ctx.cfg.canje_maximo,
      canje_multiplo: ctx.cfg.canje_multiplo,
      canje_vigencia_min: ctx.cfg.canje_vigencia_min,
      canjes_por_dia: ctx.cfg.canjes_por_dia,
      canjes_hoy: canjesHoy.n,
      meses_inactividad_vence: ctx.cfg.meses_inactividad_vence,
      gasto_minimo_por_persona: ctx.cfg.gasto_minimo_por_persona,
      gasto_maximo_por_persona: ctx.cfg.gasto_maximo_por_persona,
      max_personas: ctx.cfg.max_personas,
    },
    pendientes: await partesAsignadas(ctx, u, rango),
    mesas: await mesasDelPagador(ctx, u),
    ficha_activa: fichaPublica(ficha, ctx.ahora),
    regalo: await estadoRegalo(ctx.db, u, ctx.cfg, ctx.ahora),
    es_personal: !!u.es_personal,
    ahora: ctx.ahora,
  };
}

export async function miPerfil(ctx) {
  const u = await exigirUsuario(ctx);
  return json(await construirPerfil(ctx, u));
}

const TEXTO_MOV = {
  compra: 'Coronas ganadas',
  reserva: 'Ficha de canje',
  liberacion: 'Coronas devueltas',
  uso_dif: 'Coronas devueltas (descuento menor)',
  reversa: 'Boleta anulada',
  vencimiento: 'Coronas vencidas',
  ajuste: 'Ajuste del equipo',
};

export async function misMovimientos(ctx) {
  const u = await exigirUsuario(ctx);
  const limite = Math.min(100, Math.max(1, aInt(ctx.url.searchParams.get('limite')) ?? 50));
  const filas = await ctx.db.all(
    `SELECT mv.id, mv.tipo, mv.coronas, mv.gasto, mv.efectivo_desde, mv.creado_en, mv.nota, l.nombre AS local
     FROM movimientos mv LEFT JOIN locales l ON l.id = mv.local_id
     WHERE mv.usuario_id = ? ORDER BY mv.id DESC LIMIT ?`,
    [u.id, limite],
  );
  return json({
    movimientos: filas.map((f) => ({
      id: f.id,
      tipo: f.tipo,
      titulo: TEXTO_MOV[f.tipo] || f.tipo,
      coronas: f.coronas,
      gasto: f.gasto,
      local: f.local,
      nota: f.nota,
      creado_en: f.creado_en,
      activa_desde: f.efectivo_desde > ctx.ahora ? f.efectivo_desde : null,
    })),
  });
}

/* ───────────────────────── Reclamar boleta ───────────────────────── */

/** Códigos de prueba visibles (solo en modo MVP): la app los muestra como atajos al registrar una boleta. */
export async function codigosDePrueba(ctx) {
  if (!ctx.mvp) return json({ codigos: [] });
  const filas = await ctx.db.all('SELECT codigo, monto, personas, nota FROM codigos_prueba WHERE activo = 1 ORDER BY monto, codigo');
  return json({ codigos: filas });
}

// Un código de prueba crea una boleta nueva cada vez que se usa (en el primer local activo, de preferencia REY-X).
async function boletaDesdeCodigoPrueba(ctx, fila) {
  const local = await ctx.db.get("SELECT id, nombre FROM locales WHERE activo = 1 ORDER BY (codigo = 'REY-X') DESC, id LIMIT 1");
  if (!local) throw error(409, 'sin_locales', 'No hay locales cargados. Entra a /admin → Locales → "Cargar locales de ejemplo".');
  for (let i = 0; i < 8; i++) {
    try {
      const r = await ctx.db.run(
        `INSERT INTO boletas (local_id, folio, monto, comensales, emitida_en, codigo, estado, creado_en)
         VALUES (?, ?, ?, ?, ?, ?, 'emitida', ?)`,
        [local.id, `PRUEBA-${fila.codigo}-${tokenAleatorio(6)}`, fila.monto, fila.personas, ctx.ahora, codigoAleatorio(6), ctx.ahora],
      );
      const b = await ctx.db.get('SELECT * FROM boletas WHERE id = ?', [r.lastRowId]);
      return { ...b, local_nombre: local.nombre };
    } catch (e) {
      if (!/boletas.codigo/i.test(String(e?.message))) throw e;
    }
  }
  throw error(500, 'sin_codigo', 'No se pudo generar la boleta de prueba.');
}

export async function reclamarBoleta(ctx) {
  const u = await exigirUsuario(ctx);
  const body = await leerJSON(ctx.req);
  // Solo cuentan los códigos que no existen (adivinar), no los errores de formato ni los reclamos legítimos.
  await exigirNoBloqueado(ctx.db, `reclamo:u:${u.id}`, 10, HORA, ctx.ahora, 'Demasiados intentos con códigos. Espera un rato y vuelve a probar.');
  await exigirNoBloqueado(ctx.db, `reclamo:ip:${ctx.ip}`, 40, HORA, ctx.ahora);
  if (u.es_personal) {
    await crearAlerta(ctx.db, 'personal_intento', u.id, { accion: 'reclamar_boleta' }, ctx.ahora);
    throw error(403, 'cuenta_personal', 'Las cuentas del equipo no acumulan coronas.');
  }

  const codigo = normalizarCodigo(body.codigo);
  const prueba = ctx.mvp && codigo ? await ctx.db.get('SELECT * FROM codigos_prueba WHERE codigo = ? AND activo = 1', [codigo]) : null;
  if (!prueba && !/^[A-HJKMNP-Z2-9]{6}$/.test(codigo)) {
    throw error(400, 'codigo_invalido', 'El código son 6 letras y números. No lleva O, I, L, 0 ni 1.');
  }
  const b = prueba
    ? await boletaDesdeCodigoPrueba(ctx, prueba)
    : await ctx.db.get(
      `SELECT b.*, l.nombre AS local_nombre FROM boletas b JOIN locales l ON l.id = b.local_id WHERE b.codigo = ?`,
      [codigo],
    );
  if (!b) {
    await limitar(ctx.db, `reclamo:u:${u.id}`, 10, HORA, ctx.ahora);
    await limitar(ctx.db, `reclamo:ip:${ctx.ip}`, 40, HORA, ctx.ahora);
    throw error(404, 'codigo_no_encontrado', 'No encontramos esa boleta. Revisa el código, o espera unos minutos si acabas de pagar.');
  }
  if (b.estado === 'anulada') throw error(410, 'boleta_anulada', 'Esa boleta fue anulada.');
  if (b.estado === 'reclamada') {
    const mesa = await ctx.db.get('SELECT token, pagador_id FROM mesas WHERE boleta_id = ?', [b.id]);
    if (mesa && mesa.pagador_id === u.id) throw error(409, 'ya_reclamaste', 'Ya reclamaste esta boleta.', { mesa: mesa.token });
    throw error(409, 'boleta_ya_usada', 'Ese código ya fue usado por otra persona.');
  }
  if (ctx.ahora - b.emitida_en > ctx.cfg.ventana_reclamo_horas * HORA) {
    throw error(410, 'boleta_vencida', `Esa boleta venció: el código se ingresa dentro de ${ctx.cfg.ventana_reclamo_horas} horas.`);
  }

  // Cuántas personas: si la caja informa comensales, manda la caja. Si no, se acota por el monto.
  const personas = prueba ? prueba.personas : aInt(body.personas);
  if (personas === null || personas < 1 || personas > ctx.cfg.max_personas) {
    throw error(400, 'personas_invalidas', `Indica cuántas personas eran (1 a ${ctx.cfg.max_personas}).`);
  }
  const minP = Math.max(1, Math.ceil(b.monto / ctx.cfg.gasto_maximo_por_persona));
  const maxP = Math.min(ctx.cfg.max_personas, Math.max(1, Math.floor(b.monto / ctx.cfg.gasto_minimo_por_persona)));
  if (b.comensales) {
    if (personas !== b.comensales) {
      throw error(400, 'personas_no_coinciden', `La boleta indica ${b.comensales} ${b.comensales === 1 ? 'persona' : 'personas'}.`, { comensales: b.comensales });
    }
  } else if (personas < minP || personas > maxP) {
    throw error(400, 'personas_fuera_de_rango', `Para una cuenta de ${fmt(b.monto)} pueden ser entre ${minP} y ${maxP} personas.`, { min: minP, max: maxP });
  }

  // Amigos asignados por teléfono (opcional)
  const entrada = Array.isArray(body.amigos) ? body.amigos : [];
  if (entrada.length > personas - 1 || entrada.length > ctx.cfg.amigos_max_asignados) {
    throw error(400, 'demasiados_amigos', `Con ${personas} ${personas === 1 ? 'persona' : 'personas'} puedes agregar hasta ${Math.max(0, personas - 1)} amigos.`);
  }
  const amigos = [];
  const vistos = new Set([u.telefono]);
  for (let i = 0; i < entrada.length; i++) {
    const a = entrada[i] || {};
    const tel = normalizarTelefono(a.telefono);
    if (!tel) throw error(400, 'amigo_telefono_invalido', `El teléfono del amigo ${i + 1} no es válido.`, { indice: i });
    if (vistos.has(tel)) throw error(400, 'amigo_repetido', `El teléfono del amigo ${i + 1} está repetido (o eres tú).`, { indice: i });
    vistos.add(tel);
    const etiqueta = a.etiqueta ? limpiarNombre(String(a.etiqueta), 30) : null;
    amigos.push({ tel, telHash: await telHashDe(ctx, tel), etiqueta: etiqueta || `Amigo ${i + 1}` });
  }

  // Límites contra abuso (los códigos de prueba no cuentan: se usan para mostrar el sistema)
  const hace24 = ctx.ahora - DIA;
  const dia = prueba ? { n: 0 } : await ctx.db.get('SELECT COUNT(*) AS n FROM mesas WHERE pagador_id = ? AND creada_en >= ?', [u.id, hace24]);
  if (dia.n >= ctx.cfg.reclamos_boleta_por_dia) {
    await crearAlerta(ctx.db, 'limite_diario', u.id, { codigo }, ctx.ahora);
    throw error(429, 'limite_diario', `Llegaste al máximo de ${ctx.cfg.reclamos_boleta_por_dia} boletas en 24 horas.`);
  }
  const semana = prueba ? { n: 0 } : await ctx.db.get('SELECT COUNT(*) AS n FROM mesas WHERE pagador_id = ? AND creada_en >= ?', [u.id, ctx.ahora - 7 * DIA]);
  if (semana.n >= ctx.cfg.reclamos_boleta_por_semana) {
    await crearAlerta(ctx.db, 'limite_semanal', u.id, { codigo }, ctx.ahora);
    throw error(429, 'limite_semanal', `Llegaste al máximo de ${ctx.cfg.reclamos_boleta_por_semana} boletas por semana.`);
  }

  await aplicarVencimiento(ctx.db, u.id, ctx.cfg, ctx.ahora);
  const antes = await infoRango(ctx.db, u.id, ctx.cfg, ctx.ahora);
  const parte = Math.floor(b.monto / personas);
  const coronas = coronasPorParte(parte, antes.rango.pct, ctx.cfg.tope_coronas_por_persona);
  const token = tokenAleatorio(9);
  const expira = ctx.ahora + ctx.cfg.ventana_mesa_horas * HORA;

  const st = [
    [
      `INSERT INTO mesas (boleta_id, token, pagador_id, personas, monto, parte, dia, creada_en, expira_en)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM boletas WHERE id = ? AND estado = 'emitida')`,
      [b.id, token, u.id, personas, b.monto, parte, diaChile(ctx.ahora), ctx.ahora, expira, b.id],
    ],
    [
      `INSERT INTO partes (mesa_id, idx, usuario_id, estado, coronas, gasto, reclamada_en)
       VALUES ((SELECT id FROM mesas WHERE boleta_id = ?), 0, ?, 'reclamada', ?, ?, ?)`,
      [b.id, u.id, coronas, parte, ctx.ahora],
    ],
  ];
  amigos.forEach((a, i) => {
    st.push([
      `INSERT INTO partes (mesa_id, idx, estado, tel_hash, etiqueta) VALUES ((SELECT id FROM mesas WHERE boleta_id = ?), ?, 'asignada', ?, ?)`,
      [b.id, i + 1, a.telHash, a.etiqueta],
    ]);
  });
  for (let i = amigos.length + 1; i < personas; i++) {
    st.push([`INSERT INTO partes (mesa_id, idx, estado) VALUES ((SELECT id FROM mesas WHERE boleta_id = ?), ?, 'libre')`, [b.id, i]]);
  }
  st.push([
    `INSERT INTO movimientos (usuario_id, tipo, coronas, gasto, gasto_fecha, efectivo_desde, creado_en, ref, mesa_id, local_id, nota)
     SELECT ?, 'compra', ?, ?, ?, ?, ?, 'compra:' || p.id, p.mesa_id, ?, ?
     FROM partes p JOIN mesas m ON m.id = p.mesa_id WHERE m.boleta_id = ? AND p.idx = 0`,
    [u.id, coronas, parte, ctx.ahora, ctx.ahora + ctx.cfg.horas_activacion * HORA, ctx.ahora, b.local_id, `Consumo en ${b.local_nombre}`, b.id],
  ]);
  st.push(["UPDATE boletas SET estado = 'reclamada' WHERE id = ? AND estado = 'emitida'", [b.id]]);

  try {
    await ctx.db.batch(st);
  } catch {
    const ahoraB = await ctx.db.get('SELECT estado FROM boletas WHERE id = ?', [b.id]);
    if (ahoraB?.estado === 'anulada') throw error(410, 'boleta_anulada', 'Esa boleta fue anulada.');
    const mesa = await ctx.db.get('SELECT pagador_id, token FROM mesas WHERE boleta_id = ?', [b.id]);
    if (mesa?.pagador_id === u.id) throw error(409, 'ya_reclamaste', 'Ya reclamaste esta boleta.', { mesa: mesa.token });
    throw error(409, 'boleta_ya_usada', 'Ese código ya fue usado por otra persona.');
  }

  const despues = await infoRango(ctx.db, u.id, ctx.cfg, ctx.ahora);
  return json(
    {
      ok: true,
      mesa: { token, personas, parte, expira_en: expira, libres: personas - 1 - amigos.length, asignadas: amigos.length },
      local: b.local_nombre,
      monto: b.monto,
      coronas_ganadas: coronas,
      pct: antes.rango.pct,
      tope_aplicado: Math.floor((parte * antes.rango.pct) / 100) > ctx.cfg.tope_coronas_por_persona,
      tope: ctx.cfg.tope_coronas_por_persona,
      disponibles_desde: ctx.ahora + ctx.cfg.horas_activacion * HORA,
      gasto_sumado: parte,
      rango_antes: antes.rango.nombre,
      rango: despues.rango,
      ascendio: despues.rango.indice > antes.rango.indice,
      saldo: { disponible: despues.saldo.disponible, por_activar: despues.saldo.por_activar },
    },
    201,
  );
}

/* ───────────────────────── Mesas compartidas ───────────────────────── */

async function cargarMesa(ctx, token) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{8,40}$/.test(token)) return null;
  return ctx.db.get(
    `SELECT m.*, b.estado AS boleta_estado, l.nombre AS local_nombre, l.codigo AS local_codigo, pg.nombre AS pagador_nombre
     FROM mesas m JOIN boletas b ON b.id = m.boleta_id JOIN locales l ON l.id = b.local_id JOIN usuarios pg ON pg.id = m.pagador_id
     WHERE m.token = ?`,
    [token],
  );
}

export async function verMesa(ctx) {
  const m = await cargarMesa(ctx, ctx.params.token);
  if (!m) throw error(404, 'mesa_no_encontrada', 'Ese enlace no existe o ya no está disponible.');
  const conteos = await ctx.db.all('SELECT estado, COUNT(*) AS n FROM partes WHERE mesa_id = ? GROUP BY estado', [m.id]);
  const n = Object.fromEntries(conteos.map((c) => [c.estado, c.n]));
  const sesion = await leerSesion(ctx, 'cliente');
  let yo = null;
  let usuario = null;
  if (sesion) {
    usuario = await ctx.db.get('SELECT * FROM usuarios WHERE id = ?', [sesion.usuario_id]);
    if (usuario && usuario.estado === 'activo') {
      const mia = await ctx.db.get('SELECT * FROM partes WHERE mesa_id = ? AND usuario_id = ?', [m.id, usuario.id]);
      const asignada = await ctx.db.get("SELECT id FROM partes WHERE mesa_id = ? AND estado = 'asignada' AND tel_hash = ?", [m.id, usuario.tel_hash]);
      yo = {
        autenticado: true,
        nombre_pila: nombrePila(usuario.nombre),
        es_pagador: m.pagador_id === usuario.id,
        ya_reclamo: !!mia,
        coronas: mia ? mia.coronas : 0,
        tiene_parte_asignada: !!asignada,
      };
    }
  }
  const expirada = m.expira_en < ctx.ahora;
  const anulada = m.boleta_estado === 'anulada';
  let estimadas = null;
  let miRango = null;
  if (usuario && usuario.estado === 'activo') {
    const { rango } = await infoRango(ctx.db, usuario.id, ctx.cfg, ctx.ahora);
    estimadas = coronasPorParte(m.parte, rango.pct, ctx.cfg.tope_coronas_por_persona);
    miRango = {
      id: rango.id,
      nombre: rango.nombre,
      pct: rango.pct,
      tope_aplicado: Math.floor((m.parte * rango.pct) / 100) > ctx.cfg.tope_coronas_por_persona,
    };
  }
  return json({
    token: m.token,
    local: m.local_nombre,
    pagador: nombrePila(m.pagador_nombre),
    personas: m.personas,
    parte: m.parte,
    creada_en: m.creada_en,
    expira_en: m.expira_en,
    expirada,
    anulada,
    libres: n.libre || 0,
    asignadas: n.asignada || 0,
    reclamadas: n.reclamada || 0,
    coronas_estimadas: estimadas,
    mi_rango: miRango,
    tope: ctx.cfg.tope_coronas_por_persona,
    yo,
    ahora: ctx.ahora,
  });
}

export async function reclamarMesa(ctx) {
  const u = await exigirUsuario(ctx);
  await leerJSON(ctx.req);
  await exigirLimite(ctx.db, `parte:u:${u.id}`, 20, HORA, ctx.ahora);
  if (u.es_personal) {
    await crearAlerta(ctx.db, 'personal_intento', u.id, { accion: 'reclamar_mesa' }, ctx.ahora);
    throw error(403, 'cuenta_personal', 'Las cuentas del equipo no acumulan coronas.');
  }
  const m = await cargarMesa(ctx, ctx.params.token);
  if (!m) throw error(404, 'mesa_no_encontrada', 'Ese enlace no existe o ya no está disponible.');
  if (m.boleta_estado === 'anulada') throw error(410, 'boleta_anulada', 'La boleta de esa mesa fue anulada.');
  if (m.expira_en < ctx.ahora) throw error(410, 'mesa_vencida', 'Ese enlace ya venció (se puede usar durante 48 horas).');
  if (m.pagador_id === u.id) throw error(409, 'eres_el_pagador', 'Esta es tu propia mesa: tu parte ya está sumada.');
  const ya = await ctx.db.get('SELECT id FROM partes WHERE mesa_id = ? AND usuario_id = ?', [m.id, u.id]);
  if (ya) throw error(409, 'ya_en_mesa', 'Ya reclamaste tu parte de esta mesa.');

  const hace24 = ctx.ahora - DIA;
  const hoy = await ctx.db.get('SELECT COUNT(*) AS n FROM partes WHERE usuario_id = ? AND idx > 0 AND reclamada_en >= ?', [u.id, hace24]);
  if (hoy.n >= ctx.cfg.partes_por_dia) {
    await crearAlerta(ctx.db, 'limite_partes', u.id, { mesa: m.token }, ctx.ahora);
    throw error(429, 'limite_partes', `Llegaste al máximo de ${ctx.cfg.partes_por_dia} partes por día.`);
  }

  await aplicarVencimiento(ctx.db, u.id, ctx.cfg, ctx.ahora);
  const antes = await infoRango(ctx.db, u.id, ctx.cfg, ctx.ahora);
  const coronas = coronasPorParte(m.parte, antes.rango.pct, ctx.cfg.tope_coronas_por_persona);

  const asignada = await ctx.db.get("SELECT id FROM partes WHERE mesa_id = ? AND estado = 'asignada' AND tel_hash = ?", [m.id, u.tel_hash]);
  const filtro = `AND NOT EXISTS (SELECT 1 FROM partes q WHERE q.mesa_id = ? AND q.usuario_id = ?) AND ${SQL_MESA_VIGENTE}`;
  const comunes = [m.id, u.id, m.id, ctx.ahora];
  const sentencia = asignada
    ? [
        `UPDATE partes SET usuario_id = ?, estado = 'reclamada', coronas = ?, gasto = ?, reclamada_en = ?
         WHERE id = ? AND estado = 'asignada' ${filtro}`,
        [u.id, coronas, m.parte, ctx.ahora, asignada.id, ...comunes],
      ]
    : [
        `UPDATE partes SET usuario_id = ?, estado = 'reclamada', coronas = ?, gasto = ?, reclamada_en = ?
         WHERE id = (SELECT id FROM partes WHERE mesa_id = ? AND estado = 'libre' ORDER BY idx LIMIT 1) ${filtro}`,
        [u.id, coronas, m.parte, ctx.ahora, m.id, ...comunes],
      ];

  let res;
  try {
    res = await ctx.db.batch([
      sentencia,
      [
        `INSERT OR IGNORE INTO movimientos (usuario_id, tipo, coronas, gasto, gasto_fecha, efectivo_desde, creado_en, ref, mesa_id, local_id, nota)
         SELECT ?, 'compra', p.coronas, p.gasto, ?, ?, ?, 'compra:' || p.id, p.mesa_id, ?, ?
         FROM partes p WHERE p.mesa_id = ? AND p.usuario_id = ? AND p.estado = 'reclamada' AND p.reclamada_en = ?`,
        [
          u.id, ctx.ahora, ctx.ahora + ctx.cfg.horas_activacion * HORA, ctx.ahora,
          (await ctx.db.get('SELECT local_id FROM boletas WHERE id = ?', [m.boleta_id])).local_id,
          `Mesa de ${nombrePila(m.pagador_nombre)} en ${m.local_nombre}`,
          m.id, u.id, ctx.ahora,
        ],
      ],
    ]);
  } catch {
    throw error(409, 'conflicto', 'No pudimos asignar tu parte. Intenta de nuevo.');
  }
  if (res[0].changes === 0) {
    const reservadas = await ctx.db.get("SELECT COUNT(*) AS n FROM partes WHERE mesa_id = ? AND estado = 'asignada'", [m.id]);
    if (reservadas.n > 0) {
      throw error(409, 'mesa_llena', 'Los lugares que quedan están reservados para amigos de la mesa.');
    }
    throw error(409, 'mesa_llena', 'Esta mesa ya no tiene lugares disponibles.');
  }
  const despues = await infoRango(ctx.db, u.id, ctx.cfg, ctx.ahora);
  return json({
    ok: true,
    local: m.local_nombre,
    pagador: nombrePila(m.pagador_nombre),
    coronas_ganadas: coronas,
    pct: antes.rango.pct,
    tope_aplicado: Math.floor((m.parte * antes.rango.pct) / 100) > ctx.cfg.tope_coronas_por_persona,
    tope: ctx.cfg.tope_coronas_por_persona,
    disponibles_desde: ctx.ahora + ctx.cfg.horas_activacion * HORA,
    gasto_sumado: m.parte,
    rango_antes: antes.rango.nombre,
    rango: despues.rango,
    ascendio: despues.rango.indice > antes.rango.indice,
    saldo: { disponible: despues.saldo.disponible, por_activar: despues.saldo.por_activar },
  });
}

/* ───────────────────────── Canjes y regalo ───────────────────────── */

async function crearFichaConReserva(ctx, u, monto) {
  for (let intento = 0; intento < 6; intento++) {
    const codigo = codigoAleatorio(6);
    const vence = ctx.ahora + vigenciaFichaMs(ctx.cfg);
    try {
      const res = await ctx.db.batch([
        [
          `INSERT INTO movimientos (usuario_id, tipo, coronas, gasto, gasto_fecha, efectivo_desde, creado_en, ref, nota)
           SELECT ?, 'reserva', ?, 0, ?, ?, ?, 'reserva:' || ?, 'Ficha de canje'
           WHERE (SELECT COALESCE(SUM(coronas), 0) FROM movimientos WHERE usuario_id = ? AND efectivo_desde <= ?) >= ?
             AND NOT EXISTS (SELECT 1 FROM fichas WHERE usuario_id = ? AND estado = 'reservada')`,
          [u.id, -monto, ctx.ahora, ctx.ahora, ctx.ahora, codigo, u.id, ctx.ahora, monto, u.id],
        ],
        [
          `INSERT INTO fichas (codigo, usuario_id, tipo, monto, descripcion, estado, dia, creada_en, vence_en)
           SELECT ?, ?, 'canje', ?, ?, 'reservada', ?, ?, ?
           WHERE EXISTS (SELECT 1 FROM movimientos WHERE usuario_id = ? AND ref = ?)`,
          [codigo, u.id, monto, `Descuento de ${fmt(monto)}`, diaChile(ctx.ahora), ctx.ahora, vence, u.id, `reserva:${codigo}`],
        ],
        [
          'UPDATE movimientos SET ficha_id = (SELECT id FROM fichas WHERE codigo = ?) WHERE usuario_id = ? AND ref = ?',
          [codigo, u.id, `reserva:${codigo}`],
        ],
      ]);
      return res[1].changes === 1 ? codigo : null;
    } catch (e) {
      if (/UNIQUE/i.test(String(e?.message)) && /codigo/i.test(String(e?.message))) continue;
      return null;
    }
  }
  return null;
}

/** Valida y reserva las coronas de un canje. Devuelve la ficha creada. La usan el cliente (su ficha) y la caja (por código personal). */
export async function reservarCanje(ctx, u, monto) {
  const cfg = ctx.cfg;
  await aplicarVencimiento(ctx.db, u.id, cfg, ctx.ahora);
  await liberarFichasVencidas(ctx.db, ctx.ahora, u.id);

  if (monto === null || monto < cfg.canje_minimo || monto > cfg.canje_maximo || monto % cfg.canje_multiplo !== 0) {
    throw error(400, 'monto_invalido', `Elige un monto entre ${fmt(cfg.canje_minimo)} y ${fmt(cfg.canje_maximo)}, de ${fmt(cfg.canje_multiplo)} en ${fmt(cfg.canje_multiplo)}.`);
  }
  const activa = await ctx.db.get("SELECT * FROM fichas WHERE usuario_id = ? AND estado = 'reservada'", [u.id]);
  if (activa) throw error(409, 'ficha_activa', 'Ya tienes una ficha activa. Úsala o cancélala antes de crear otra.', { ficha: fichaPublica(activa, ctx.ahora) });
  const hoy = await ctx.db.get(
    "SELECT COUNT(*) AS n FROM fichas WHERE usuario_id = ? AND tipo = 'canje' AND dia = ? AND estado IN ('reservada', 'usada')",
    [u.id, diaChile(ctx.ahora)],
  );
  if (hoy.n >= cfg.canjes_por_dia) {
    throw error(429, 'limite_canjes', `Solo puedes hacer ${cfg.canjes_por_dia} canje${cfg.canjes_por_dia === 1 ? '' : 's'} por día.`);
  }
  const s = await saldoUsuario(ctx.db, u.id, ctx.ahora);
  if (s.disponible < monto) {
    throw error(400, 'saldo_insuficiente', s.por_activar > 0
      ? `Tienes ${fmt(s.disponible)} disponibles. Tus coronas nuevas (${fmt(s.por_activar)}) se activan ${cfg.horas_activacion} horas después de ganarlas.`
      : `Tienes ${fmt(s.disponible)} disponibles.`, {
      disponible: s.disponible, por_activar: s.por_activar, proxima_activacion: s.proxima_activacion,
    });
  }
  const codigo = await crearFichaConReserva(ctx, u, monto);
  if (!codigo) {
    const hayActiva = await ctx.db.get("SELECT 1 AS x FROM fichas WHERE usuario_id = ? AND estado = 'reservada'", [u.id]);
    if (hayActiva) throw error(409, 'ficha_activa', 'Ya tienes una ficha activa. Úsala o cancélala antes de crear otra.');
    throw error(400, 'saldo_insuficiente', 'No alcanzan tus coronas disponibles.');
  }
  return ctx.db.get('SELECT * FROM fichas WHERE codigo = ?', [codigo]);
}

/**
 * El garzón confirma el canje en el celular del cliente con el PIN de su local: es lo mismo que "Aplicar" en la pantalla de caja.
 * Debe hacerse ANTES de que la caja emita la boleta, para que el descuento quede en el total.
 */
export async function confirmarCanje(ctx) {
  const u = await exigirUsuario(ctx);
  const body = await leerJSON(ctx.req);
  const local = await verificarPinLocal(ctx, body.local, body.pin, { desdeCliente: u.id });
  await liberarFichasVencidas(ctx.db, ctx.ahora, u.id);
  const f = await ctx.db.get("SELECT * FROM fichas WHERE usuario_id = ? AND estado = 'reservada'", [u.id]);
  if (!f) throw error(404, 'sin_ficha', 'No tienes una ficha activa (puede haber vencido o ya estar usada).');
  const ficha = await aplicarFichaInterna(ctx, local, f.codigo);
  return json({ ok: true, ficha, local: { codigo: local.codigo, nombre: local.nombre } });
}


export async function crearCanje(ctx) {
  const u = await exigirUsuario(ctx);
  const body = await leerJSON(ctx.req);
  await exigirLimite(ctx.db, `canje:u:${u.id}`, 15, HORA, ctx.ahora);
  const ficha = await reservarCanje(ctx, u, aInt(body.monto));
  return json({ ok: true, ficha: fichaPublica(ficha, ctx.ahora) }, 201);
}

/** Cancela la ficha activa del socio y le devuelve las coronas. Devuelve la ficha cancelada o null si no tenía. */
export async function cancelarFichaActiva(ctx, u) {
  await liberarFichasVencidas(ctx.db, ctx.ahora, u.id);
  const f = await ctx.db.get("SELECT * FROM fichas WHERE usuario_id = ? AND estado = 'reservada'", [u.id]);
  if (!f) return null;
  await ctx.db.batch([
    ["UPDATE fichas SET estado = 'cancelada' WHERE id = ? AND estado = 'reservada'", [f.id]],
    [
      `INSERT OR IGNORE INTO movimientos (usuario_id, tipo, coronas, gasto, gasto_fecha, efectivo_desde, creado_en, ref, ficha_id, nota)
       SELECT f.usuario_id, 'liberacion', f.monto, 0, ?, ?, ?, 'lib:' || f.id, f.id, 'Ficha cancelada: coronas devueltas'
       FROM fichas f WHERE f.id = ? AND f.estado = 'cancelada' AND f.monto > 0`,
      [ctx.ahora, ctx.ahora, ctx.ahora, f.id],
    ],
  ]);
  return f;
}

export async function cancelarCanje(ctx) {
  const u = await exigirUsuario(ctx);
  await leerJSON(ctx.req);
  if (!(await cancelarFichaActiva(ctx, u))) throw error(404, 'sin_ficha', 'No tienes una ficha activa.');
  return json({ ok: true });
}

/** Reserva la ficha del regalo de cumpleaños (valida fecha, antigüedad y visitas). Devuelve la ficha creada. */
export async function reservarRegalo(ctx, u) {
  await liberarFichasVencidas(ctx.db, ctx.ahora, u.id);
  const estado = await estadoRegalo(ctx.db, u, ctx.cfg, ctx.ahora);
  if (!estado.disponible) throw error(403, 'regalo_no_disponible', 'Todavía no puedes pedir tu regalo de cumpleaños.', { motivo: estado.motivo, detalle: estado });
  const activa = await ctx.db.get("SELECT * FROM fichas WHERE usuario_id = ? AND estado = 'reservada'", [u.id]);
  if (activa) throw error(409, 'ficha_activa', 'Ya tienes una ficha activa. Úsala o cancélala antes de crear otra.', { ficha: fichaPublica(activa, ctx.ahora) });
  for (let intento = 0; intento < 6; intento++) {
    const codigo = codigoAleatorio(6);
    try {
      await ctx.db.run(
        `INSERT INTO fichas (codigo, usuario_id, tipo, monto, descripcion, estado, dia, creada_en, vence_en, anio)
         VALUES (?, ?, 'regalo', 0, ?, 'reservada', ?, ?, ?, ?)`,
        [codigo, u.id, ctx.cfg.regalo.descripcion, diaChile(ctx.ahora), ctx.ahora, ctx.ahora + vigenciaFichaMs(ctx.cfg), estado.anio],
      );
      return ctx.db.get('SELECT * FROM fichas WHERE codigo = ?', [codigo]);
    } catch (e) {
      const msg = String(e?.message);
      if (/fichas\.codigo/i.test(msg)) continue;
      throw error(409, 'regalo_ya_pedido', 'Ya tienes una ficha de regalo activa o usada este año.');
    }
  }
  throw error(500, 'sin_codigo', 'No pudimos generar la ficha. Intenta de nuevo.');
}

export async function crearRegalo(ctx) {
  const u = await exigirUsuario(ctx);
  await leerJSON(ctx.req);
  const ficha = await reservarRegalo(ctx, u);
  return json({ ok: true, ficha: fichaPublica(ficha, ctx.ahora) }, 201);
}

export async function historialFichas(ctx) {
  const u = await exigirUsuario(ctx);
  await liberarFichasVencidas(ctx.db, ctx.ahora, u.id);
  const filas = await ctx.db.all('SELECT * FROM fichas WHERE usuario_id = ? ORDER BY id DESC LIMIT 30', [u.id]);
  return json({ fichas: filas.map((f) => fichaPublica(f, ctx.ahora)) });
}

/* ───────────────────────── Cuenta y privacidad ───────────────────────── */

export async function configurarSalon(ctx) {
  const u = await exigirUsuario(ctx);
  const body = await leerJSON(ctx.req);
  if (typeof body.publico !== 'boolean') throw error(400, 'dato_invalido', 'Indica si quieres aparecer o no.');
  await ctx.db.run('UPDATE usuarios SET publico_salon = ? WHERE id = ?', [body.publico ? 1 : 0, u.id]);
  return json({ ok: true, publico_salon: body.publico });
}

export async function salonDelRey(ctx) {
  const filas = await ctx.db.all(
    `SELECT u.id, u.nombre, COALESCE(SUM(CASE WHEN mv.gasto_fecha >= ? THEN mv.gasto ELSE 0 END), 0) AS gasto
     FROM usuarios u JOIN movimientos mv ON mv.usuario_id = u.id
     WHERE u.publico_salon = 1 AND u.estado = 'activo' AND u.es_personal = 0
     GROUP BY u.id HAVING gasto > 0 ORDER BY gasto DESC LIMIT 10`,
    [ctx.ahora - 365 * DIA],
  );
  return json({
    salon: filas.map((f) => {
      const r = calcularRango(f.gasto, ctx.cfg);
      return { nombre: nombrePublico(f.nombre), rango: r.nombre, rango_id: r.id };
    }),
  });
}

export async function exportarMisDatos(ctx) {
  const u = await exigirUsuario(ctx);
  const movs = await ctx.db.all('SELECT tipo, coronas, gasto, creado_en, nota FROM movimientos WHERE usuario_id = ? ORDER BY id', [u.id]);
  const mesas = await ctx.db.all('SELECT token, personas, monto, parte, creada_en FROM mesas WHERE pagador_id = ?', [u.id]);
  const fichas = await ctx.db.all('SELECT codigo, tipo, monto, estado, creada_en, usada_en FROM fichas WHERE usuario_id = ?', [u.id]);
  return json({
    exportado_en: ctx.ahora,
    usuario: { nombre: u.nombre, telefono: u.telefono, nacimiento: u.nacimiento, creado_en: u.creado_en, terminos_version: u.terminos_version },
    movimientos: movs,
    mesas,
    fichas,
  });
}

export async function eliminarCuenta(ctx) {
  const u = await exigirUsuario(ctx);
  const body = await leerJSON(ctx.req);
  if (body.confirmar !== true) throw error(400, 'falta_confirmacion', 'Confirma que quieres eliminar tu cuenta.');
  await liberarFichasVencidas(ctx.db, ctx.ahora, u.id);
  const aleatorio = await hmac(ctx.secreto, `eliminado:${u.id}:${tokenAleatorio(12)}`);
  await ctx.db.batch([
    ["UPDATE fichas SET estado = 'cancelada' WHERE usuario_id = ? AND estado = 'reservada'", [u.id]],
    [
      `INSERT OR IGNORE INTO movimientos (usuario_id, tipo, coronas, gasto, gasto_fecha, efectivo_desde, creado_en, ref, ficha_id, nota)
       SELECT f.usuario_id, 'liberacion', f.monto, 0, ?, ?, ?, 'lib:' || f.id, f.id, 'Ficha cancelada'
       FROM fichas f WHERE f.usuario_id = ? AND f.estado = 'cancelada' AND f.monto > 0`,
      [ctx.ahora, ctx.ahora, ctx.ahora, u.id],
    ],
    ["UPDATE partes SET estado = 'libre', tel_hash = NULL, etiqueta = NULL WHERE tel_hash = ? AND estado = 'asignada'", [u.tel_hash]],
    ['DELETE FROM sesiones WHERE usuario_id = ?', [u.id]],
    [
      `UPDATE usuarios SET estado = 'eliminado', telefono = NULL, tel_hash = ?, nombre = 'Socio eliminado', nacimiento = '1900-01-01',
         publico_salon = 0 WHERE id = ?`,
      [aleatorio, u.id],
    ],
  ]);
  await auditar(ctx.db, `usuario:${u.id}`, 'eliminar_cuenta', undefined, ctx.ahora);
  return json({ ok: true }, 200, { 'set-cookie': `club_sid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${ctx.seguro ? '; Secure' : ''}` });
}
