export const money = (n) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(Number(n || 0));
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function normalizeRut(value) { return String(value).replace(/[^0-9kK]/g, '').toUpperCase(); }
export function validRut(value) {
  const v = normalizeRut(value);
  if (!/^\d{7,8}[\dK]$/.test(v)) return false;
  let sum = 0, factor = 2;
  for (let i = v.length - 2; i >= 0; i--) { sum += Number(v[i]) * factor; factor = factor === 7 ? 2 : factor + 1; }
  const n = 11 - sum % 11;
  return v.at(-1) === (n === 11 ? '0' : n === 10 ? 'K' : String(n));
}
export function normalizePhone(value) {
  const digits = String(value).replace(/\D/g, '');
  return digits.startsWith('56') ? `+${digits}` : `+56${digits}`;
}
export function adultBirthday(value, today = new Date()) {
  const birth = new Date(`${value}T12:00:00`);
  if (!value || Number.isNaN(birth.getTime()) || birth.toISOString().slice(0,10) !== value) return false;
  const cutoff = new Date(today); cutoff.setFullYear(cutoff.getFullYear() - 18);
  const oldest = new Date(today); oldest.setFullYear(oldest.getFullYear() - 110);
  return birth <= cutoff && birth >= oldest;
}
export function validateRegistration(data) {
  if (data.first_name.trim().length < 2 || data.last_name.trim().length < 2) throw new Error('Ingresa tu nombre y apellido.');
  if (!validRut(data.rut)) throw new Error('Revisa el RUT y su dígito verificador.');
  if (!/^\+569\d{8}$/.test(normalizePhone(data.phone))) throw new Error('Ingresa un celular chileno: +56 9 y ocho dígitos.');
  if (!adultBirthday(data.birthday)) throw new Error('Debes tener entre 18 y 110 años para unirte al Club.');
  if (!data.terms) throw new Error('Acepta los términos para continuar.');
  if (data.password.length < 10) throw new Error('Usa una contraseña de al menos 10 caracteres.');
}
export function safeMenuUrl(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null; } catch { return null; }
}
export function distanceKm(a,b) {
  if (![a.latitude,a.longitude,b.latitude,b.longitude].every(Number.isFinite)) return Infinity;
  const rad = x => x*Math.PI/180;
  const dlat=rad(b.latitude-a.latitude),dlon=rad(b.longitude-a.longitude);
  const h=Math.sin(dlat/2)**2+Math.cos(rad(a.latitude))*Math.cos(rad(b.latitude))*Math.sin(dlon/2)**2;
  return 6371*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));
}
