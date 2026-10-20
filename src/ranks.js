import {money} from './domain.js';
export const TIERS=[
 {name:'Plebeyo',threshold:0,pct:4,color:'#e3a15c',tag:'La primera junta',img:'plebeyo'},
 {name:'Comerciante',threshold:50000,pct:6,color:'#5fd16a',tag:'Siempre trae el plan',img:'comerciante'},
 {name:'Guardia Real',threshold:150000,pct:8,color:'#cfd8e0',tag:'Cuida a su gente',img:'guardia-real'},
 {name:'Noble',threshold:350000,pct:10,color:'#c08bff',tag:'La mesa tiene estilo',img:'noble'},
 {name:'Rey',threshold:700000,pct:12,color:'#f8d34c',tag:'La junta lleva su nombre',img:'rey'}
];
export function rankProgress(spending=0){
 const value=Math.max(0,Number(spending)||0);
 let index=0;for(let i=1;i<TIERS.length;i++)if(value>=TIERS[i].threshold)index=i;
 const tier=TIERS[index],next=TIERS[index+1];
 return {tier,next,index,spending:value,percent:next?Math.min(100,Math.max(0,(value-tier.threshold)/(next.threshold-tier.threshold)*100)):100,remaining:next?Math.max(0,next.threshold-value):0};
}
// Corona de Lucide (ISC) en línea: este módulo se prueba en Node, donde no se pueden importar los SVG de icons.js.
const CROWN='<svg class="ic" aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d=\"M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z\" /><path d=\"M5 21h14\" /></svg>';
// Chip "TOP 27" junto al rango (lo calcula la base; vacío si el ranking aún no está disponible).
function topChipHtml(r){
 const p=r?.me?.position;
 if(!p)return '';
 const top=p<=(r.limit||10);
 return `<span class="header-top${top?' is-top':''}" title="Tu puesto en el ranking del Club"><span class="sr-only">Ranking: puesto </span>${top?CROWN:''}TOP ${p}</span>`;
}
export function rankBadge(tier){
 return `<img class="rank-badge" src="/assets/rangos/${tier.img}.webp" alt="" width="120" height="120" decoding="async" style="--rank-color:${tier.color}">`;
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
