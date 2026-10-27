// Lado del socio: escanear el QR que genera el garzón, mostrar el QR de canje y el de cumpleaños.
// Reemplaza a los enlaces para repartir la mesa (tables.js), que ya no se usan.
import {rpc} from './api.js';
import {esc,money} from './domain.js';
import {startQrScanner,tableCodeFrom} from './scan.js';
import {icon} from './icons.js';

const PENDING='rey-mesa-qr';
const PENDING_MINUTES=30;

// Si se abre /mesa?qr=CODIGO sin sesión, se recuerda el código para volver después de entrar o registrarse.
export function rememberTableQr(){
 if(location.pathname!=='/mesa')return;
 const code=tableCodeFrom(new URLSearchParams(location.search).get('qr'));
 if(code)try{localStorage.setItem(PENDING,JSON.stringify({code,at:Date.now()}));}catch{/* modo privado */}
}
export function pendingTableQr(){
 try{const item=JSON.parse(localStorage.getItem(PENDING)||'null');if(item&&Date.now()-item.at<PENDING_MINUTES*60000)return item.code;localStorage.removeItem(PENDING);}catch{/* sin almacenamiento */}
 return null;
}
const forgetTableQr=()=>{try{localStorage.removeItem(PENDING);}catch{/* sin almacenamiento */}};
export function afterLoginPath(){
 const table=pendingTableQr();
 if(table)return `/mesa?qr=${table}`;
 const friend=sessionStorage.getItem('rey-invite');
 return friend?`/amigos?codigo=${encodeURIComponent(friend)}`:'/';
}
const pretty=code=>code.replace(/(.{4})(?=.)/,'$1-');

// Pestaña "Sumar mi compra": botón de cámara y código a mano. Lleva a /mesa?qr=…
export function sumarPanel(){
 return `<section class="panel scan-panel"><p class="eyebrow">DESPUÉS DE PAGAR</p><h2>Escanea el QR de tu mesa</h2>
 <p>El garzón ingresa la cuenta y te muestra un QR. Escanéalo y sumas coronas por <strong>tu parte</strong>, según tu rango.</p>
 <button type="button" class="btn full" data-scan-table>${icon('qr')}<span>Abrir la cámara</span></button><div data-scan-box></div>
 <form class="manual-code" data-table-code><label>¿No funciona la cámara? Escribe el código<input name="code" maxlength="9" placeholder="Ej. K7M2-Q9XD" autocapitalize="characters" autocomplete="off" spellcheck="false" required></label><button class="btn secondary" type="submit">Continuar</button></form>
 <p class="hint">El QR dura 10 minutos y sirve una vez por persona. Máximo 3 cuentas al día.</p></section>`;
}
export function bindSumar({go,toast}){
 const box=document.querySelector('[data-scan-box]');if(!box)return;
 document.querySelector('[data-scan-table]').onclick=()=>startQrScanner(box,text=>{const code=tableCodeFrom(text);if(!code){toast('Ese QR no es de una mesa del Club.',true);return false;}go(`/mesa?qr=${code}`);return true;},{onError:e=>toast(e.message,true)});
 document.querySelector('[data-table-code]').onsubmit=e=>{e.preventDefault();const code=tableCodeFrom(new FormData(e.target).get('code'));if(!code)return toast('Revisa el código: son 8 letras y números.',true);go(`/mesa?qr=${code}`);};
}

// /mesa?qr=CODIGO: el socio ve el monto y su parte, y confirma.
export async function tableQrPage({shell,heading,state,run,toast,refresh,stillCurrent,go}){
 const code=tableCodeFrom(new URLSearchParams(location.search).get('qr'));
 if(!code){shell(`${heading('TU MESA','ESCANEA Y SUMA.')}${sumarPanel()}`);bindSumar({go,toast});return;}
 rememberTableQr();
 let info;
 try{info=await rpc('table_qr_info',{code_value:code});}catch(e){if(!stillCurrent())return;forgetTableQr();shell(`${heading('TU MESA','NO ENCONTRAMOS ESA MESA.',esc(e.message))}${sumarPanel()}`);bindSumar({go,toast});return;}
 if(!stillCurrent())return;
 const view=(result)=>{
  const closed=info.cancelled||info.expired||(!info.remaining&&!info.claimed);
  const done=result||(info.claimed?{earned:info.earned,available_at:info.available_at,already_claimed:true}:null);
  shell(`${heading('LA JUNTA TAMBIÉN ES TUYA','TU PARTE, TUS CORONAS.')}
  <section class="ticket table-ticket"><span class="pill">${esc(info.location_name)}${info.table_label?' · '+esc(info.table_label):''}</span>
   <h2>${money(info.part)}</h2><p>es tu parte: ${money(info.amount)} entre ${info.people} persona${info.people===1?'':'s'}.</p>
   <div class="code">${pretty(info.code)}</div>
   ${done?`<p><strong>${done.already_claimed?`Ya sumaste esta mesa: ${money(done.earned)} en coronas.`:`¡Listo! Sumaste ${money(done.earned)} en coronas.`}</strong><br>Se activan el ${new Date(done.available_at).toLocaleString('es-CL',{dateStyle:'medium',timeStyle:'short'})}.</p>${done.pct?`<p>Tu rango ${esc(done.tier)} te da ${done.pct}% de tu parte.</p>`:''}<a data-nav href="/coronas" class="btn full">Ver mis coronas</a>`
   :info.cancelled?'<p><strong>El local anuló esta cuenta.</strong></p>'
   :closed?`<p><strong>${info.expired?'Este QR venció.':'Todas las partes ya se sumaron.'}</strong> ${info.expired?'Pide al garzón que lo renueve.':''}</p>`
   :!state.session?`<p>Entra o crea tu cuenta para sumar. Tienes ${PENDING_MINUTES} minutos: te traemos de vuelta a esta mesa.</p><div class="actions">${'<a data-nav href="/registro" class="btn">Crear mi cuenta</a><a data-nav href="/entrar" class="btn secondary">Ya tengo cuenta</a>'}</div>`
   :`<p>Quedan ${info.remaining} de ${info.people} partes. Recibes el ${state.wallet?.pct||4}% de tu parte por ser ${esc(state.wallet?.tier||'Plebeyo')}.</p><button class="btn full" id="claim-table">Sumar mis coronas</button>`}
  </section>
  <p class="hint">Las coronas quedan por activar durante 24 horas. Cada persona suma una sola vez por mesa.</p>`);
  document.querySelector('#claim-table')?.addEventListener('click',e=>run(e.currentTarget,async()=>{
   const r=await rpc('claim_table_qr',{code_value:code});forgetTableQr();
   info=await rpc('table_qr_info',{code_value:code});await refresh();if(!stillCurrent())return;
   view(r);toast(r.already_claimed?'Ya habías sumado esta mesa.':`Sumaste ${money(r.earned)} en coronas.`);
  }));
 };
 if(info.claimed||info.cancelled)forgetTableQr();
 view(null);
}

// QR del socio que se renueva cada 30 segundos (canje o cumpleaños). El garzón lo escanea.
function rotatingQr(box,{qrSvg,fetchCode,label,onUsed,onError}){
 let current=null,offset=0,tick=null,poll=null,alive=true;
 const stop=()=>{alive=false;clearInterval(tick);clearInterval(poll);};
 const draw=()=>{
  if(!box.isConnected){stop();return;}
  const left=Math.max(0,Math.ceil((new Date(current.expires_at)-(Date.now()+offset))/1000));
  const bar=box.querySelector('.qr-timer span');if(bar)bar.style.width=`${left/30*100}%`;
  const text=box.querySelector('.qr-left');if(text)text.textContent=`Se renueva en ${left} s`;
  if(left<=2)renew();
 };
 const renew=async()=>{
  if(!alive||renew.busy)return;renew.busy=true;
  try{current=await fetchCode();offset=new Date(current.now)-Date.now();
   box.innerHTML=`<div class="member-qr"><p class="eyebrow">${label}</p><div class="qr">${qrSvg(current.code)}</div><div class="code">${current.code.replace(/^(.)(.{3})(.{3})(.{3})$/,'$1 $2 $3 $4')}</div><div class="qr-timer" aria-hidden="true"><span></span></div><small class="qr-left" aria-live="off"></small><button type="button" class="btn secondary full" data-qr-close>Cerrar</button></div>`;
   box.querySelector('[data-qr-close]').onclick=()=>{stop();box.innerHTML='';};
   draw();
  }catch(e){stop();box.innerHTML='';onError(e);}finally{renew.busy=false;}
 };
 renew().then(()=>{tick=setInterval(draw,500);poll=setInterval(async()=>{if(!alive||!current||!box.isConnected){stop();return;}try{const s=await rpc('member_qr_status',{code_value:current.code});if(s.used){stop();onUsed(s);}}catch{/* reintenta */}},2000);});
 return stop;
}

// Pestaña "Usar mis coronas": elige el monto y muestra el QR al garzón. Sin reserva: se descuenta al escanear.
export function usarPanel(wallet){
 const max=Math.min(20000,Math.floor(Number(wallet?.balance||0)/500)*500);
 return `<section class="panel redeem-panel"><p class="eyebrow">ANTES DE PEDIR LA CUENTA</p><h2>Usa tus coronas</h2>
 ${max>=1000?`<form id="redeem-qr-form"><label>¿Cuánto quieres descontar?<input name="amount" type="number" inputmode="numeric" min="1000" max="${max}" step="500" value="${Math.min(max,5000)}" required></label>
 <div class="amount-chips">${[1000,3000,5000,10000,20000].filter(a=>a<=max).map(a=>`<button type="button" class="chip-btn" data-amount="${a}">${money(a)}</button>`).join('')}</div>
 <button class="btn full" type="submit">${icon('qr')}<span>Mostrar mi QR al garzón</span></button></form><div data-redeem-box></div>
 <p class="hint">De $1.000 a $20.000, en tramos de $500. Un canje al día, en cualquier local. Las coronas se descuentan solo cuando el garzón escanea tu QR.</p>`
 :`<p>Necesitas al menos ${money(1000)} en coronas disponibles para canjear. Tienes ${money(wallet?.balance)}.</p>`}</section>`;
}
export function bindUsar({qrSvg,toast,refresh}){
 const form=document.querySelector('#redeem-qr-form');if(!form)return;
 form.querySelectorAll('[data-amount]').forEach(b=>b.onclick=()=>{form.elements.amount.value=b.dataset.amount;});
 form.onsubmit=e=>{e.preventDefault();
  const amount=Number(form.elements.amount.value);
  if(!Number.isInteger(amount)||amount<1000||amount>20000||amount%500)return toast('Elige un monto entre $1.000 y $20.000, en tramos de $500.',true);
  const box=document.querySelector('[data-redeem-box]');form.hidden=true;
  rotatingQr(box,{qrSvg,label:`DESCUENTO DE ${money(amount)}`,fetchCode:()=>rpc('redeem_qr',{amount_value:amount}),
   onUsed:async s=>{box.innerHTML=`<div class="member-qr done"><h3>¡Descuento aprobado!</h3><p><strong>${money(s.amount)}</strong> en ${esc(s.location_name||'el local')}. El garzón lo informa a caja antes de la boleta.</p></div>`;toast('Descuento aprobado.');await refresh();},
   onError:err=>{form.hidden=false;toast(err.message,true);}});
 };
}

// Cumpleaños: una michelada de regalo al año, el día del cumpleaños. El garzón revisa la cédula.
export async function loadBirthday(){try{return await rpc('my_birthday');}catch{return null;}}
export function birthdayCard(b){
 if(!b?.today)return '';
 return `<section class="birthday-card"><img src="/assets/marca/jarro.svg" alt="" width="64" height="64"><div><p class="eyebrow">HOY ES TU DÍA</p><h2>¡Feliz cumpleaños!</h2>
 ${b.claimed?'<p>Ya recibiste tu michelada de regalo este año. ¡Salud!</p>':`<p>Tu michelada de regalo te espera (también sin alcohol). Muestra tu QR y tu cédula al garzón.</p><button type="button" class="btn" data-birthday>Mostrar mi QR de cumpleaños</button><div data-birthday-box></div>`}</div></section>`;
}
export function bindBirthday({qrSvg,toast,refresh}){
 const button=document.querySelector('[data-birthday]');if(!button)return;
 button.onclick=()=>{const box=document.querySelector('[data-birthday-box]');button.hidden=true;
  rotatingQr(box,{qrSvg,label:'REGALO DE CUMPLEAÑOS',fetchCode:()=>rpc('birthday_qr'),
   onUsed:async()=>{box.innerHTML='<div class="member-qr done"><h3>¡Salud!</h3><p>Tu michelada de cumpleaños ya está pedida.</p></div>';await refresh();},
   onError:e=>{button.hidden=false;toast(e.message,true);}});
 };
}
