import {money} from './domain.js';
export const TIERS=[
 {name:'Plebeyo',threshold:0,pct:4,color:'#e3a15c',tag:'La primera junta',img:'plebeyo',mark:'lima',points:0},
 {name:'Comerciante',threshold:50000,pct:6,color:'#5fd16a',tag:'Siempre trae el plan',img:'comerciante',mark:'coins',points:8},
 {name:'Guardia Real',threshold:150000,pct:8,color:'#cfd8e0',tag:'Cuida a su gente',img:'guardia-real',mark:'shield',points:12},
 {name:'Noble',threshold:350000,pct:10,color:'#c08bff',tag:'La mesa tiene estilo',img:'noble',mark:'gem',points:16},
 {name:'Rey',threshold:700000,pct:12,color:'#f8d34c',tag:'La junta lleva su nombre',img:'rey',mark:'crown',points:24}
];
export function rankProgress(spending=0){
 const value=Math.max(0,Number(spending)||0);
 let index=0;for(let i=1;i<TIERS.length;i++)if(value>=TIERS[i].threshold)index=i;
 const tier=TIERS[index],next=TIERS[index+1];
 return {tier,next,index,spending:value,percent:next?Math.min(100,Math.max(0,(value-tier.threshold)/(next.threshold-tier.threshold)*100)):100,remaining:next?Math.max(0,next.threshold-value):0};
}
// Corona de Phosphor (MIT) en línea: este módulo se prueba en Node, donde no se pueden importar los SVG de icons.js.
const CROWN='<svg class="ic" aria-hidden="true" focusable="false" viewBox="0 0 256 256" fill="currentColor"><path d="M248,80a28,28,0,1,0-51.12,15.77l-26.79,33L146,73.4a28,28,0,1,0-36.06,0L85.91,128.74l-26.79-33a28,28,0,1,0-26.6,12L47,194.63A16,16,0,0,0,62.78,208H193.22A16,16,0,0,0,209,194.63l14.47-86.85A28,28,0,0,0,248,80ZM128,40a12,12,0,1,1-12,12A12,12,0,0,1,128,40ZM24,80A12,12,0,1,1,36,92,12,12,0,0,1,24,80ZM220,92a12,12,0,1,1,12-12A12,12,0,0,1,220,92Z"/></svg>';
// Chip "TOP 27" junto al rango (lo calcula la base; vacío si el ranking aún no está disponible).
function topChipHtml(r){
 const p=r?.me?.position;
 if(!p)return '';
 const top=p<=(r.limit||10);
 return `<span class="header-top${top?' is-top':''}" title="Tu puesto en el ranking del Club"><span class="sr-only">Ranking: puesto </span>${top?CROWN:''}TOP ${p}</span>`;
}
// Insignias de rango dibujadas en código: aro con borde blanco (como el logo del Rey), borde dentado que crece con el rango,
// emblema central (Phosphor, MIT) y una marca por nivel alcanzado. Las imágenes anteriores siguen en /assets/rangos/ (RANK_ART='imagen').
export const RANK_ART='imagen'; // 'imagen' = insignias originales del Club (por defecto) · 'vector' = alternativa dibujada en código
const MARK_PATH={"coins":"M184,89.57V84c0-25.08-37.83-44-88-44S8,58.92,8,84v40c0,20.89,26.25,37.49,64,42.46V172c0,25.08,37.83,44,88,44s88-18.92,88-44V132C248,111.3,222.58,94.68,184,89.57ZM56,146.87C36.41,141.4,24,132.39,24,124V109.93c8.16,5.78,19.09,10.44,32,13.57Zm80-23.37c12.91-3.13,23.84-7.79,32-13.57V124c0,8.39-12.41,17.4-32,22.87Zm-16,71.37C100.41,189.4,88,180.39,88,172v-4.17c2.63.1,5.29.17,8,.17,3.88,0,7.67-.13,11.39-.35A121.92,121.92,0,0,0,120,171.41Zm0-44.62A163,163,0,0,1,96,152a163,163,0,0,1-24-1.75V126.46A183.74,183.74,0,0,0,96,128a183.74,183.74,0,0,0,24-1.54Zm64,48a165.45,165.45,0,0,1-48,0V174.4a179.48,179.48,0,0,0,24,1.6,183.74,183.74,0,0,0,24-1.54ZM232,172c0,8.39-12.41,17.4-32,22.87V171.5c12.91-3.13,23.84-7.79,32-13.57Z","shield":"M208,40H48A16,16,0,0,0,32,56v56c0,52.72,25.52,84.67,46.93,102.19,23.06,18.86,46,25.26,47,25.53a8,8,0,0,0,4.2,0c1-.27,23.91-6.67,47-25.53C198.48,196.67,224,164.72,224,112V56A16,16,0,0,0,208,40Zm-34.32,69.66-56,56a8,8,0,0,1-11.32,0l-24-24a8,8,0,0,1,11.32-11.32L112,148.69l50.34-50.35a8,8,0,0,1,11.32,11.32Z","gem":"M240,128a15.85,15.85,0,0,1-4.67,11.28l-96.05,96.06a16,16,0,0,1-22.56,0h0l-96-96.06a16,16,0,0,1,0-22.56l96.05-96.06a16,16,0,0,1,22.56,0l96.05,96.06A15.85,15.85,0,0,1,240,128Z","crown":"M248,80a28,28,0,1,0-51.12,15.77l-26.79,33L146,73.4a28,28,0,1,0-36.06,0L85.91,128.74l-26.79-33a28,28,0,1,0-26.6,12L47,194.63A16,16,0,0,0,62.78,208H193.22A16,16,0,0,0,209,194.63l14.47-86.85A28,28,0,0,0,248,80ZM128,40a12,12,0,1,1-12,12A12,12,0,0,1,128,40ZM24,80A12,12,0,1,1,36,92,12,12,0,0,1,24,80ZM220,92a12,12,0,1,1,12-12A12,12,0,0,1,220,92Z","star":"M234.29,114.85l-45,38.83L203,211.75a16.4,16.4,0,0,1-24.5,17.82L128,198.49,77.47,229.57A16.4,16.4,0,0,1,53,211.75l13.76-58.07-45-38.83A16.46,16.46,0,0,1,31.08,86l59-4.76,22.76-55.08a16.36,16.36,0,0,1,30.27,0l22.75,55.08,59,4.76a16.46,16.46,0,0,1,9.37,28.86Z"};
function burst(n,ro,ri){if(!n)return '';let d='';for(let i=0;i<n*2;i++){const a=Math.PI*i/n-Math.PI/2,rr=i%2?ri:ro;d+=(i?'L':'M')+(60+rr*Math.cos(a)).toFixed(1)+' '+(60+rr*Math.sin(a)).toFixed(1);}return d+'Z';}
function mark(t){
 if(t.mark==='lima')return '<g><circle cx="60" cy="58" r="21" fill="'+t.color+'"/><circle cx="60" cy="58" r="16" fill="#0b0b09"/><g stroke="'+t.color+'" stroke-width="2.4" stroke-linecap="round"><path d="M60 58V44M60 58l10-10M60 58h14M60 58l10 10M60 58v14M60 58 50 68M60 58H46M60 58 50 48"/></g></g>';
 return '<path transform="translate(24 21) scale(.28125)" fill="'+t.color+'" d="'+MARK_PATH[t.mark]+'"/>';
}
export function crestSvg(t,idx){
 const pips=[...Array(idx+1)].map((_,i)=>{const a=(Math.PI/2)+(i-idx/2)*0.34;return '<circle cx="'+(60+37*Math.cos(a)).toFixed(1)+'" cy="'+(60+37*Math.sin(a)).toFixed(1)+'" r="2.3" fill="'+t.color+'"/>';}).join('');
 const edge=t.points?burst(t.points,58,53.5):'';
 return '<svg viewBox="0 0 120 120" aria-hidden="true" focusable="false">'+
  (edge?'<path d="'+edge+'" fill="#fff" stroke="#fff" stroke-width="3" stroke-linejoin="round"/>':'<circle cx="60" cy="60" r="58" fill="#fff"/>')+
  (edge?'<path d="'+burst(t.points,56,52)+'" fill="'+t.color+'"/>':'<circle cx="60" cy="60" r="55" fill="'+t.color+'"/>')+
  '<circle cx="60" cy="60" r="46" fill="#0b0b09"/><circle cx="60" cy="60" r="42.5" fill="none" stroke="'+t.color+'" stroke-opacity=".55" stroke-width="1.4" stroke-dasharray="1.5 4" stroke-linecap="round"/>'+
  mark(t)+pips+'</svg>';
}
export function rankBadge(tier){
 if(RANK_ART==='imagen')return `<img class="rank-badge" src="/assets/rangos/${tier.img}.webp" alt="" width="120" height="120" decoding="async" style="--rank-color:${tier.color}">`;
 const idx=Math.max(0,TIERS.findIndex(x=>x.name===tier.name));
 return `<span class="rank-badge" aria-hidden="true" style="--rank-color:${tier.color}">${crestSvg(tier,idx)}</span>`;
}
export function headerRank(wallet,ranking=null){
 if(!wallet)return '';
 const p=rankProgress(wallet.spending);
 const near=p.next&&p.percent>=80?' near':'';
 const hint=p.next?`Faltan ${money(p.remaining)} para ${p.next.name}`:'¡Eres Rey! Nivel máximo';
 const hintHtml=p.next?`Faltan ${money(p.remaining)}<span class="hr-next"> para ${p.next.name}</span>`:'¡Eres Rey!<span class="hr-next"> Nivel máximo</span>';
 return `<a data-nav href="/rangos" class="header-rank${near}" style="--rank-color:${p.tier.color}" aria-label="Rango ${p.tier.name}, ${p.tier.pct}% de vuelta. ${hint}. Toca para ver todos los rangos.">${rankBadge(p.tier)}<span class="header-rank-info"><span class="header-rank-top"><strong>${p.tier.name}</strong>${topChipHtml(ranking)}<b class="header-rank-pct">${p.tier.pct}%<span class="sr-only"> de vuelta</span></b></span><span class="rank-track" role="progressbar" aria-label="Progreso del rango" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(p.percent)}"><span style="width:${p.percent}%"></span></span><small>${hintHtml}</small></span></a>`;
}
export function ranksPanel(wallet){
 const p=rankProgress(wallet?.spending);
 return `${wallet?`<section class="panel rank-journey" style="--rank-color:${p.tier.color}">${rankBadge(p.tier)}<div><p class="eyebrow">TU LUGAR EN LA JUNTA</p><h2>${p.tier.name}</h2><p>${p.next?`Te faltan <strong>${money(p.remaining)}</strong> de consumo para llegar a <strong>${p.next.name}</strong>.`:'Llegaste a Rey. Disfruta un 12% de vuelta en tus próximas compras.'}</p><div class="rank-track"><span style="width:${p.percent}%"></span></div><small>${money(p.spending)} de consumo en los últimos 12 meses</small></div></section>`:''}
 <div class="rank-grid">${TIERS.map((t,i)=>`<article class="panel rank rank-designed ${wallet&&i===p.index?'current':''}" style="--rank-color:${t.color}"><span class="rank-number">0${i+1}</span>${rankBadge(t)}<span class="pill">${wallet&&i===p.index?'TU RANGO':`NIVEL ${i+1}`}</span><h2>${t.name}</h2><p class="rank-tag">${t.tag}</p><strong>${t.pct}%</strong><p>de vuelta en coronas</p><small>Desde ${money(t.threshold)} de consumo</small></article>`).join('')}</div>`;
}
