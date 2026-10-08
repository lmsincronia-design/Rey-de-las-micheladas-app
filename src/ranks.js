import {money} from './domain.js';
export const TIERS=[
 {name:'Plebeyo',threshold:0,pct:4,color:'#d2e878',tag:'La primera junta',icon:'spark'},
 {name:'Comerciante',threshold:50000,pct:6,color:'#5ddfc4',tag:'Siempre trae el plan',icon:'coin'},
 {name:'Guardia Real',threshold:150000,pct:8,color:'#76baff',tag:'Cuida a su gente',icon:'shield'},
 {name:'Noble',threshold:350000,pct:10,color:'#c9a0ff',tag:'La mesa tiene estilo',icon:'diamond'},
 {name:'Rey',threshold:700000,pct:12,color:'#f8d34c',tag:'La junta lleva su nombre',icon:'crown'}
];
export function rankProgress(spending=0){
 const value=Math.max(0,Number(spending)||0);
 let index=0;for(let i=1;i<TIERS.length;i++)if(value>=TIERS[i].threshold)index=i;
 const tier=TIERS[index],next=TIERS[index+1];
 return {tier,next,index,spending:value,percent:next?Math.min(100,Math.max(0,(value-tier.threshold)/(next.threshold-tier.threshold)*100)):100,remaining:next?Math.max(0,next.threshold-value):0};
}
export function rankBadge(tier){
 const paths={
 spark:'<path d="m32 15 4 12 13 5-13 5-4 12-4-12-13-5 13-5z"/><path d="m17 17 3 3m24 24 3 3m0-30-3 3M20 44l-3 3"/>',
 coin:'<circle cx="32" cy="32" r="16"/><path d="m32 20 4 8 9 4-9 4-4 8-4-8-9-4 9-4z"/>',
 shield:'<path d="m32 13 17 7v14c0 10-17 18-17 18S15 44 15 34V20z"/><path d="m24 33 8-8 8 8m-16 9 8-8 8 8"/>',
 diamond:'<path d="m14 26 9-12h18l9 12-18 26zM14 26h36M23 14l9 38 9-38M23 14l9 12 9-12"/>',
 crown:'<path d="m13 22 9 9 10-17 10 17 9-9-5 24H18zM19 52h26"/><circle cx="32" cy="36" r="3"/>'
 };
 return `<svg class="rank-badge" viewBox="0 0 64 64" aria-hidden="true" style="--rank-color:${tier.color}"><path class="badge-shell" d="m32 2 26 15v30L32 62 6 47V17z"/><g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${paths[tier.icon]}</g></svg>`;
}
export function headerRank(wallet){
 if(!wallet)return '';
 const p=rankProgress(wallet.spending);
 return `<a data-nav href="/rangos" class="header-rank" style="--rank-color:${p.tier.color}" aria-label="Rango ${p.tier.name}. ${p.next?`Faltan ${money(p.remaining)} de consumo para ${p.next.name}`:'Nivel máximo'}">${rankBadge(p.tier)}<span class="header-rank-info"><strong>${p.tier.name}</strong><span class="rank-track" role="progressbar" aria-label="Progreso del rango" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(p.percent)}"><span style="width:${p.percent}%"></span></span><small>${p.next?`${p.tier.pct}% · próximo ${p.next.name}`:'12% · nivel máximo'}</small></span></a>`;
}
export function ranksPanel(wallet){
 const p=rankProgress(wallet?.spending);
 return `${wallet?`<section class="panel rank-journey" style="--rank-color:${p.tier.color}">${rankBadge(p.tier)}<div><p class="eyebrow">TU LUGAR EN LA JUNTA</p><h2>${p.tier.name}</h2><p>${p.next?`Te faltan <strong>${money(p.remaining)}</strong> de consumo para llegar a <strong>${p.next.name}</strong>.`:'Llegaste a Rey. Disfruta un 12% de vuelta en tus próximas compras.'}</p><div class="rank-track"><span style="width:${p.percent}%"></span></div><small>${money(p.spending)} de consumo en los últimos 12 meses</small></div></section>`:''}
 <div class="rank-grid">${TIERS.map((t,i)=>`<article class="panel rank rank-designed ${wallet&&i===p.index?'current':''}" style="--rank-color:${t.color}"><span class="rank-number">0${i+1}</span>${rankBadge(t)}<span class="pill">${wallet&&i===p.index?'TU RANGO':`NIVEL ${i+1}`}</span><h2>${t.name}</h2><p class="rank-tag">${t.tag}</p><strong>${t.pct}%</strong><p>de vuelta en coronas</p><small>Desde ${money(t.threshold)} de consumo</small></article>`).join('')}</div>`;
}
