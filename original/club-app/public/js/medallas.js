// Medallas de los cinco rangos: sello metálico, jarro de michelada con limón en el borde y un adorno por rango (SVG propio).
const ANILLOS = {
  plebeyo: ['#e0b184', '#a8723a', '#4a2e14'],
  comerciante: ['#ffc58a', '#e8741e', '#8f3d0a'],
  guardia: ['#e3f0fb', '#7fa6c9', '#33516e'],
  noble: ['#ecd6ff', '#a56fe4', '#4e2a86'],
  rey: ['#fff3b8', '#f7b22a', '#a8650a'],
};
let _med = 0;

// Media rodaja de limón (corteza, médula, pulpa y gajos) para el borde del jarro.
function limonBorde(x, y, r, giro) {
  return `<g transform="translate(${x} ${y}) rotate(${giro})"><path d="M${-r} 0A${r} ${r} 0 0 1 ${r} 0Z" fill="#f2c81f" stroke="#c99600" stroke-width=".8"/><path d="M${-r * 0.78} 0A${r * 0.78} ${r * 0.78} 0 0 1 ${r * 0.78} 0Z" fill="#fff9d6"/><path d="M${-r * 0.68} 0A${r * 0.68} ${r * 0.68} 0 0 1 ${r * 0.68} 0Z" fill="#f9e55a"/><path d="M0 0V${-r * 0.66}M0 0L${-r * 0.46} ${-r * 0.46}M0 0L${r * 0.46} ${-r * 0.46}" stroke="#fff6b8" stroke-width=".9" fill="none"/></g>`;
}

function jarro(i) {
  return `<g>
    <path d="M62 50c9-1 12 3 12 9s-4 11-12 11" fill="none" stroke="#7a4a10" stroke-width="5.6" stroke-linecap="round"/>
    <path d="M62 50c9-1 12 3 12 9s-4 11-12 11" fill="none" stroke="url(#v${i})" stroke-width="3.4" stroke-linecap="round" opacity=".95"/>
    <path d="M33 43h30l-2.4 29.5c-.2 2.2-2 3.8-4.2 3.8H39.6c-2.2 0-4-1.6-4.2-3.8z" fill="url(#c${i})" stroke="#4a2a06" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="M37 47l1.6 24" stroke="#fff" stroke-opacity=".5" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M55.6 48l-.8 20" stroke="#fff" stroke-opacity=".22" stroke-width="2" stroke-linecap="round"/>
    <circle cx="44" cy="62" r="1.2" fill="#fff" opacity=".7"/><circle cx="50" cy="55" r=".9" fill="#fff" opacity=".7"/><circle cx="53" cy="65" r="1.1" fill="#fff" opacity=".6"/><circle cx="47" cy="70" r=".8" fill="#fff" opacity=".6"/>
    <g fill="#fffaf0" stroke="#d9b98a" stroke-width=".7"><circle cx="36" cy="41" r="4.6"/><circle cx="42" cy="38.6" r="5.4"/><circle cx="49" cy="38" r="5.8"/><circle cx="56" cy="39.4" r="5.2"/><circle cx="61" cy="42" r="3.8"/></g>
    <path d="M33.5 43.6h29" stroke="#e8541e" stroke-width="2" stroke-linecap="round" opacity=".85"/>
  </g>`;
}

const ADORNOS = {
  plebeyo: () => '',
  comerciante: (i) => `<g><circle cx="67" cy="72" r="8.2" fill="#8f5a06"/><circle cx="67" cy="72" r="7" fill="url(#o${i})" stroke="#fff1a8" stroke-width=".9"/><circle cx="67" cy="72" r="4.6" fill="none" stroke="#a8650a" stroke-width=".8"/><text x="67" y="75.2" text-anchor="middle" font-size="8.4" font-weight="800" fill="#7a4a06" font-family="Arial,sans-serif">$</text></g>`,
  guardia: () => `<g><g fill="#e3f0fb"><path d="M26 34l1.4 3 3.2.4-2.4 2.2.7 3.1-2.9-1.7-2.9 1.7.7-3.1-2.4-2.2 3.2-.4z"/><path d="M74 34l1.4 3 3.2.4-2.4 2.2.7 3.1-2.9-1.7-2.9 1.7.7-3.1-2.4-2.2 3.2-.4z"/></g><path d="M50 15l9 3v7c0 5.5-4.3 9-9 11.3-4.7-2.3-9-5.8-9-11.3v-7z" fill="#7fa6c9" stroke="#e3f0fb" stroke-width="1.2"/><path d="M50 20v12M45 24.5h10" stroke="#e3f0fb" stroke-width="1.8" stroke-linecap="round"/></g>`,
  noble: (i) => `<g><path d="M40 36l2.4-9 4.2 5.4L50 24.5l3.4 7.9 4.2-5.4L60 36z" fill="url(#o${i})" stroke="#4e2a86" stroke-width="1" stroke-linejoin="round"/><circle cx="50" cy="29" r="1.8" fill="#e8d0ff" stroke="#4e2a86" stroke-width=".6"/><path d="M61 74l4-5h6l4 5-7 8z" fill="#c9a0ff" stroke="#4e2a86" stroke-width="1"/><path d="M61 74h14M65 69l2 13M71 69l-2 13" stroke="#fff" stroke-opacity=".6" stroke-width=".7" fill="none"/></g>`,
  rey: (i) => `<g transform="translate(3.5 0) rotate(-8 50 28)"><path d="M33 40l-3-17 9.5 7.5L50 17l10.5 13.5L70 23l-3 17z" fill="url(#o${i})" stroke="#7a4a06" stroke-width="1.3" stroke-linejoin="round"/><rect x="33" y="39" width="34" height="5" rx="1.6" fill="#f7b22a" stroke="#7a4a06" stroke-width="1.1"/><circle cx="30" cy="22.5" r="2.6" fill="#ff7a3d" stroke="#7a4a06" stroke-width=".8"/><circle cx="50" cy="16.5" r="2.9" fill="#ff4d3d" stroke="#7a4a06" stroke-width=".8"/><circle cx="70" cy="22.5" r="2.6" fill="#ff7a3d" stroke="#7a4a06" stroke-width=".8"/><circle cx="42" cy="41.5" r="1.3" fill="#fff6c8"/><circle cx="50" cy="41.5" r="1.3" fill="#ff4d3d"/><circle cx="58" cy="41.5" r="1.3" fill="#fff6c8"/><path d="M38 38l1.5-9M62 38l-1.5-9" stroke="#fff6c8" stroke-opacity=".6" stroke-width="1"/></g>`,
};

export function medallaSVG(id, tam = 64) {
  const [c1, c2, c3] = ANILLOS[id] || ANILLOS.plebeyo;
  const i = ++_med;
  const dientes = Array.from({ length: 28 }, (_, k) => {
    const a = (k / 28) * Math.PI * 2;
    return `<circle cx="${(50 + 46.3 * Math.cos(a)).toFixed(2)}" cy="${(50 + 46.3 * Math.sin(a)).toFixed(2)}" r="2.4"/>`;
  }).join('');
  const rayos = Array.from({ length: 16 }, (_, k) => {
    const a = (k / 16) * Math.PI * 2;
    return `<path d="M50 52L${(50 + 40 * Math.cos(a - 0.09)).toFixed(1)} ${(52 + 40 * Math.sin(a - 0.09)).toFixed(1)}L${(50 + 40 * Math.cos(a + 0.09)).toFixed(1)} ${(52 + 40 * Math.sin(a + 0.09)).toFixed(1)}Z"/>`;
  }).join('');
  return `<svg class="medalla" width="${tam}" height="${tam}" viewBox="0 0 100 100" role="img" aria-label="Rango ${id}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="a${i}" x1="15%" y1="0%" x2="85%" y2="100%"><stop offset="0" stop-color="${c1}"/><stop offset=".5" stop-color="${c2}"/><stop offset="1" stop-color="${c3}"/></linearGradient>
    <linearGradient id="b${i}" x1="85%" y1="0%" x2="15%" y2="100%"><stop offset="0" stop-color="${c3}"/><stop offset=".55" stop-color="${c2}"/><stop offset="1" stop-color="${c1}"/></linearGradient>
    <radialGradient id="d${i}" cx="50%" cy="42%" r="62%"><stop offset="0" stop-color="#4a3010"/><stop offset=".65" stop-color="#1e1408"/><stop offset="1" stop-color="#0d0905"/></radialGradient>
    <linearGradient id="c${i}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffd978"/><stop offset=".55" stop-color="#f5a623"/><stop offset="1" stop-color="#c9700f"/></linearGradient>
    <linearGradient id="v${i}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe9a8" stop-opacity=".9"/><stop offset="1" stop-color="#f5a623" stop-opacity=".5"/></linearGradient>
    <linearGradient id="o${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>
  </defs>
  <g fill="url(#b${i})">${dientes}</g>
  <circle cx="50" cy="50" r="45" fill="url(#a${i})"/>
  <circle cx="50" cy="50" r="41" fill="url(#b${i})"/>
  <circle cx="50" cy="50" r="38.5" fill="url(#d${i})"/>
  <g fill="${c1}" opacity=".16">${rayos}</g>
  ${jarro(i)}
  ${limonBorde(35.5, 41.5, 8, -38)}
  <path d="M27 79c4 2 8 2.4 12 .6M73 79c-4 2-8 2.4-12 .6" stroke="#8dbb2f" stroke-width="2.6" stroke-linecap="round" fill="none"/>
  <path d="M30 76c2.4-3 5-3.4 7-2.4-1 3-4 4-7 2.4zM70 76c-2.4-3-5-3.4-7-2.4 1 3 4 4 7 2.4z" fill="#9bc53d" stroke="#5a7a16" stroke-width=".6"/>
  ${(ADORNOS[id] || ADORNOS.plebeyo)(i)}
  <path d="M14 30A40 40 0 0 1 40 10" stroke="#fff" stroke-opacity=".38" stroke-width="2.4" stroke-linecap="round" fill="none"/>
</svg>`;
}
