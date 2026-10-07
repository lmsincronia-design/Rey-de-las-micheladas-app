// Utilidades puras: tiempo, códigos aleatorios, criptografía, teléfonos y fechas.

export const SEG = 1000;
export const MIN = 60 * SEG;
export const HORA = 60 * MIN;
export const DIA = 24 * HORA;

/** Sin I, L, O, 0 ni 1 para que nadie confunda letras con números al tipear. */
export const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

const enc = new TextEncoder();

function enteroAleatorio(max) {
  const limite = Math.floor(0x100000000 / max) * max;
  const buf = new Uint32Array(1);
  do {
    crypto.getRandomValues(buf);
  } while (buf[0] >= limite);
  return buf[0] % max;
}

export function codigoAleatorio(largo = 6, alfabeto = ALFABETO) {
  let s = '';
  for (let i = 0; i < largo; i++) s += alfabeto[enteroAleatorio(alfabeto.length)];
  return s;
}

export const digitosAleatorios = (largo = 6) => codigoAleatorio(largo, '0123456789');

function base64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function tokenAleatorio(bytes = 32) {
  const b = new Uint8Array(bytes);
  crypto.getRandomValues(b);
  return base64url(b);
}

const aHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

export async function sha256(texto) {
  return aHex(await crypto.subtle.digest('SHA-256', enc.encode(texto)));
}

export async function hmac(secreto, texto) {
  const llave = await crypto.subtle.importKey('raw', enc.encode(secreto), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return aHex(await crypto.subtle.sign('HMAC', llave, enc.encode(texto)));
}

/** Comparación en tiempo constante (para contraseñas y hashes). */
export function iguales(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/** Acepta 9 1234 5678 · +56 9 1234 5678 · 56912345678 · 0912345678. Devuelve +569XXXXXXXX o null. */
export function normalizarTelefono(entrada) {
  if (typeof entrada !== 'string') return null;
  let s = entrada.replace(/[\s\-().]/g, '');
  if (s.startsWith('+')) s = s.slice(1);
  if (/^569\d{8}$/.test(s)) return '+' + s;
  if (/^9\d{8}$/.test(s)) return '+56' + s;
  if (/^09\d{8}$/.test(s)) return '+56' + s.slice(1);
  return null;
}

export function enmascararTelefono(t) {
  return t ? `+56 9 •••• ${t.slice(-4)}` : '';
}

/** Códigos de boleta/ficha: mayúsculas, sin espacios ni guiones. */
export function normalizarCodigo(entrada) {
  if (typeof entrada !== 'string') return '';
  return entrada.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function formatearCodigo(codigo) {
  return codigo.length === 6 ? `${codigo.slice(0, 3)}-${codigo.slice(3)}` : codigo;
}

const fmtDia = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' });
export const diaChile = (ms) => fmtDia.format(new Date(ms));

const fmtHora = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

/** Hora de reloj en Chile (y, m, d, hh, mm, ss) -> milisegundos UTC. Maneja el cambio de horario de verano. */
export function chileAMs(y, m, d, hh = 0, mm = 0, ss = 0) {
  for (const offset of [-3, -4]) {
    const ms = Date.UTC(y, m - 1, d, hh - offset, mm, ss);
    const p = Object.fromEntries(fmtHora.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
    if (Number(p.year) === y && Number(p.month) === m && Number(p.day) === d && Number(p.hour) === hh && Number(p.minute) === mm) return ms;
  }
  return Date.UTC(y, m - 1, d, hh + 4, mm, ss);
}

/**
 * Convierte lo que manda una caja o un Excel a milisegundos.
 * Número = epoch ms. Texto con zona horaria (Z, +00:00) = tal cual. Texto sin zona = hora de Chile
 * ("2026-10-06 21:14", "2026-10-06T21:14:00", "06/10/2026 21:14"). Devuelve null si no se entiende.
 */
export function fechaAMs(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const s = v.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(s);
  if (m) return chileAMs(+m[1], +m[2], +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(s);
  if (m) return chileAMs(+m[3], +m[2], +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  const ms = Date.parse(s);
  return Number.isFinite(ms) ? ms : null;
}

export function fechaValida(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  if (y < 1900) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function edadEn(nacimiento, hoyISO) {
  const [y, m, d] = nacimiento.split('-').map(Number);
  const [Y, M, D] = hoyISO.split('-').map(Number);
  let e = Y - y;
  if (M < m || (M === m && D < d)) e--;
  return e;
}

/** Nombre limpio o null si no es válido. */
export function limpiarNombre(entrada, max = 60) {
  if (typeof entrada !== 'string') return null;
  const s = entrada.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (s.length < 2 || s.length > max) return null;
  if (!/^[\p{L}][\p{L}\p{M} .'’-]*$/u.test(s)) return null;
  return s;
}

export const nombrePila = (nombre) => (nombre || '').split(' ')[0];

/** "Camila Rojas" -> "Camila R." (lo que ven otros socios). */
export function nombrePublico(nombre) {
  const partes = (nombre || '').split(' ').filter(Boolean);
  if (partes.length <= 1) return partes[0] || '';
  return `${partes[0]} ${partes[partes.length - 1][0]}.`;
}

export function aInt(v) {
  if (typeof v === 'number' && Number.isInteger(v)) return v;
  if (typeof v === 'string' && /^-?\d{1,12}$/.test(v.trim())) return parseInt(v, 10);
  return null;
}

/** Cumpleaños más cercano a `ahora` (maneja 29 de febrero). Devuelve {ms, anio} del día en hora de Chile (mediodía UTC). */
export function proximoCumple(nacimiento, ahoraMs) {
  const [, m, d] = nacimiento.split('-').map(Number);
  const hoy = diaChile(ahoraMs);
  const anioHoy = Number(hoy.slice(0, 4));
  let mejor = null;
  for (const anio of [anioHoy - 1, anioHoy, anioHoy + 1]) {
    let dia = d;
    if (m === 2 && d === 29) {
      const bisiesto = (anio % 4 === 0 && anio % 100 !== 0) || anio % 400 === 0;
      if (!bisiesto) dia = 28;
    }
    const ms = Date.UTC(anio, m - 1, dia, 12);
    const dist = Math.abs(ms - Date.parse(hoy + 'T12:00:00Z'));
    if (!mejor || dist < mejor.dist) mejor = { ms, anio, dist };
  }
  return mejor;
}

/** Código personal del socio: 6 caracteres sin O, I, L, 0 ni 1. Se muestra como ABC-123. */
export const codigoSocioAleatorio = () => codigoAleatorio(6);
