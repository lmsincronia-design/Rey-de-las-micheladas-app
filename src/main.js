import './styles.css';
import {testPilotPage,testMenu} from './test-pilot.js';
import qr from 'qrcode-generator';
import {adminCreditsPanel,bindAdminCredits} from './admin-credits.js';
import { supabase, configured, rpc, rows, profile, authAction } from './api.js';
import { esc, money, normalizeRut, normalizePhone, validateRegistration, safeMenuUrl, distanceKm } from './domain.js';

const app=document.querySelector('#app');
const state={session:null,profile:null,wallet:null,staff:null,locations:[],friends:[],notifications:[],loaded:false};
let authVersion=0;
let pageVersion=0,channel=null,poll=null,seenNotifications=new Set(),refreshing=false;
const menuSource='https://qrfy.io/p/oOBx-dlqTy';
const tiers=[['Plebeyo',0,4],['Comerciante',50000,6],['Guardia Real',150000,8],['Noble',350000,10],['Rey',700000,12]];
const route=()=>location.pathname;
const link=(href,label,cls='')=>`<a data-nav href="${href}" class="${cls}">${label}</a>`;
const empty=(title,body)=>`<div class="empty"><span>✦</span><h3>${title}</h3><p>${body}</p></div>`;
function toast(message,error=false){const el=document.querySelector('#toast');el.textContent=message;el.className=`visible ${error?'error':''}`;clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.className='',6500);}
function fail(e){ console.error(e?.code||'',e?.message||e);toast(friendly(e),true); }
function friendly(e){
 const text=String(e?.message||'No pudimos completar la acción. Inténtalo nuevamente.');
 if(/Invalid login credentials/i.test(text)) return 'El correo o la contraseña no coinciden.';
 if(/Email not confirmed/i.test(text)) return 'Confirma tu correo antes de entrar.';
 if(/Database error saving new user/i.test(text)) return 'No pudimos registrar tus datos. Revisa el RUT, la edad y si ya tienes una cuenta.';
 if(/Failed to fetch|fetch failed/i.test(text)) return 'No hay conexión. Revisa tu internet e inténtalo otra vez.';
 return text;
}
function go(path){history.pushState({},'',path);render();}
function date(value){return new Date(value).toLocaleString('es-CL',{dateStyle:'medium',timeStyle:'short'});}
function qrSvg(value){const code=qr(0,'M');code.addData(value);code.make();return code.createSvgTag({cellSize:5,margin:2,scalable:true});}
function shell(content){
 const unread=state.notifications.filter(n=>!n.read_at).length;
 const tabs=[['/','Inicio','⌂'],['/locales','La carta','▤'],['/amigos','Amigos','♡'],['/coronas','Coronas','♛']];
 app.innerHTML=`<header class="topbar"><div class="wrap top-inner">${link('/','<img src="/assets/logo-rey.jpg" alt="El Rey de las Micheladas"><span>CLUB<span>DEL REY</span></span>','brand')}<div class="top-actions">${state.session?`${link('/notificaciones',`<span aria-hidden="true">♧</span><span class="sr-only">Notificaciones</span>${unread?`<b class="badge">${unread}</b>`:''}`,'bell')}${link('/perfil',esc(state.profile?.first_name?.slice(0,1)||'👤'),'avatar')}`:link('/entrar','Iniciar sesión','btn small secondary')}</div></div></header><main class="wrap">${!configured?'<div class="connection-note">La web está preparada. Las cuentas y coronas se habilitarán al conectar Supabase.</div>':''}${content}</main><nav class="bottom-nav" aria-label="Navegación principal">${tabs.map(([href,label,icon])=>link(href,`<span aria-hidden="true">${icon}</span>${label}`,route()===href?'active':'')).join('')}</nav><footer class="wrap footer"><span>Una buena junta empieza aquí. 🍺</span>${link('/terminos','Términos y privacidad')}</footer>`;
}
const heading=(eyebrow,title,description='')=>`<div class="page-heading"><p class="eyebrow">${eyebrow}</p><h1>${title}</h1>${description?`<p class="muted">${description}</p>`:''}</div>`;
function authRequired(){if(state.session)return false;shell(`${heading('TU CLUB','Todo empieza con tu cuenta','Únete para hacer amigos, juntar coronas y compartir la buena junta.')}<div class="actions">${link('/registro','Crear mi cuenta','btn')}${link('/entrar','Ya soy del Club','btn secondary')}</div>`);return true;}
function home(){
 const p=state.profile,w=state.wallet;
 shell(`<section class="hero"><div class="hero-copy"><p class="eyebrow">EL REY DE LAS MICHELADAS</p><h1>LA BUENA<br>JUNTA TIENE<br><em>SU CLUB.</em></h1><p>Tu gente. Tu michelada.<br>Y coronas para la próxima ronda.</p><div class="actions">${link('/locales','Ver la carta ↗','btn')}${link(state.session?'/amigos':'/registro',state.session?'Invitar a mi gente':'Unirme al Club','btn secondary')}</div><div class="hero-caption"><span>♛ 1 corona = $1</span><span>♡ Comparte con amigos</span></div></div><div class="hero-photo"><img src="/assets/foto-clasica.jpg" alt="Michelada con limón y borde condimentado"><div class="photo-label">EL PLAN ES<br><strong>JUNTARNOS.</strong> 🍺</div></div></section>
 ${p?`<section class="member-card"><div><span class="eyebrow">HOLA, ${esc(p.first_name.toUpperCase())}</span><h2>Tu próxima ronda<br>empieza con ${money(w?.balance)}.</h2><p>${esc(w?.tier||'Plebeyo')} · ${w?.pct||4}% de vuelta por tus compras</p></div><div class="member-side"><span class="crown">♛</span>${link('/coronas','Ver mis coronas →','text-link')}${link('/codigo','Mi código de socio','text-link')}</div></section>`:`<section class="join-banner"><div><p class="eyebrow">MÁS QUE UN DESCUENTO</p><h2>Vuelve por la junta.<br>Quédate por las coronas.</h2></div>${link('/registro','Hacerme socio →','btn')}</section>`}
 <section class="section"><div class="section-title"><h2>¿EN QUÉ REY NOS VEMOS?</h2>${link('/locales','Elegir local →','text-link')}</div><p class="muted">Elige dónde será la junta y abre la carta de ese local.</p>${locationCards(state.locations.slice(0,5))}</section>
 <section class="steps"><article><span>01</span><h3>Encuentra tu Rey</h3><p>Abre la carta del local que tú elijas.</p></article><article><span>02</span><h3>Junta a tu gente</h3><p>Añade amigos por código o QR y avísales del plan.</p></article><article><span>03</span><h3>Comparte coronas</h3><p>Cada corona vale un peso. Envía a tus amigos y canjea tu descuento.</p></article></section>`);
 bindMenus();
}
function locationCards(items){
 if(!items.length)return `<div class="source-card"><span class="pill">CARTA DEL REY</span><h3>Elige tu local en la carta oficial</h3><p>Estamos preparando el catálogo de locales y sus cartas individuales. Mientras tanto puedes consultar el enlace que nos compartiste.</p><a href="${menuSource}" target="_blank" rel="noopener noreferrer" class="btn secondary">Abrir carta oficial ↗</a></div>`;
 return `<div class="location-grid">${items.map(l=>`<article class="location-card"><div class="location-top">🍺<span class="pill">${esc(l.commune)}</span></div><h3>${esc(l.name)}</h3><p>${esc(l.address)}</p><button class="btn secondary" data-menu="${l.id}">Abrir carta ↗</button></article>`).join('')}</div>`;
}
function bindMenus(){document.querySelectorAll('[data-menu]').forEach(b=>b.addEventListener('click',async()=>{
 const local=state.locations.find(x=>x.id===b.dataset.menu),url=safeMenuUrl(local?.menu_url);if(!url)return toast('La carta no tiene un enlace válido.',true);
 const tab=window.open(url,'_blank','noopener,noreferrer'); // Must run directly on the user gesture.
 void tab;
 if(state.session && state.profile?.share_activity){try {if(await rpc('announce_location',{location_value:local.id}))toast('Tus amigos recibieron el aviso de la junta 🍺');}catch(e){toast('La carta se abrió, pero no pudimos avisar a tus amigos.',true);}}
}));}
function locations(){
 const communes=[...new Set(state.locations.map(l=>l.commune))].sort();
 shell(`${heading('EL PLAN EMPIEZA AQUÍ','ELIGE TU REY.','Selecciona una ubicación y abre su carta. No compartimos tu ubicación GPS.')}<div class="filters"><label>Comuna<select id="commune" aria-label="Comuna"><option value="">Todos los locales</option>${communes.map(c=>`<option>${esc(c)}</option>`).join('')}</select></label><button class="btn secondary" id="nearby">Cerca de mí</button></div><div id="locations-grid">${locationCards(state.locations)}</div>${state.session?`<label class="check sharing"><input type="checkbox" id="share" ${state.profile?.share_activity?'checked':''}> Avisar a mis amigos cuando abra una carta 🍺</label><p class="hint">El aviso dice que estás mirando la carta; no confirma que ya estés en el local. Tus amigos pueden silenciarlo.</p>`:`<p class="hint">${link('/entrar','Inicia sesión')} para avisar a tus amigos cuando abras una carta.</p>`}`);
 bindMenus();
 document.querySelector('#commune').onchange=e=>{document.querySelector('#locations-grid').innerHTML=locationCards(state.locations.filter(l=>!e.target.value||l.commune===e.target.value));bindMenus();};
 document.querySelector('#nearby').onclick=()=>{
 if(!navigator.geolocation)return toast('Tu navegador no permite consultar la ubicación.',true);
 if(!state.locations.some(l=>l.latitude!=null&&l.longitude!=null))return toast('Aún no hay coordenadas verificadas para ordenar los locales.');
 navigator.geolocation.getCurrentPosition(position=>{
 const coords=position.coords;
 const sorted=[...state.locations].sort((a,b)=>distanceKm(coords,a)-distanceKm(coords,b));
 document.querySelector('#commune').value='';document.querySelector('#locations-grid').innerHTML=locationCards(sorted);bindMenus();toast('Locales ordenados por cercanía. Tu ubicación no se guardó.');
 },()=>toast('No pudimos obtener tu ubicación. Puedes elegir la comuna.',true),{timeout:10000});
 };
 document.querySelector('#share')?.addEventListener('change',e=>run(e.target,async()=>{await rpc('set_activity_sharing',{enabled:e.target.checked});state.profile.share_activity=e.target.checked;toast(e.target.checked?'Avisos a amigos activados.':'Avisos a amigos desactivados.');},()=>{e.target.checked=state.profile.share_activity;}));
}
const input=(name,label,type='text',attrs='')=>`<label>${label}<input name="${name}" type="${type}" required ${attrs}></label>`;
function authPage(mode){
 const reset=mode==='reset',register=mode==='register',recover=mode==='recover';
 const title=register?'HAZTE DEL CLUB.':reset?'VOLVAMOS A ENTRAR.':recover?'TU NUEVA CONTRASEÑA.':'BIENVENIDO DE VUELTA.';
 shell(`<section class="auth-layout"><div>${heading('CLUB DEL REY',title,register?'Tu cuenta, tus amigos y tus coronas.':'La próxima junta te espera.')}<img class="auth-photo" src="/assets/foto-variedad.jpg" alt="Una selección de micheladas"></div><form id="auth-form" class="panel"><h2>${register?'Crear cuenta':reset?'Recuperar contraseña':recover?'Cambiar contraseña':'Iniciar sesión'}</h2><p id="form-message" role="status"></p>${register?`<div class="form-grid">${input('first_name','Nombre','text','autocomplete="given-name" maxlength="60"')}${input('last_name','Apellido','text','autocomplete="family-name" maxlength="80"')}</div>${input('rut','RUT','text','placeholder="12.345.678-5" maxlength="12"')}${input('phone','Celular','tel','autocomplete="tel" placeholder="+56 9 1234 5678"')}${input('birthday','Fecha de nacimiento','date','autocomplete="bday"')}`:''}${!recover?input('email','Correo electrónico','email','autocomplete="email" maxlength="254"'):''}${!reset?input('password',register||recover?'Contraseña (mínimo 10 caracteres)':'Contraseña','password',`autocomplete="${register||recover?'new-password':'current-password'}" minlength="${register||recover?10:1}"`):''}${register||recover?input('confirmation','Repite tu contraseña','password','autocomplete="new-password" minlength="10"'):''}${register?`<label class="check"><input name="terms" type="checkbox" required> Soy mayor de 18 años y acepto los <a href="/terminos" target="_blank" rel="noopener noreferrer">términos y privacidad</a>.</label><label class="check"><input name="share_activity" type="checkbox"> Avisar a mis amigos cuando abra una carta 🍺 (puedo cambiarlo después).</label>`:''}<button class="btn full" type="submit" ${!configured?'disabled':''}>${register?'Crear mi cuenta':reset?'Enviar enlace':recover?'Guardar contraseña':'Entrar al Club'} →</button>${!register&&!reset&&!recover?link('/olvide-contrasena','Olvidé mi contraseña','text-link'):''}<p class="hint">${register?link('/entrar','Ya tengo cuenta. Iniciar sesión'):link('/registro','¿Primera junta? Crea tu cuenta')}</p></form></section>`);
 const form=document.querySelector('#auth-form');
 form.onsubmit=e=>{e.preventDefault();run(form.querySelector('button'),async()=>{
 const d=Object.fromEntries(new FormData(form));
 const msg=document.querySelector('#form-message');
 if(register){
 d.terms=form.elements.terms.checked;d.share_activity=form.elements.share_activity.checked;validateRegistration(d);
 if(d.password!==d.confirmation)throw new Error('Las contraseñas no coinciden.');
 const data=await authAction('signUp',{email:d.email.trim(),password:d.password,options:{emailRedirectTo:`${location.origin}/entrar`,data:{first_name:d.first_name.trim(),last_name:d.last_name.trim(),rut:normalizeRut(d.rut),phone:normalizePhone(d.phone),birthday:d.birthday,terms:true,share_activity:d.share_activity}}});
 if(data.session){await loadUser(data.session);const pendingInvite=sessionStorage.getItem('rey-invite');go(pendingInvite?`/amigos?codigo=${encodeURIComponent(pendingInvite)}`:'/');}else{msg.textContent='Revisa tu correo para confirmar la cuenta. Si ya tenías cuenta, puedes iniciar sesión o recuperar tu contraseña.';form.reset();toast('Revisa tu correo para continuar.');}
 }else if(reset){await authAction('resetPasswordForEmail',d.email.trim(),{redirectTo:`${location.origin}/recuperar`});msg.textContent='Si existe una cuenta con ese correo, recibirás un enlace para cambiar la contraseña.';}
 else if(recover){if(!state.session)throw new Error('Abre el enlace de recuperación que llegó a tu correo.');if(d.password!==d.confirmation)throw new Error('Las contraseñas no coinciden.');await authAction('updateUser',{password:d.password});toast('Contraseña actualizada.');go('/');}
 else{const data=await authAction('signInWithPassword',{email:d.email.trim(),password:d.password});await loadUser(data.session);const invite=sessionStorage.getItem('rey-invite');go(invite?`/amigos?codigo=${encodeURIComponent(invite)}`:'/');}
 });};
}
async function friends(){
 if(authRequired())return;
 const invitation=`${location.origin}/amigos?codigo=${encodeURIComponent(state.profile.member_code)}`;
 shell(`${heading('LA JUNTA ES MEJOR CON AMIGOS','TU GENTE, EN EL CLUB.','Añádanse por código o QR. Ambos deben aceptar la amistad antes de enviar coronas.')}<div class="friends-layout"><section class="panel"><span class="eyebrow">TU INVITACIÓN</span><h2>Que se sume tu gente.</h2><div class="qr">${qrSvg(invitation)}</div><div class="code">${esc(state.profile.member_code)}</div><div class="actions"><button id="copy" class="btn secondary">Copiar enlace</button><button id="share-invite" class="btn">Compartir</button></div><p class="hint">Este código permite solicitar amistad; no permite gastar tus coronas.</p></section><section class="panel"><h2>Añadir un amigo</h2><form id="friend-form">${input('code','Código de tu amigo','text','maxlength="12" placeholder="Código de 12 caracteres"')}<button class="btn" type="submit">Enviar solicitud →</button><button class="btn secondary" type="button" id="scan">Escanear QR</button></form><div id="scanner"></div><div class="section-title"><h3>Mis amigos (${state.friends.filter(f=>f.status==='accepted').length})</h3></div>${state.friends.length?state.friends.map(f=>`<article class="friend"><span class="avatar">${esc(f.first_name[0])}</span><div class="friend-info"><strong>${esc(f.first_name)} ${esc(f.last_name)}</strong><small>${f.status==='accepted'?(f.muted?'Avisos de actividad silenciados':'Amigos del Club'):f.incoming?'Quiere ser tu amigo':'Solicitud enviada'}</small></div><div class="friend-actions">${f.status==='pending'&&f.incoming?`<button class="btn small" data-accept="${f.id}">Aceptar</button><button class="icon-btn" data-remove="${f.id}" aria-label="Rechazar solicitud de ${esc(f.first_name)}">✕</button>`:f.status==='accepted'?`${link(`/coronas?para=${f.other_id}`,'Enviar','btn small')}<button class="icon-btn" data-mute="${f.id}" title="${f.muted?'Activar avisos':'Silenciar actividad'}" aria-label="${f.muted?'Activar avisos de':'Silenciar a'} ${esc(f.first_name)}">${f.muted?'🔕':'🔔'}</button><button class="icon-btn" data-remove="${f.id}" aria-label="Eliminar amistad con ${esc(f.first_name)}">✕</button>`:`<button class="icon-btn" data-remove="${f.id}" aria-label="Cancelar solicitud a ${esc(f.first_name)}">✕</button>`}</div></article>`).join(''):empty('Aquí empieza la junta','Comparte tu código o añade a tu primer amigo.')}</section></div>`);
 const invite=new URLSearchParams(location.search).get('codigo');
 if(invite&&/^[A-Za-z0-9]{12}$/.test(invite)){document.querySelector('[name="code"]').value=invite;sessionStorage.removeItem('rey-invite');}
 document.querySelector('#friend-form').onsubmit=e=>{e.preventDefault();run(e.submitter,async()=>{await rpc('request_friend',{code_value:new FormData(e.target).get('code')});toast('Solicitud enviada. Tu amigo debe aceptarla.');await refreshData();render();});};
 document.querySelector('#copy').onclick=()=>run(document.querySelector('#copy'),async()=>{await navigator.clipboard.writeText(invitation);toast('Enlace copiado.');});
 document.querySelector('#share-invite').onclick=()=>run(document.querySelector('#share-invite'),async()=>{if(navigator.share)await navigator.share({title:'Únete a mi junta en Club del Rey',url:invitation});else{await navigator.clipboard.writeText(invitation);toast('Enlace copiado para compartir.');}});
 document.querySelectorAll('[data-accept]').forEach(b=>b.onclick=()=>run(b,async()=>{await rpc('respond_friend',{friendship_id:b.dataset.accept,accept_value:true});await refreshData();render();toast('¡Ya son amigos!');}));
 document.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>run(b,async()=>{if(!confirm('¿Quieres eliminar esta amistad o solicitud?'))return;await rpc('remove_friend',{friendship_id:b.dataset.remove});await refreshData();render();}));
 document.querySelectorAll('[data-mute]').forEach(b=>b.onclick=()=>run(b,async()=>{const f=state.friends.find(f=>f.id===b.dataset.mute);await rpc('mute_friend',{friendship_id:f.id,muted_value:!f.muted});await refreshData();render();toast(f.muted?'Avisos activados.':'Amigo silenciado. Puedes seguir enviándole coronas.');}));
 document.querySelector('#scan').onclick=startScanner;
}
async function startScanner(){
 const container=document.querySelector('#scanner');
 if(!('BarcodeDetector' in window))return toast('Este navegador no lee QR con cámara. Abre el QR con la cámara del teléfono o escribe el código.');
 let stream;try{
 stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});
 if(!container.isConnected){stream.getTracks().forEach(t=>t.stop());return;}
 container.innerHTML='<video autoplay playsinline muted></video><button class="btn secondary" id="stop-scan">Cerrar cámara</button>';
 const video=container.querySelector('video');video.srcObject=stream;
 const detector=new window.BarcodeDetector({formats:['qr_code']});
 let timer;const stop=()=>{clearInterval(timer);stream.getTracks().forEach(t=>t.stop());container.innerHTML='';};
 document.querySelector('#stop-scan').onclick=stop;
 timer=setInterval(async()=>{if(!container.isConnected){stop();return;}try{const results=await detector.detect(video);for(const result of results){let code=result.rawValue;try{const url=new URL(code);if(url.origin!==location.origin)continue;code=url.searchParams.get('codigo');}catch{/* raw member code */}if(/^[A-Za-z0-9]{12}$/.test(code)){document.querySelector('[name="code"]').value=code;stop();toast('Código leído. Envía la solicitud para añadir al amigo.');break;}}}catch{/* next frame */}},400);
 }catch(e){stream?.getTracks().forEach(t=>t.stop());toast('No pudimos abrir la cámara. Usa el código del amigo.',true);}
}
async function wallet(){
 if(authRequired())return;
 const w=state.wallet||{},accepted=state.friends.filter(f=>f.status==='accepted');
 const currentPage=pageVersion;
 const movements=await rows('ledger',q=>q.order('created_at',{ascending:false}).limit(30));
 const redemptions=await rows('redemptions',q=>q.eq('status','reserved').order('created_at',{ascending:false}));
 if(currentPage!==pageVersion)return;
 shell(`${heading('TUS CORONITAS','COMPARTE LA PRÓXIMA RONDA.','1 corona = $1 de descuento. Solo puedes enviar coronas disponibles. Una cuenta nueva empieza en cero: puedes ganarlas con compras o recibirlas de un amigo.')}<section class="balance-card"><div><span class="eyebrow">DISPONIBLES</span><h2>♛ ${money(w.balance)}</h2><p>${money(w.pending)} por activar · ${esc(w.tier)} · ${w.pct}% de vuelta</p>${w.debt?`<p class="hint">Ajuste por boletas anuladas: ${money(w.debt)}. Las próximas coronas cubrirán este ajuste.</p>`:''}</div>${link('/rangos','Ver mis rangos →','text-link')}</section><div class="two-col"><section class="panel"><h2>Coronas para un amigo</h2>${accepted.length?`<form id="transfer-form"><label>Enviar a<select name="recipient" aria-label="Enviar a" required>${accepted.map(f=>`<option value="${f.other_id}">${esc(f.first_name)} ${esc(f.last_name)}</option>`).join('')}</select></label>${input('amount','Coronas a enviar','number',`min="1" max="${Math.min(Number(w.balance||0),20000)}" step="1" inputmode="numeric" placeholder="Ej. 2000"`)}<p class="hint">Hasta 20.000 por envío y 50.000 al día. Las transferencias no aumentan tu rango.</p><button class="btn full" type="submit">Enviar coronitas 👑</button></form>`:empty('Primero, tu gente',`${link('/amigos','Añade un amigo')} para compartir coronas.`)}</section><section class="panel"><h2>Usarlas en una junta</h2><p>Reserva un descuento y muestra la ficha en el local <strong>antes de que emitan la boleta</strong>.</p>${state.locations.length?`<form id="redeem-form"><label>Local<select name="location" aria-label="Local" required>${state.locations.map(l=>`<option value="${l.id}">${esc(l.name)}</option>`).join('')}</select></label>${input('amount','Monto del descuento','number','min="1000" max="20000" step="500" placeholder="Ej. 3000"')}<p class="hint">De 1.000 a 20.000 coronas, en múltiplos de 500. Una ficha al día; vence en 10 minutos.</p><button class="btn secondary full" type="submit">Crear ficha de descuento</button></form>`:empty('Locales por conectar','El canje estará disponible cuando configuremos los locales y la caja.')}</section></div>${redemptions.map(r=>`<section class="panel redemption"><span class="pill">${new Date(r.expires_at)>new Date()?'FICHA RESERVADA':'FICHA VENCIDA'}</span><h2>${money(r.amount)} de descuento</h2><div class="code">${esc(r.code)}</div><p>Vence: ${date(r.expires_at)}. Caja debe validarla antes de emitir la boleta.</p><button class="btn secondary" data-cancel="${r.id}">Cancelar y devolver coronas</button></section>`).join('')}<section class="section"><h2>TUS MOVIMIENTOS</h2>${movements.length?`<div class="panel movements">${movements.map(m=>`<article><div><strong>${esc(m.note)}</strong><small>${date(m.created_at)}${!m.settled?' · Por activar':''}</small></div><b class="${m.amount>=0?'positive':''}">${m.amount>0?'+':''}${money(m.amount)}</b></article>`).join('')}</div>`:empty('Tu historia empieza aquí','Las compras, envíos y canjes aparecerán en este lugar.')}</section>`);
 const transferForm=document.querySelector('#transfer-form');let transferId=crypto.randomUUID();let lastTransfer='';
 if(transferForm){const to=new URLSearchParams(location.search).get('para');if(accepted.some(f=>f.other_id===to))transferForm.elements.recipient.value=to;
 transferForm.onsubmit=e=>{e.preventDefault();run(e.submitter,async()=>{const d=Object.fromEntries(new FormData(transferForm));const recipient=accepted.find(f=>f.other_id===d.recipient);const amount=Number(d.amount);if(!Number.isSafeInteger(amount)||amount<1||amount>20000)throw new Error('Ingresa un monto entero entre 1 y 20.000.');const key=`${d.recipient}:${amount}`;if(lastTransfer&&lastTransfer!==key)transferId=crypto.randomUUID();lastTransfer=key;if(!confirm(`¿Enviar ${money(amount)} en coronas a ${recipient.first_name}?`))return;await rpc('transfer_crowns',{recipient_id:d.recipient,amount_value:amount,request_id:transferId});toast('Coronitas enviadas 👑');await refreshData();render();});};}
 const redeem=document.querySelector('#redeem-form');let redeemId=crypto.randomUUID(),lastRedemption='';
 if(redeem)redeem.onsubmit=e=>{e.preventDefault();run(e.submitter,async()=>{const d=Object.fromEntries(new FormData(redeem));const key=`${d.location}:${d.amount}`;if(lastRedemption&&lastRedemption!==key)redeemId=crypto.randomUUID();lastRedemption=key;await rpc('create_redemption',{location_value:d.location,amount_value:Number(d.amount),request_id:redeemId});await refreshData();render();toast('Ficha creada. Muéstrala en caja.');});};
 document.querySelectorAll('[data-cancel]').forEach(b=>b.onclick=()=>run(b,async()=>{await rpc('cancel_redemption',{redemption_id:b.dataset.cancel});await refreshData();render();toast('Coronas devueltas.');}));
}
function memberCode(){if(authRequired())return;shell(`${heading('ANTES DE PEDIR LA CUENTA','TU CÓDIGO DEL CLUB.','Muestra este código a caja para que tus compras sumen coronas.')}<section class="panel code-panel"><span class="crown">♛</span><h2>${esc(state.profile.first_name)} ${esc(state.profile.last_name)}</h2><div class="qr">${qrSvg(state.profile.member_code)}</div><div class="code">${esc(state.profile.member_code)}</div><p>${esc(state.wallet?.tier)} · 1 corona = $1</p><p class="hint">Las coronas de tus compras se activan después de 24 horas. Caja debe estar integrada al Club.</p></section>`);}
function notifications(){
 if(authRequired())return;
 shell(`${heading('ALGO SE ESTÁ ARMANDO','EL TIMBRE DE LA JUNTA.','Avisos de amigos, solicitudes y coronitas.')}<button class="btn secondary" id="read-all">Marcar todo como leído</button><section class="section">${state.notifications.length?state.notifications.map(n=>`<article class="notification ${n.read_at?'':'unread'}"><span>${n.kind==='outing'?'🍺':['transfer','admin_credit'].includes(n.kind)?'👑':'♡'}</span><div><p>${esc(n.message)}</p><small>${date(n.created_at)}</small>${n.kind==='friend_request'?link('/amigos','Ver solicitudes →','text-link'):''}</div></article>`).join(''):empty('La junta está tranquila','Los avisos de tus amigos aparecerán aquí.')}</section><p class="hint">Puedes silenciar los avisos de actividad de cada persona en ${link('/amigos','Amigos')}. Las notificaciones llegan dentro de la app; no son mensajes de WhatsApp ni push con la app cerrada.</p>`);
 document.querySelector('#read-all').onclick=()=>run(document.querySelector('#read-all'),async()=>{await rpc('mark_notifications_read');await refreshData();render();});
}
function profilePage(){
 if(authRequired())return;const p=state.profile;
 shell(`${heading('TU CUENTA','ESTE ES TU CLUB.')}<section class="panel profile-panel"><span class="avatar large">${esc(p.first_name[0])}</span><h2>${esc(p.first_name)} ${esc(p.last_name)}</h2><dl><dt>Correo</dt><dd>${esc(state.session.user.email)}</dd><dt>RUT</dt><dd>${esc(p.rut)}</dd><dt>Celular</dt><dd>${esc(p.phone)}</dd><dt>Cumpleaños</dt><dd>${esc(p.birthday.split('-').reverse().join('/'))}</dd><dt>Código de socio</dt><dd>${esc(p.member_code)}</dd></dl><label class="check"><input type="checkbox" id="profile-share" ${p.share_activity?'checked':''}> Avisar a mis amigos cuando abra una carta 🍺</label><p class="hint">Tus amigos ven tu nombre y la inicial de tu apellido. Tu RUT, celular, correo y cumpleaños son privados.</p><div class="actions">${state.staff?link(state.staff.role==='admin'?'/admin':'/caja','Panel del equipo','btn secondary'):''}${link('/pruebas','Probar el Club','btn secondary')}${link('/olvide-contrasena','Cambiar contraseña','btn secondary')}<button class="btn danger" id="logout">Cerrar sesión</button></div></section>`);
 document.querySelector('#profile-share').onchange=e=>run(e.target,async()=>{await rpc('set_activity_sharing',{enabled:e.target.checked});state.profile.share_activity=e.target.checked;toast('Preferencia guardada.');},()=>{e.target.checked=p.share_activity;});
 document.querySelector('#logout').onclick=()=>run(document.querySelector('#logout'),async()=>{await authAction('signOut');await loadUser(null);go('/');});
}
function ranks(){shell(`${heading('CADA JUNTA SUMA','DE PLEBEYO A REY.','Tu rango depende de tu consumo en los últimos 12 meses, no de las coronas que recibes de amigos.')}<div class="rank-grid">${tiers.map(([name,threshold,pct],i)=>`<article class="panel rank ${state.wallet?.tier===name?'current':''}"><span class="crown">${['♙','♜','♞','♝','♛'][i]}</span><span class="pill">${state.wallet?.tier===name?'TU RANGO':`NIVEL ${i+1}`}</span><h2>${name}</h2><strong>${pct}%</strong><p>de vuelta en coronas</p><small>Desde ${money(threshold)} de consumo</small></article>`).join('')}</div><p class="hint">Porcentajes del Club según tu consumo. Tope de 8.000 coronas por persona y boleta; activación en 24 horas.</p>`);}
function terms(){shell(`${heading('LAS REGLAS DE LA JUNTA','TÉRMINOS Y PRIVACIDAD.')}<article class="panel legal"><h2>Club del Rey · versión de desarrollo</h2><p>El Club es para mayores de 18 años. Una corona equivale a un peso chileno de descuento; no es dinero retirable ni un medio de pago.</p><h3>Tu información</h3><p>Usamos nombre, apellido, RUT, teléfono, correo y cumpleaños para identificar tu cuenta, administrar beneficios y evitar duplicados. Supabase administra las contraseñas; no guardamos contraseñas en tu perfil. Los amigos solo ven tu nombre y la inicial de tu apellido.</p><h3>Amigos y actividad</h3><p>Una amistad requiere aceptación. Puedes eliminar amigos y silenciar sus avisos. Compartir la apertura de cartas es opcional y se desactiva desde tu perfil. Nunca compartimos tu GPS: si usas “Cerca de mí”, la posición se utiliza solamente en tu navegador.</p><h3>Coronas</h3><p>Las compras se acreditan desde caja y se activan en 24 horas. Las transferencias entre amigos aceptados descuentan tu saldo disponible y no aumentan el rango. Una boleta anulada puede generar un ajuste que se cubre con las siguientes coronas. Los canjes vencen en 10 minutos y requieren validación de caja.</p><h3>Antes de la apertura comercial</h3><p>Esta versión aún requiere que El Rey defina el responsable de datos, el contacto para ejercer derechos, la política de conservación y las condiciones comerciales definitivas. No abras el registro a clientes reales hasta completar esa información y la revisión legal.</p></article>`);}
async function adminPage(){
 if(authRequired())return;
 if(state.staff?.role!=='admin'){shell(`${heading('EQUIPO DEL REY','ACCESO RESTRINGIDO.','Tu cuenta no tiene permisos de administración.')}`);return;}
 const currentPage=pageVersion;
 const [summary,locals,members]=await Promise.all([rpc('admin_summary'),rpc('admin_locations'),rpc('admin_members')]);
 if(currentPage!==pageVersion)return;
 shell(`${heading('ADMINISTRACIÓN','EL CLUB, AL DÍA.','Gestiona los locales y sus cartas verificadas. Las compras, transferencias, canjes y acreditaciones quedan registrados en el Club.')}<div class="admin-stats">${[['Socios',summary.members],['Amistades',summary.friends],['Coronas disponibles',money(summary.balance)],['Por activar',money(summary.pending)],['Boletas',summary.receipts],['Locales activos',summary.locations]].map(([name,value])=>`<article class="panel"><small>${name}</small><h2>${value}</h2></article>`).join('')}</div><div class="section"><a data-nav href="/pruebas" class="btn">Preparar prueba de Martín y Luis →</a></div>${adminCreditsPanel(members)}<div class="section-title"><h2>LOCALES Y CARTAS</h2>${link('/caja','Abrir caja →','btn secondary')}</div><section class="two-col"><div class="panel"><h2>Agregar o editar un local</h2><form id="location-form"><label>Local<select name="id"><option value="">Nuevo local</option>${locals.map(l=>`<option value="${l.id}">${esc(l.name)}</option>`).join('')}</select></label>${input('name','Nombre del local','text','maxlength="100"')}${input('address','Dirección','text','maxlength="200"')}${input('commune','Comuna','text','maxlength="80"')}${input('menu','Enlace de la carta','url','placeholder="https://…"')}<div class="form-grid"><label>Latitud (opcional)<input name="latitude" type="number" min="-90" max="90" step="any"></label><label>Longitud (opcional)<input name="longitude" type="number" min="-180" max="180" step="any"></label></div><label class="check"><input name="active" type="checkbox" checked> Local activo y datos verificados</label><button type="submit" class="btn full">Guardar local</button></form></div><div class="panel"><h2>Catálogo (${locals.length})</h2>${locals.map(l=>`<article class="friend"><div><strong>${esc(l.name)}</strong><p>${esc(l.address)} · ${esc(l.commune)}</p><small>${l.active?'Activo':'Desactivado'} · ID: ${l.id}</small></div></article>`).join('')||empty('Faltan los locales','Carga al menos cinco cartas reales para completar el selector.')}</div></section><section class="section"><h2>SOCIOS RECIENTES</h2><div class="panel movements">${members.map(m=>`<article><div><strong>${esc(m.first_name)} ${esc(m.last_name)}</strong><small>${esc(m.member_code)}</small></div><b>${money(m.balance)}</b></article>`).join('')||'<p>Aún no hay socios.</p>'}</div></section>`);
 bindAdminCredits({run,toast,members,onCredit:async()=>{await refreshData();await render();}});
 const form=document.querySelector('#location-form');
 form.elements.id.onchange=e=>{const l=locals.find(l=>l.id===e.target.value);for(const key of ['name','address','commune'])form.elements[key].value=l?.[key]||'';form.elements.menu.value=l?.menu_url||'';form.elements.latitude.value=l?.latitude??'';form.elements.longitude.value=l?.longitude??'';form.elements.active.checked=l?.active??true;};
 form.onsubmit=e=>{e.preventDefault();run(e.submitter,async()=>{const d=Object.fromEntries(new FormData(form));if(!safeMenuUrl(d.menu))throw new Error('Usa un enlace HTTPS válido.');await rpc('admin_upsert_location',{id_value:d.id||null,name_value:d.name,address_value:d.address,commune_value:d.commune,menu_value:d.menu,latitude_value:d.latitude===''?null:Number(d.latitude),longitude_value:d.longitude===''?null:Number(d.longitude),active_value:form.elements.active.checked});state.locations=await rows('locations',q=>q.order('name'));render();toast('Local guardado.');});};
}
async function cashierPage(){
 if(authRequired())return;
 if(!state.staff){shell(`${heading('EQUIPO DEL REY','CAJA CON ACCESO PROTEGIDO.','Tu cuenta necesita un permiso de caja asignado por el administrador.')}`);return;}
 const locals=state.locations.filter(l=>state.staff.role==='admin'||l.id===state.staff.location_id);
 if(!locals.length){shell(`${heading('CAJA','FALTA CONFIGURAR EL LOCAL.','El administrador debe agregar y activar el local.')}`);return;}
 shell(`${heading('CAJA DEL CLUB','UNA BOLETA, SIN ENREDOS.','Valida el descuento antes de emitir la boleta. Después registra lo cobrado para acreditar las coronas.')}<label>Local<select id="cash-location">${locals.map(l=>`<option value="${l.id}">${esc(l.name)}</option>`).join('')}</select></label><div class="two-col"><section class="panel"><h2>Consultar socio</h2><form id="cash-member">${input('code','Código del socio','text','maxlength="12"')}<button class="btn secondary" type="submit">Consultar</button></form><div id="member-result"></div><h2 class="spaced">Validar ficha de descuento</h2><form id="cash-redeem">${input('code','Código de la ficha','text','maxlength="12"')}<button class="btn" type="submit">Aplicar descuento</button></form><p class="hint">La ficha solo puede usarse en el local elegido por el cliente. Comprueba la identidad y aplica el descuento antes de emitir.</p></section><section class="panel"><h2>Registrar boleta emitida</h2><form id="cash-sale">${input('folio','Folio de boleta','text','maxlength="80"')}${input('amount','Total cobrado (con descuento)','number','min="1" max="10000000" step="1"')}${input('people','Personas de la mesa','number','min="1" max="20" step="1"')}${input('codes','Códigos de socios separados por coma','text','placeholder="CODIGO1, CODIGO2"')}<label>Ficha de descuento aplicada (opcional)<input name="redemption" maxlength="12" placeholder="Código de la ficha usada"></label><p class="hint">Hasta 8 socios. Cada uno gana coronas por su parte de la cuenta, según su rango.</p><button class="btn full" type="submit">Registrar y acreditar</button></form><h2 class="spaced">Anular boleta</h2><form id="cash-cancel">${input('folio','Folio a anular','text','maxlength="80"')}<button class="btn danger" type="submit">Anular y revertir coronas</button></form></section></div>`);
 const locationId=()=>document.querySelector('#cash-location').value;
 document.querySelector('#cash-member').onsubmit=e=>{e.preventDefault();run(e.submitter,async()=>{const code=new FormData(e.target).get('code');const data=await rpc('staff_member',{location_value:locationId(),code_value:code});document.querySelector('#member-result').innerHTML=`<div class="empty"><h3>${esc(data.name)}</h3><p>${money(data.balance)} disponibles · ${money(data.pending)} por activar</p></div>`;});};
 document.querySelector('#cash-location').onchange=()=>{document.querySelector('#member-result').innerHTML='';};
 document.querySelector('#cash-redeem').onsubmit=e=>{e.preventDefault();run(e.submitter,async()=>{if(!confirm('¿Confirmar este descuento antes de emitir la boleta?'))return;const data=await rpc('staff_confirm_redemption',{location_value:locationId(),code_value:new FormData(e.target).get('code')});toast(data.already_used?'Esta ficha ya fue aplicada. No vuelvas a descontarla.':`Descuento confirmado: ${money(data.amount)}. Aplícalo en caja.`);});};
 document.querySelector('#cash-sale').onsubmit=e=>{e.preventDefault();run(e.submitter,async()=>{const d=Object.fromEntries(new FormData(e.target));await rpc('staff_sale',{location_value:locationId(),folio_value:d.folio,amount_value:Number(d.amount),people_value:Number(d.people),codes:d.codes.split(',').map(c=>c.replace(/[^A-Za-z0-9]/g,'').toUpperCase()).filter(Boolean),redemption_code:d.redemption.trim().toUpperCase()||null});toast('Boleta registrada. Las coronas se activan en 24 horas.');e.target.reset();});};
 document.querySelector('#cash-cancel').onsubmit=e=>{e.preventDefault();run(e.submitter,async()=>{if(!confirm('¿Anular la boleta y revertir las coronas de todos los socios?'))return;await rpc('staff_cancel_sale',{location_value:locationId(),folio_value:new FormData(e.target).get('folio')});toast('Boleta anulada.');e.target.reset();});};
}
async function run(button,fn,onError){if(button?.disabled)return;const old=button?.textContent;if(button){button.disabled=true;if(button.tagName==='BUTTON')button.textContent='Un momento…';}try{await fn();}catch(e){onError?.();fail(e);}finally{if(button?.isConnected){button.disabled=false;if(button.tagName==='BUTTON')button.textContent=old;}}}
async function render(){
 const version=++pageVersion;
 if(!state.loaded){shell('<div class="empty">Preparando tu Club…</div>');return;}
 try{
 const path=route();
 if(path==='/pruebas'){if(authRequired())return;await testPilotPage({shell,heading,state,run,toast,stillCurrent:()=>version===pageVersion,refresh:async()=>{await refreshData();state.locations=await rows('locations',q=>q.order('name'));await render();}});}else if(path==='/carta-prueba')testMenu({shell,heading});else if(path==='/admin')await adminPage();else if(path==='/caja')await cashierPage();else if(path==='/')home();else if(path==='/locales')locations();else if(['/entrar','/registro','/olvide-contrasena','/recuperar'].includes(path))authPage({'/entrar':'login','/registro':'register','/olvide-contrasena':'reset','/recuperar':'recover'}[path]);
 else if(path==='/amigos')await friends();else if(['/coronas','/canjear','/historial'].includes(path))await wallet();else if(path==='/codigo')memberCode();else if(path==='/notificaciones')notifications();else if(path==='/perfil')profilePage();else if(path==='/rangos')ranks();else if(path==='/terminos')terms();else shell(`${heading('ESTA MESA NO EXISTE','NO ENCONTRAMOS ESA PÁGINA.')} ${link('/','Volver al inicio','btn')}`);
 if(version===pageVersion)document.title=`Club del Rey · ${({'/locales':'La carta','/amigos':'Amigos','/coronas':'Coronas','/entrar':'Iniciar sesión','/registro':'Crear cuenta'}[path]||'La buena junta')}`;
 }catch(e){if(version===pageVersion){shell(`${heading('VAMOS DE NUEVO','NO PUDIMOS CARGAR TU CLUB.',esc(friendly(e)))}<button class="btn" id="retry">Reintentar</button>`);document.querySelector('#retry').onclick=async()=>{try{await refreshData();render();}catch(e){fail(e);}};}}
}
async function refreshData(){
 if(!state.session)return;
 const ownerId=state.session.user.id;
 const [p,w,f,n,staff]=await Promise.all([profile(state.session.user.id),rpc('my_wallet'),rpc('my_friends'),rows('notifications',q=>q.order('created_at',{ascending:false}).limit(60)),rpc('my_staff_role')]);
 if(state.session?.user.id!==ownerId)return;
 state.profile=p;state.wallet=w;state.staff=staff;state.friends=f;state.notifications=n;
}
async function loadUser(session){
 const version=++authVersion;
 state.session=session;
 if(session){await refreshData();}else{state.profile=null;state.wallet=null;state.staff=null;state.friends=[];state.notifications=[];}
 const visibleLocations=await rows('locations',q=>q.order('name'));
 if(version!==authVersion)return;
 state.locations=visibleLocations;
 seenNotifications=new Set(state.notifications.map(n=>n.id));
 if(channel){await supabase.removeChannel(channel);channel=null;}clearInterval(poll);
 if(session){channel=supabase.channel(`notices:${session.user.id}`).on('postgres_changes',{event:'INSERT',schema:'public',table:'notifications',filter:`user_id=eq.${session.user.id}`},()=>checkNotifications()).subscribe();poll=setInterval(checkNotifications,20000);}
}
async function checkNotifications(){
 if(!state.session||refreshing)return;refreshing=true;
 try{await refreshData();const fresh=state.notifications.filter(n=>!seenNotifications.has(n.id));fresh.forEach(n=>seenNotifications.add(n.id));if(fresh.length){toast(fresh[0].message);if(['/notificaciones','/amigos'].includes(route()))render();else{const bell=document.querySelector('.bell');if(bell){let b=bell.querySelector('.badge');if(!b){b=document.createElement('b');b.className='badge';bell.append(b);}b.textContent=state.notifications.filter(n=>!n.read_at).length;}}}}catch{/* Polling retries on the next tick. */}finally{refreshing=false;}
}
document.addEventListener('click',e=>{const a=e.target.closest('a[data-nav]');if(!a||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey||e.button!==0)return;e.preventDefault();go(a.getAttribute('href'));window.scrollTo(0,0);});
addEventListener('popstate',render);
const invite=new URLSearchParams(location.search).get('codigo');if(invite&&/^[A-Za-z0-9]{12}$/.test(invite))sessionStorage.setItem('rey-invite',invite);
async function start(){
 shell('<div class="empty">Preparando tu Club…</div>');
 if(configured){
 try{const {data,error}=await supabase.auth.getSession();if(error)throw error;await loadUser(data.session);}
 catch(e){fail(e);}
 supabase.auth.onAuthStateChange((event,session)=>{if(event==='INITIAL_SESSION'||event==='TOKEN_REFRESHED')return;setTimeout(async()=>{try{await loadUser(session);if(event==='PASSWORD_RECOVERY'){history.replaceState({},'','/recuperar');}render();}catch(e){fail(e);}},0);});
 }
 state.loaded=true;await render();
}
start();
