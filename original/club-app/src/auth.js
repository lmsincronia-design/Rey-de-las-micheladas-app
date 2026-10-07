// Sesiones, verificación del teléfono (código por WhatsApp) y registro de socios.
import { error, json, crearCookie, borrarCookie, leerJSON, exigirLimite } from './lib/http.js';
import {
  DIA, MIN, sha256, hmac, tokenAleatorio, digitosAleatorios, iguales, normalizarTelefono, limpiarNombre,
  fechaValida, edadEn, diaChile, codigoSocioAleatorio,
} from './lib/util.js';

export const COOKIES = { cliente: 'club_sid', staff: 'club_staff', admin: 'club_admin' };
const VIDA_SESION = { cliente: 90 * DIA, staff: 12 * 60 * MIN, admin: 8 * 60 * MIN };

export async function crearSesion(ctx, tipo, { usuarioId = null, localId = null } = {}) {
  const token = tokenAleatorio(32);
  const hash = await sha256(token);
  const vida = VIDA_SESION[tipo];
  await ctx.db.run('DELETE FROM sesiones WHERE expira_en < ?', [ctx.ahora]);
  await ctx.db.run(
    'INSERT INTO sesiones (tipo, token_hash, usuario_id, local_id, expira_en, creado_en) VALUES (?, ?, ?, ?, ?, ?)',
    [tipo, hash, usuarioId, localId, ctx.ahora + vida, ctx.ahora],
  );
  const cookie = crearCookie(COOKIES[tipo], token, { maxAgeSeg: Math.floor(vida / 1000), seguro: ctx.seguro });
  return { token, cookie };
}

export async function leerSesion(ctx, tipo) {
  const token = ctx.cookies[COOKIES[tipo]];
  if (!token) return null;
  const fila = await ctx.db.get('SELECT * FROM sesiones WHERE token_hash = ? AND tipo = ? AND expira_en > ?', [
    await sha256(token),
    tipo,
    ctx.ahora,
  ]);
  return fila;
}

export async function cerrarSesionTipo(ctx, tipo) {
  const token = ctx.cookies[COOKIES[tipo]];
  if (token) await ctx.db.run('DELETE FROM sesiones WHERE token_hash = ?', [await sha256(token)]);
  return borrarCookie(COOKIES[tipo], ctx.seguro);
}

export async function exigirUsuario(ctx) {
  const s = await leerSesion(ctx, 'cliente');
  if (!s) throw error(401, 'no_autenticado', 'Inicia sesión para continuar.');
  const u = await ctx.db.get('SELECT * FROM usuarios WHERE id = ?', [s.usuario_id]);
  if (!u || u.estado === 'eliminado') throw error(401, 'no_autenticado', 'Inicia sesión para continuar.');
  if (u.estado === 'bloqueado') throw error(403, 'cuenta_bloqueada', 'Tu cuenta está bloqueada. Habla con el equipo del Rey.');
  return u;
}

async function enviarCodigo(ctx, telefono, codigo) {
  if (ctx.demo) return { demo: true };
  const { WHATSAPP_TOKEN, WHATSAPP_PHONE_ID, WHATSAPP_OTP_TEMPLATE } = ctx.env;
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) {
    throw error(503, 'otp_no_configurado', 'El envío de códigos aún no está configurado.');
  }
  // Plantilla de autenticación aprobada por Meta (categoría "authentication"). Sin probar contra Meta todavía.
  const resp = await fetch(`https://graph.facebook.com/v20.0/${WHATSAPP_PHONE_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: telefono.slice(1),
      type: 'template',
      template: {
        name: WHATSAPP_OTP_TEMPLATE || 'club_codigo',
        language: { code: 'es' },
        components: [
          { type: 'body', parameters: [{ type: 'text', text: codigo }] },
          { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: codigo }] },
        ],
      },
    }),
  });
  if (!resp.ok) throw error(502, 'otp_no_enviado', 'No pudimos enviar el código por WhatsApp. Intenta de nuevo.');
  return { demo: false };
}

export async function solicitarCodigo(ctx) {
  const body = await leerJSON(ctx.req);
  const telefono = normalizarTelefono(body.telefono);
  if (!telefono) throw error(400, 'telefono_invalido', 'Ingresa un celular chileno de 9 dígitos que parta con 9.');
  await exigirLimite(ctx.db, `otp:tel:${telefono}`, 3, 10 * MIN, ctx.ahora, 'Pediste varios códigos seguidos. Espera unos minutos.');
  await exigirLimite(ctx.db, `otp:ip:${ctx.ip}`, 20, 60 * MIN, ctx.ahora);

  const existente = await ctx.db.get('SELECT estado FROM usuarios WHERE telefono = ?', [telefono]);
  if (existente?.estado === 'bloqueado') throw error(403, 'cuenta_bloqueada', 'Tu cuenta está bloqueada. Habla con el equipo del Rey.');

  const codigo = digitosAleatorios(6);
  await ctx.db.batch([
    ['UPDATE otps SET usado = 1 WHERE telefono = ? AND usado = 0', [telefono]],
    [
      'INSERT INTO otps (telefono, codigo_hash, expira_en, creado_en) VALUES (?, ?, ?, ?)',
      [telefono, await hmac(ctx.secreto, `otp:${telefono}:${codigo}`), ctx.ahora + 5 * MIN, ctx.ahora],
    ],
  ]);
  const envio = await enviarCodigo(ctx, telefono, codigo);
  return json({ ok: true, expira_seg: 300, ...(envio.demo ? { codigo_demo: codigo } : {}) });
}

export async function verificarCodigo(ctx) {
  const body = await leerJSON(ctx.req);
  const telefono = normalizarTelefono(body.telefono);
  const codigo = typeof body.codigo === 'string' ? body.codigo.replace(/\s/g, '') : '';
  if (!telefono) throw error(400, 'telefono_invalido', 'Ingresa un celular chileno de 9 dígitos que parta con 9.');
  if (!/^\d{6}$/.test(codigo)) throw error(400, 'codigo_invalido', 'El código tiene 6 dígitos.');
  await exigirLimite(ctx.db, `otpv:tel:${telefono}`, 12, 60 * MIN, ctx.ahora);
  await exigirLimite(ctx.db, `otpv:ip:${ctx.ip}`, 40, 60 * MIN, ctx.ahora);

  const otp = await ctx.db.get(
    'SELECT * FROM otps WHERE telefono = ? AND usado = 0 AND expira_en > ? ORDER BY id DESC LIMIT 1',
    [telefono, ctx.ahora],
  );
  if (!otp) throw error(400, 'codigo_vencido', 'El código venció o ya se usó. Pide uno nuevo.');
  const intento = await ctx.db.run('UPDATE otps SET intentos = intentos + 1 WHERE id = ? AND usado = 0 AND intentos < 5', [otp.id]);
  if (intento.changes === 0) throw error(429, 'demasiados_intentos', 'Demasiados intentos con este código. Pide uno nuevo.');
  const esperado = await hmac(ctx.secreto, `otp:${telefono}:${codigo}`);
  if (!iguales(esperado, otp.codigo_hash)) {
    throw error(400, 'codigo_incorrecto', 'Ese código no es correcto.', { intentos_restantes: Math.max(0, 5 - (otp.intentos + 1)) });
  }

  const usuario = await ctx.db.get('SELECT * FROM usuarios WHERE telefono = ?', [telefono]);
  if (usuario) {
    if (usuario.estado === 'bloqueado') throw error(403, 'cuenta_bloqueada', 'Tu cuenta está bloqueada. Habla con el equipo del Rey.');
    const gastado = await ctx.db.run('UPDATE otps SET usado = 1 WHERE id = ? AND usado = 0', [otp.id]);
    if (gastado.changes === 0) throw error(400, 'codigo_vencido', 'El código venció o ya se usó. Pide uno nuevo.');
    const { cookie } = await crearSesion(ctx, 'cliente', { usuarioId: usuario.id });
    return json({ nuevo: false, usuario: { id: usuario.id, nombre: usuario.nombre } }, 200, { 'set-cookie': cookie });
  }
  const registro = tokenAleatorio(24);
  const gastado = await ctx.db.run(
    'UPDATE otps SET usado = 1, registro_hash = ?, registro_expira = ? WHERE id = ? AND usado = 0',
    [await sha256(registro), ctx.ahora + 15 * MIN, otp.id],
  );
  if (gastado.changes === 0) throw error(400, 'codigo_vencido', 'El código venció o ya se usó. Pide uno nuevo.');
  return json({ nuevo: true, registro_token: registro, expira_seg: 900 });
}

export async function registrar(ctx) {
  const body = await leerJSON(ctx.req);
  const token = typeof body.registro_token === 'string' ? body.registro_token : '';
  if (!token) throw error(400, 'registro_vencido', 'Tu verificación venció. Empieza de nuevo.');
  const nombre = limpiarNombre(body.nombre);
  if (!nombre) throw error(400, 'nombre_invalido', 'Escribe tu nombre (2 a 60 letras).');
  if (!fechaValida(body.nacimiento)) throw error(400, 'nacimiento_invalido', 'Ingresa una fecha de cumpleaños válida.');
  const hoy = diaChile(ctx.ahora);
  if (body.nacimiento > hoy) throw error(400, 'nacimiento_invalido', 'Ingresa una fecha de cumpleaños válida.');
  if (edadEn(body.nacimiento, hoy) < ctx.cfg.edad_minima) {
    throw error(403, 'menor_de_edad', `El Club es solo para mayores de ${ctx.cfg.edad_minima} años.`);
  }
  if (body.acepta !== true) throw error(400, 'falta_consentimiento', 'Debes aceptar los términos y el uso de tus datos para unirte.');

  const otp = await ctx.db.get('SELECT * FROM otps WHERE registro_hash = ? AND registro_usado = 0 AND registro_expira > ?', [
    await sha256(token),
    ctx.ahora,
  ]);
  if (!otp) throw error(400, 'registro_vencido', 'Tu verificación venció. Empieza de nuevo.');
  const gate = await ctx.db.run('UPDATE otps SET registro_usado = 1 WHERE id = ? AND registro_usado = 0', [otp.id]);
  if (gate.changes === 0) throw error(400, 'registro_vencido', 'Tu verificación venció. Empieza de nuevo.');

  const telHash = await hmac(ctx.secreto, `tel:${otp.telefono}`);
  const personal = await ctx.db.get('SELECT 1 AS x FROM personal WHERE tel_hash = ?', [telHash]);
  let usuarioId;
  try {
    let r = null;
    for (let intento = 0; intento < 8 && !r; intento++) {
      try {
        r = await ctx.db.run(
          `INSERT INTO usuarios (telefono, tel_hash, nombre, nacimiento, estado, es_personal, terminos_version, consentimiento_en, creado_en, codigo_socio)
           VALUES (?, ?, ?, ?, 'activo', ?, ?, ?, ?, ?)`,
          [otp.telefono, telHash, nombre, body.nacimiento, personal ? 1 : 0, ctx.cfg.terminos_version, ctx.ahora, ctx.ahora, codigoSocioAleatorio()],
        );
      } catch (e) {
        if (!/codigo_socio/i.test(String(e?.message))) throw e; // código repetido: se prueba con otro
      }
    }
    if (!r) throw new Error('No se pudo generar el código de socio');
    usuarioId = r.lastRowId;
  } catch (e) {
    if (!/UNIQUE/i.test(String(e?.message))) throw e;
    const ya = await ctx.db.get('SELECT id FROM usuarios WHERE telefono = ?', [otp.telefono]);
    usuarioId = ya.id;
  }
  const { cookie } = await crearSesion(ctx, 'cliente', { usuarioId });
  return json({ ok: true, usuario: { id: usuarioId, nombre } }, 201, { 'set-cookie': cookie });
}

export async function salir(ctx) {
  const cookie = await cerrarSesionTipo(ctx, 'cliente');
  return json({ ok: true }, 200, { 'set-cookie': cookie });
}
