// Íconos de línea y medallas.
export { medallaSVG } from './medallas.js';

const TRAZOS = {
  casa: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h13V10"/><path d="M10 19.5v-5h4v5"/>',
  ticket: '<path d="M4 7h16v3a2 2 0 0 0 0 4v3H4v-3a2 2 0 0 0 0-4z"/><path d="M14.5 7.5v9" stroke-dasharray="1.8 2.2"/>',
  recibo: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  trofeo: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5v1a3 3 0 0 0 3 3M16 6h3v1a3 3 0 0 1-3 3"/><path d="M12 13v4M8.5 20h7M10 17h4"/>',
  usuario: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>',
  corona: '<path d="M4 17 3 7l5 4 4-6 4 6 5-4-1 10z"/><path d="M4 20h16"/>',
  regalo: '<rect x="3.5" y="9" width="17" height="11" rx="1.5"/><path d="M12 9v11M3.5 13h17"/><path d="M12 9C10 5 6 6 7 9M12 9c2-4 6-3 5 0"/>',
  grupo: '<circle cx="9" cy="9" r="3.2"/><circle cx="17" cy="10" r="2.6"/><path d="M3 19a6 6 0 0 1 12 0M15.5 15.2A5 5 0 0 1 21 19"/>',
  pastel: '<path d="M4 12h16v8H4z"/><path d="M4 16c2 1.5 3 1.5 4 0s3-1.5 4 0 3 1.5 4 0 2-1.5 4 0"/><path d="M12 12V8M12 4.5v.5"/>',
  deshacer: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  alerta: '<path d="M12 4 2.5 20h19z"/><path d="M12 10v5M12 17.5v.5"/>',
  reloj: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  ajuste: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.5"/>',
  limon: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="6.5"/><path d="M12 5.5v13M5.5 12h13M7.4 7.4l9.2 9.2M16.6 7.4l-9.2 9.2"/>',
  qr: '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><path d="M14 14h3v3h-3zM20 14v3M14 20h3M20 20v.5M17 17h3"/>',
  jarro: '<path d="M6 8h10l-.8 10.2a2 2 0 0 1-2 1.8H8.8a2 2 0 0 1-2-1.8z"/><path d="M16 10h2.2a1.8 1.8 0 0 1 1.8 1.8v2.4a1.8 1.8 0 0 1-1.8 1.8H15.6"/><path d="M6 8a2.4 2.4 0 0 1 1.2-4.4 2.8 2.8 0 0 1 4.8-.4A2.4 2.4 0 0 1 16 8"/>',
  fiesta: '<path d="m4 20 4.5-12 7.5 7.5z"/><path d="M13 5v.5M18 8v.5M19 14v.5M10 3v.5"/>',
};
export const ico = (n) => `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${TRAZOS[n] || ''}</svg>`;
export const EMOJI_MOV = { compra: ico('corona'), reserva: ico('ticket'), liberacion: ico('deshacer'), uso_dif: ico('deshacer'), reversa: ico('alerta'), vencimiento: ico('reloj'), ajuste: ico('ajuste') };
