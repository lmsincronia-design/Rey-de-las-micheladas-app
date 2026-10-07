// Moneda de oro con corona: la "corona" que se gana y se canjea.
let _mon = 0;

export function monedaSVG(tam = 48) {
  const i = ++_mon;
  const dientes = Array.from({ length: 36 }, (_, k) => {
    const a = (k / 36) * Math.PI * 2;
    return `<line x1="${(50 + 43 * Math.cos(a)).toFixed(1)}" y1="${(50 + 43 * Math.sin(a)).toFixed(1)}" x2="${(50 + 47 * Math.cos(a)).toFixed(1)}" y2="${(50 + 47 * Math.sin(a)).toFixed(1)}"/>`;
  }).join('');
  return `<svg class="moneda" width="${tam}" height="${tam}" viewBox="0 0 100 100" role="img" aria-label="Coronas" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="mo${i}" x1="15%" y1="0%" x2="85%" y2="100%"><stop offset="0" stop-color="#fff3b8"/><stop offset=".45" stop-color="#f7b22a"/><stop offset="1" stop-color="#b8740a"/></linearGradient>
    <linearGradient id="mi${i}" x1="85%" y1="0%" x2="15%" y2="100%"><stop offset="0" stop-color="#fff3b8"/><stop offset=".5" stop-color="#ffc94d"/><stop offset="1" stop-color="#d98a1a"/></linearGradient>
  </defs>
  <circle cx="50" cy="53" r="47" fill="#5a3606" opacity=".45"/>
  <circle cx="50" cy="50" r="47" fill="url(#mo${i})"/>
  <g stroke="#a8650a" stroke-width="1.6" opacity=".7">${dientes}</g>
  <circle cx="50" cy="50" r="40" fill="url(#mi${i})" stroke="#b8740a" stroke-width="1.4"/>
  <path d="M27 64l-3-23 14 11 12-19 12 19 14-11-3 23z" fill="#8a520a" opacity=".35" transform="translate(1.5 2)"/>
  <path d="M27 64l-3-23 14 11 12-19 12 19 14-11-3 23z" fill="#fff6c8" stroke="#a8650a" stroke-width="2" stroke-linejoin="round"/>
  <rect x="27" y="66" width="46" height="6" rx="2" fill="#f7b22a" stroke="#a8650a" stroke-width="1.6"/>
  <circle cx="24" cy="40" r="3.2" fill="#e8541e"/><circle cx="50" cy="31" r="3.6" fill="#e8541e"/><circle cx="76" cy="40" r="3.2" fill="#e8541e"/>
  <path d="M18 36A36 36 0 0 1 40 14" stroke="#fff" stroke-opacity=".55" stroke-width="3" stroke-linecap="round" fill="none"/>
</svg>`;
}
