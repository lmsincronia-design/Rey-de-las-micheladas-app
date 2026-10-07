// Vista previa del enlace (WhatsApp, Instagram, etc.): estas etiquetas las leen los servidores de mensajería, no el navegador,
// así que se escriben en el HTML antes de enviarlo. El enlace de una mesa muestra el nombre de quien paga y el local.
import { nombrePila } from './util.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => '$' + Math.round(n).toLocaleString('es-CL');

/** { titulo, descripcion } para /m/<token>, o null si no existe (se usa la vista previa general). */
export async function metaMesa(db, token, ahora = Date.now()) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{8,40}$/.test(token)) return null;
  const m = await db.get(
    `SELECT m.parte, m.expira_en, u.nombre AS pagador, l.nombre AS local
     FROM mesas m JOIN usuarios u ON u.id = m.pagador_id JOIN boletas b ON b.id = m.boleta_id JOIN locales l ON l.id = b.local_id
     WHERE m.token = ?`,
    [token],
  );
  if (!m) return null;
  return {
    titulo: `${nombrePila(m.pagador)} te guardó tu parte en el Club del Rey`,
    descripcion: m.expira_en < ahora
      ? `Este enlace ya venció. ${m.local}`
      : `Reclama tu parte de la cuenta (${fmt(m.parte)}) en ${m.local} y suma coronas. Entra antes de que venza.`,
  };
}

/** Reemplaza el origen (para que la imagen sea una URL absoluta) y, si hay datos, el título y la descripción. */
export function aplicarOG(html, origen, meta = null) {
  let out = html.split('__ORIGEN__').join(origen);
  if (meta) {
    out = out
      .replace(/(<meta property="og:title" content=")[^"]*(")/, (_, a, b) => a + esc(meta.titulo) + b)
      .replace(/(<meta property="og:description" content=")[^"]*(")/, (_, a, b) => a + esc(meta.descripcion) + b)
      .replace(/(<meta name="twitter:title" content=")[^"]*(")/, (_, a, b) => a + esc(meta.titulo) + b)
      .replace(/(<title>)[^<]*(<\/title>)/, (_, a, b) => a + esc(meta.titulo) + b);
  }
  return out;
}

export const TOKEN_EN_RUTA = /^\/m\/([^/]+)\/?$/;
