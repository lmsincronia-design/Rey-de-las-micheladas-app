// Ranking del Club: podio del Top 10 por consumo de 12 meses (el mismo que define el rango).
// Datos reales: RPC club_ranking (migración 202610130001). Sin sesión o sin datos se puede ver un EJEMPLO con perfiles ficticios.
import {rpc} from './api.js';
import {esc,money} from './domain.js';
import {TIERS,rankBadge,rankProgress} from './ranks.js';
import {icon} from './icons.js';

// Premios del Top 10: se definen en la reunión. Formato: {icon:'🍺',title:'Michelada gratis al mes',text:'…'}.
// Mientras esté vacío la pantalla dice "Pronto anunciaremos los premios".
export const BENEFICIOS_TOP10=[]; // cada premio: {icon:'beer'|'crown'|'party'|'gift'|…,title,text}  (nombres de src/icons.js)

// Ideas SOLO para la vista de ejemplo (a definir con el dueño). Nunca se muestran como beneficio real.
const IDEAS_EJEMPLO=[
 {icon:'beer',title:'Michelada de cortesía cada mes',text:'Para los 10 del Top.'},
 {icon:'crown',title:'Mesa preferente',text:'Reserva prioritaria en tus locales favoritos.'},
 {icon:'party',title:'Cumpleaños del Rey',text:'Tu junta de cumpleaños con beneficio especial.'}
];

// ── Perfiles FICTICIOS para mostrar cómo se vería. No existen en la base de datos. ──
const FICTICIOS=[
 ['Cote M.','Rey'],['Nacho R.','Rey'],['Vale S.','Rey'],['Seba P.','Rey'],['Fran T.','Rey'],
 ['Mati A.','Noble'],['Cami G.','Noble'],['Javi L.','Noble'],['Pipe H.','Noble'],['Anto V.','Noble']
];
export function ejemploRanking(tierName='Guardia Real'){
 return {
  demo:true,total:128,limit:10,visible:false,
  top:FICTICIOS.map(([name,tier],i)=>({position:i+1,name,tier,me:false})),
  me:{position:27,tier:tierName,gap:38500,gap_top:112000}
 };
}

export async function loadRanking(){
 try{return await rpc('club_ranking',{top_n:10});}
 catch(e){return null;} // migración aún no aplicada o sin sesión: la app sigue funcionando sin el chip
}

const tierOf=name=>TIERS.find(t=>t.name===name)||TIERS[0];
const initial=name=>name?esc(name.trim()[0].toUpperCase()):'?';
const who=n=>n??'Socio anónimo';

function podiumSlot(e,place){
 const t=tierOf(e.tier);
 const label=['Primer','Segundo','Tercer'][place-1];
 return `<article class="podium-slot p${place}${e.me?' is-me':''}" style="--rank-color:${t.color}" aria-label="${label} lugar: ${esc(who(e.name))}, ${t.name}">
  <span class="podium-crown" aria-hidden="true">${icon(place===1?'crown':'medal')}</span>
  <span class="podium-avatar" aria-hidden="true">${initial(e.name)}</span>
  <strong class="podium-name">${esc(who(e.name))}${e.me?' <em class="me-tag">TÚ</em>':''}</strong>
  <span class="podium-tier">${rankBadge(t).replace('class="rank-badge"','class="rank-badge small"')}<small>${t.name}</small></span>
  <span class="podium-block" aria-hidden="true"><b>${place}</b></span>
 </article>`;
}
function listRow(e){
 const t=tierOf(e.tier);
 return `<li class="top-row${e.me?' is-me':''}" value="${e.position}" style="--rank-color:${t.color}">
  <span class="top-pos">#${e.position}</span>
  <span class="avatar">${initial(e.name)}</span>
  <span class="top-name">${esc(who(e.name))}${e.me?' <em class="me-tag">TÚ</em>':''}</span>
  <span class="top-tier">${rankBadge(t).replace('class="rank-badge"','class="rank-badge small"')}${t.name}</span>
 </li>`;
}

function myCard(r,{wallet,demo}){
 const me=r.me;
 const tag=demo?'<span class="pill demo-pill">EJEMPLO</span>':'';
 if(!me){
  return `<section class="panel my-spot" aria-labelledby="my-spot-t"><p class="eyebrow">TU POSICIÓN ${tag}</p><h2 id="my-spot-t">Aún no estás en el ranking</h2><p>El ranking cuenta tu consumo de los últimos 12 meses. Con tu primera compra en el Rey y tu código de socio apareces aquí, y desde ahí compites por el Top ${r.limit||10}.</p></section>`;
 }
 const top=me.position<=(r.limit||10);
 const t=tierOf(me.tier);
 return `<section class="panel my-spot${top?' is-top':''}" style="--rank-color:${t.color}" aria-labelledby="my-spot-t">
  <p class="eyebrow">TU POSICIÓN ${tag}</p>
  <div class="my-spot-main">${rankBadge(t)}<div>
   <h2 id="my-spot-t">${top?icon('crown'):''}TOP ${me.position}<small> de ${r.total}</small></h2>
   <p class="my-tier">${t.name} · ${t.pct}% de vuelta</p>
  </div></div>
  ${top?`<p>${me.position===1?'¡Eres el número 1 del Club!':'¡Estás en el Top '+(r.limit||10)+'!'} Sigue sumando para defender tu lugar.</p>`
   :`<ul class="spot-goals"><li>Te faltan <strong>${money(me.gap)}</strong> de consumo para pasar al puesto <strong>${me.position-1}</strong>.</li><li>Te faltan <strong>${money(me.gap_top)}</strong> para entrar al <strong>Top ${r.limit||10}</strong>.</li></ul>`}
 </section>`;
}

function benefitsCard(demo){
 const items=BENEFICIOS_TOP10.length?BENEFICIOS_TOP10:(demo?IDEAS_EJEMPLO:[]);
 const real=BENEFICIOS_TOP10.length>0;
 return `<section class="panel perks" aria-labelledby="perks-t"><p class="eyebrow">PREMIOS DEL TOP ${10}</p><h2 id="perks-t">${items.length?'LO QUE GANA EL TOP':'MUY PRONTO'}</h2>
  ${items.length?`<ul class="perk-list">${items.map(i=>`<li><span aria-hidden="true">${icon(i.icon)}</span><div><strong>${esc(i.title)}</strong><p>${esc(i.text)}</p></div></li>`).join('')}</ul>`
   :'<p>Estamos definiendo los premios para quienes lleguen al Top 10. ¡Ve subiendo desde ya!</p>'}
  ${!real&&items.length?'<p class="hint">Ideas de ejemplo para conversar: los premios reales se definen con El Rey.</p>':''}
 </section>`;
}

// ── Página ──
export async function rankingPage({shell,heading,link,state,run,toast,refreshRanking,go}){
 const loggedIn=Boolean(state.session);
 const asked=new URLSearchParams(location.search).get('demo')==='1';
 let data=loggedIn?(state.ranking??await loadRanking()):null;
 const realEmpty=!data||!data.top?.length;
 const demo=asked||!loggedIn;
 const tierName=state.wallet?rankProgress(state.wallet.spending).tier.name:'Guardia Real';
 const r=demo?ejemploRanking(tierName):data;
 const top=r.top||[];
 const podium=top.slice(0,3),rest=top.slice(3);

 const banner=demo
  ?`<div class="demo-banner" role="note"><strong>VISTA DE EJEMPLO</strong> <span>Estos perfiles son ficticios, para que veas cómo se vería el ranking.</span>${loggedIn?` <button class="btn small secondary" id="rk-real" type="button">Ver el ranking real</button>`:` ${link('/registro','Únete al Club','btn small')}`}</div>`
  :(realEmpty?`<div class="demo-banner" role="note">Todavía nadie ha entrado al ranking. <button class="btn small secondary" id="rk-demo" type="button">Ver cómo se vería</button></div>`
    :`<div class="rank-actions"><button class="btn small secondary" id="rk-demo" type="button">Ver ejemplo con perfiles ficticios</button></div>`);

 const optIn=loggedIn&&!demo?`<label class="check ranking-optin"><input type="checkbox" id="ranking-visible" ${state.profile?.ranking_visible?'checked':''}> Mostrar mi nombre en el ranking</label><p class="hint">Se verá tu nombre y la inicial de tu apellido (igual que ven tus amigos). Si no lo activas, apareces como “Socio anónimo” y solo tú ves tu puesto.</p>`:'';

 const board=(!demo&&realEmpty)?'':`
  <section class="podium" aria-label="Podio de los tres primeros">${podium.map((e,i)=>podiumSlot(e,i+1)).join('')}</section>
  ${rest.length?`<ol class="top-list" start="4" aria-label="Puestos 4 al ${top.length}">${rest.map(listRow).join('')}</ol>`:''}`;

 shell(`${heading('EL CLUB, EN COMPETENCIA','EL TOP 10 DEL REY.','Los socios con más consumo en los últimos 12 meses. Cada compra te acerca a la cima: sube de rango y sube en el ranking.')}
  ${banner}${board}
  ${loggedIn||demo?myCard(r,{wallet:state.wallet,demo}):''}
  ${optIn}
  ${benefitsCard(demo)}
  <p class="hint">El ranking usa el consumo de tus últimos 12 meses (el mismo que define tu rango). Las transferencias de coronas no suman. ${link('/rangos','Ver los rangos →','text-link')}</p>
  <p class="hint">Mayores de 18 años. Consume con responsabilidad.</p>`);

 const q=s=>document.querySelector(s);
 q('#rk-demo')?.addEventListener('click',()=>go('/ranking?demo=1'));
 q('#rk-real')?.addEventListener('click',()=>go('/ranking'));
 const box=q('#ranking-visible');
 if(box)box.onchange=e=>run(e.target,async()=>{
  await rpc('set_ranking_visibility',{enabled:e.target.checked});
  state.profile.ranking_visible=e.target.checked;
  await refreshRanking();
  toast(e.target.checked?'Ahora apareces con tu nombre en el ranking.':'Ahora apareces como Socio anónimo.');
 },()=>{e.target.checked=Boolean(state.profile?.ranking_visible);});
}
