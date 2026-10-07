// Utilidades de la interfaz: API, formato, avisos, confeti, QR y compartir.
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fmt = (n) => '$' + Math.round(n || 0).toLocaleString('es-CL');

const TZ = 'America/Santiago';
const fHora = new Intl.DateTimeFormat('es-CL', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
const fCorta = new Intl.DateTimeFormat('es-CL', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' });
const fDia = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
export const mesAnio = (ms) => new Date(ms).toLocaleDateString('es-CL', { timeZone: TZ, month: 'long', year: 'numeric' });
export const hora = (ms) => fHora.format(ms);
export const fechaCorta = (ms) => fCorta.format(ms);

/** "hoy a las 21:14", "mañana a las 21:14" o "jue 9 oct, 21:14". */
export function cuando(ms, ahora = Date.now()) {
  const d = fDia.format(ms);
  const hoy = fDia.format(ahora);
  const man = fDia.format(ahora + 86_400_000);
  if (d === hoy) return `hoy a las ${hora(ms)}`;
  if (d === man) return `mañana a las ${hora(ms)}`;
  return `${fechaCorta(ms)}, ${hora(ms)}`;
}

export function duracion(ms) {
  const m = Math.max(0, Math.round(ms / 60_000));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h} h ${m % 60 ? (m % 60) + ' min' : ''}`.trim() : `${Math.round(h / 24)} días`;
}

export class ApiError extends Error {
  constructor(estado, datos) {
    super(datos.mensaje || 'Algo salió mal.');
    this.estado = estado;
    this.codigo = datos.codigo || 'error';
    this.datos = datos;
  }
}

export async function api(metodo, ruta, cuerpo) {
  let resp;
  try {
    resp = await fetch(ruta, {
      method: metodo,
      headers: cuerpo !== undefined ? { 'content-type': 'application/json' } : {},
      body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError(0, { codigo: 'sin_conexion', mensaje: 'No hay conexión. Revisa tu internet e intenta de nuevo.' });
  }
  let datos = null;
  try {
    datos = await resp.json();
  } catch { /* sin cuerpo */ }
  if (!resp.ok) throw new ApiError(resp.status, datos?.error || { codigo: 'error', mensaje: 'Algo salió mal. Intenta de nuevo.' });
  return datos;
}

export function toast(mensaje, tipo = 'ok') {
  let cont = $('#toasts');
  if (!cont) {
    cont = document.createElement('div');
    cont.id = 'toasts';
    cont.setAttribute('role', 'status');
    cont.setAttribute('aria-live', 'polite');
    document.body.appendChild(cont);
  }
  const t = document.createElement('div');
  t.className = 'toast' + (tipo === 'err' ? ' err' : '');
  t.textContent = mensaje;
  cont.appendChild(t);
  setTimeout(() => t.remove(), 4200);
}

export async function copiar(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    toast('Enlace copiado');
  } catch {
    const ta = document.createElement('textarea');
    ta.value = texto;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); toast('Enlace copiado'); } catch { toast('No se pudo copiar', 'err'); }
    ta.remove();
  }
}

export async function compartirNativo(datos) {
  if (navigator.share) {
    try {
      await navigator.share(datos);
      return true;
    } catch { return false; }
  }
  return false;
}

export const enlaceWhatsApp = (texto) => `https://wa.me/?text=${encodeURIComponent(texto)}`;

/** QR como SVG a partir de la librería qrcode-generator (cargada en index.html). */
export function qrSvg(texto, px = 200) {
  if (typeof window.qrcode !== 'function') return '';
  const qr = window.qrcode(0, 'M');
  qr.addData(texto);
  qr.make();
  const n = qr.getModuleCount();
  let celdas = '';
  for (let f = 0; f < n; f++) for (let c = 0; c < n; c++) if (qr.isDark(f, c)) celdas += `<rect x="${c}" y="${f}" width="1.02" height="1.02"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" width="${px}" height="${px}" shape-rendering="crispEdges" role="img" aria-label="Código QR"><rect width="${n}" height="${n}" fill="#fff"/><g fill="#1b1204">${celdas}</g></svg>`;
}

/** Confeti ligero en canvas (coronas y colores del Rey). */
export function confeti(grande = false) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const cv = document.createElement('canvas');
  cv.id = 'confeti';
  cv.width = innerWidth;
  cv.height = innerHeight;
  document.body.appendChild(cv);
  const g = cv.getContext('2d');
  const colores = ['#f7b22a', '#e8541e', '#ffd36b', '#9bc53d', '#fff7e3'];
  const piezas = Array.from({ length: grande ? 140 : 70 }, () => ({
    x: Math.random() * cv.width, y: -20 - Math.random() * cv.height * 0.5,
    vx: (Math.random() - 0.5) * 3, vy: 2 + Math.random() * 4, r: 4 + Math.random() * 6,
    c: colores[(Math.random() * colores.length) | 0], rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3,
    corona: grande && Math.random() < 0.18,
  }));
  let cuadros = 0;
  (function paso() {
    g.clearRect(0, 0, cv.width, cv.height);
    for (const p of piezas) {
      p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      g.save(); g.translate(p.x, p.y); g.rotate(p.rot);
      if (p.corona) { g.font = '22px serif'; g.fillText('👑', -10, 8); } else { g.fillStyle = p.c; g.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 0.6); }
      g.restore();
    }
    if (++cuadros < (grande ? 220 : 150)) requestAnimationFrame(paso); else cv.remove();
  })();
}

const temporizadores = new Set();
export function intervalo(fn, ms) {
  const id = setInterval(fn, ms);
  temporizadores.add(id);
  return id;
}
export function limpiarTemporizadores() {
  temporizadores.forEach(clearInterval);
  temporizadores.clear();
}

export function modal(html) {
  const fondo = document.createElement('div');
  fondo.className = 'modal-fondo';
  fondo.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
  const cerrar = () => fondo.remove();
  fondo.addEventListener('click', (e) => { if (e.target === fondo) cerrar(); });
  document.body.appendChild(fondo);
  return { el: fondo.firstElementChild, cerrar };
}

export function soloDigitos(v) {
  return String(v || '').replace(/\D/g, '');
}

/** Formatea "912345678" como "9 1234 5678" mientras se escribe. */
export function formatearTelefono(v) {
  let d = soloDigitos(v);
  if (d.startsWith('56') && d.length > 9) d = d.slice(2);
  if (d.startsWith('0')) d = d.slice(1);
  d = d.slice(0, 9);
  return [d.slice(0, 1), d.slice(1, 5), d.slice(5, 9)].filter(Boolean).join(' ');
}

export function formatearCodigo(v) {
  const s = String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  return s.length > 3 ? `${s.slice(0, 3)}-${s.slice(3)}` : s;
}
