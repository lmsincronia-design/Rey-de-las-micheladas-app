// App del garzón del Club del Rey (/garzon). Mismo backend Supabase que la app del socio, sin cuentas del Club:
// el local entra con su clave y cada persona del equipo con su PIN. El servidor valida ambos en cada operación.
import './styles.css';
import './app.css';
import './garzon.css';
import qr from 'qrcode-generator';
import {configured,rpc} from './api.js';
import {esc,money,publicOrigin} from './domain.js';
import {icon} from './icons.js';
import {startQrScanner,memberCodeFrom} from './scan.js';

const app=document.querySelector('#app');
const KEY='rey-garzon',TABLE_KEY='rey-garzon-mesa';
const load=k=>{try{return JSON.parse(localStorage.getItem(k)||'null');}catch{return null;}};
const save=(k,v)=>{try{v==null?localStorage.removeItem(k):localStorage.setItem(k,JSON.stringify(v));}catch{/* modo privado */}};
let store=load(KEY)||{};
let tab='cobrar',view=null,timers=[],stopCamera=null,busy=false;
let tableRequest=null; // misma solicitud al reintentar: nunca crea dos mesas

function toast(message,error=false){const el=document.querySelector('#toast');el.textContent=message;el.className=`visible ${error?'error':''}`;clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.className='',6500);}
const friendly=e=>{const t=String(e?.message||e||'No pudimos completar la acción.');return /Failed to fetch|fetch failed/i.test(t)?'Sin conexión. Revisa el internet del teléfono.':t;};
function qrSvg(value){const code=qr(0,'M');code.addData(value);code.make();return code.createSvgTag({cellSize:6,margin:2,scalable:true});}
const pretty=code=>String(code).replace(/(.{4})(?=.)/,'$1-');
const hour=v=>new Date(v).toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit'});
function clearTimers(){timers.forEach(clearInterval);timers=[];stopCamera?.();stopCamera=null;}
async function run(button,fn){if(busy)return;busy=true;const old=button?.innerHTML;if(button){button.disabled=true;button.textContent='Un momento…';}
 try{await fn();}catch(e){
  if(/sesión del local terminó/i.test(e.message)){store={};save(KEY,null);save(TABLE_KEY,null);toast(e.message,true);render();return;}
  if(/Ingresa con tu PIN/i.test(e.message)){store.waiter=null;save(KEY,store);toast(e.message,true);render();return;}
  toast(friendly(e),true);
 }finally{busy=false;if(button?.isConnected){button.disabled=false;button.innerHTML=old;}}}
const auth=()=>({device_token:store.device,waiter_token:store.waiter?.token});

function shell(content,{nav=true}={}){
 clearTimers();
 const w=store.waiter,manager=w?.role==='manager';
 const tabs=[['cobrar','Cobrar','receipt'],['escanear','Escanear','scan'],['hoy','Hoy','clock'],...(manager?[['equipo','Equipo','users']]:[])];
 app.innerHTML=`<header class="topbar"><div class="wrap top-inner"><span class="brand"><img src="/assets/logo-rey.jpg" alt="El Rey de las Micheladas"><span>GARZÓN<span>${esc(store.location?.name||'CLUB DEL REY')}</span></span></span><div class="top-actions">${w?`<button type="button" class="g-who" id="switch-waiter" aria-label="Cambiar de garzón. Ahora: ${esc(w.name)}"><span class="avatar">${esc(w.name[0])}</span><span class="g-who-name">${esc(w.name)}</span></button>`:''}</div></div></header>
 <main class="wrap g-main">${store.location?.is_test?'<p class="g-test">LOCAL DE PRUEBAS · NO ES UN LOCAL REAL</p>':''}${content}</main>
 ${nav&&w?`<nav class="bottom-nav g-nav" style="grid-template-columns:repeat(${tabs.length},1fr)" aria-label="Secciones">${tabs.map(([id,label,ic])=>`<a href="#${id}" data-tab="${id}" class="${tab===id?'active':''}"${tab===id?' aria-current="page"':''}><span class="nav-ic" aria-hidden="true">${icon(ic,'',tab===id)}</span><span class="nav-lb">${label}</span></a>`).join('')}</nav>`:''}`;
 document.querySelectorAll('[data-tab]').forEach(a=>a.onclick=e=>{e.preventDefault();tab=a.dataset.tab;view=null;render();scrollTo(0,0);});
 document.querySelector('#switch-waiter')?.addEventListener('click',()=>{if(!confirm('¿Cambiar de garzón? Se cierra tu turno en este teléfono.'))return;rpc('garzon_logout',{device_token:store.device,full_logout:false}).catch(()=>{});store.waiter=null;save(KEY,store);render();});
}
const heading=(eyebrow,title,text='')=>`<div class="page-heading"><p class="eyebrow">${eyebrow}</p><h1>${title}</h1>${text?`<p class="muted">${text}</p>`:''}</div>`;

// ── 1. El local entra con su clave ──────────────────────────────────────────────────────────
async function loginPage(){
 shell(`<div class="splash" role="status"><img src="/assets/logo-rey.jpg" alt="" width="88" height="88"><p>Cargando locales…</p></div>`,{nav:false});
 let locals=[];try{locals=await rpc('garzon_locations');}catch(e){toast(friendly(e),true);}
 shell(`${heading('APP DEL GARZÓN','ENTRA CON TU LOCAL.','La clave del local la entrega el encargado. Se pide una vez en este teléfono.')}
 <form class="panel" id="local-login"><label>Local<select name="location" required>${locals.length?locals.map(l=>`<option value="${l.id}">${esc(l.name)}${l.is_test?' (pruebas)':''}</option>`).join(''):'<option value="">Aún no hay locales habilitados</option>'}</select></label>
 <label>Clave del local<input name="password" type="password" autocomplete="current-password" required></label>
 <button class="btn full" type="submit" ${locals.length?'':'disabled'}>${icon('lock')}<span>Entrar</span></button></form>
 <p class="hint">¿Eres socio del Club? Tu app es <a class="text-link" href="/">${esc(publicOrigin().replace(/^https:\/\//,''))}</a>.</p>`,{nav:false});
 document.querySelector('#local-login').onsubmit=e=>{e.preventDefault();run(e.submitter,async()=>{
  const d=Object.fromEntries(new FormData(e.target));const r=await rpc('garzon_login',{location_value:d.location,password_value:d.password});
  if(r.error)throw new Error(r.error);
  store={device:r.device_token,location:r.location,waiter:null};save(KEY,store);render();
 });};
}

// ── 2. ¿Quién atiende? y su PIN ─────────────────────────────────────────────────────────────
async function whoPage(){
 let data;try{data=await rpc('garzon_waiters',{device_token:store.device});}catch(e){return handleSessionError(e);}
 store.location=data.location;save(KEY,store);
 if(view?.pin){
  const w=data.waiters.find(x=>x.id===view.pin);if(!w){view=null;return whoPage();}
  shell(`<section class="pin-pad"><span class="avatar large">${esc(w.name[0])}</span><h1>${esc(w.name)}</h1><p class="muted">Ingresa tu PIN</p>
  <div class="pin-dots" aria-live="polite">${'<span></span>'.repeat(6)}</div>
  <div class="pin-keys">${[1,2,3,4,5,6,7,8,9].map(n=>`<button type="button" data-key="${n}">${n}</button>`).join('')}<button type="button" data-key="back" aria-label="Borrar">${icon('back')}</button><button type="button" data-key="0">0</button><button type="button" data-key="ok" class="ok" aria-label="Entrar">${icon('check')}</button></div>
  <button type="button" class="btn secondary full" id="pin-cancel">Elegir a otra persona</button></section>`,{nav:false});
  let pin='';const dots=[...document.querySelectorAll('.pin-dots span')];
  const paint=()=>dots.forEach((d,i)=>d.classList.toggle('on',i<pin.length));
  const submit=()=>{if(pin.length<4)return toast('El PIN tiene de 4 a 6 números.',true);const value=pin;pin='';paint();run(null,async()=>{
   const r=await rpc('garzon_pin',{device_token:store.device,waiter_value:w.id,pin_value:value});
   if(r.error){toast(r.error,true);return;}
   store.waiter={token:r.waiter_token,id:r.waiter.id,name:r.waiter.name,role:r.waiter.role,expires_at:r.expires_at};save(KEY,store);view=null;tab='cobrar';render();toast(`Hola, ${r.waiter.name}. Buen turno.`);
  });};
  document.querySelectorAll('[data-key]').forEach(b=>b.onclick=()=>{const k=b.dataset.key;if(k==='back')pin=pin.slice(0,-1);else if(k==='ok')return submit();else if(pin.length<6)pin+=k;paint();if(pin.length===6)submit();});
  document.querySelector('#pin-cancel').onclick=()=>{view=null;render();};
  return;
 }
 shell(`${heading(esc(data.location.name).toUpperCase(),'¿QUIÉN ATIENDE?','Toca tu nombre e ingresa tu PIN. Todo lo que hagas queda registrado a tu nombre.')}
 ${data.waiters.length?`<div class="who-grid">${data.waiters.map(w=>`<button type="button" class="who" data-who="${w.id}" ${w.locked?'disabled':''}><span class="avatar">${esc(w.name[0])}</span><strong>${esc(w.name)}</strong><small>${w.locked?'PIN bloqueado 10 min':w.role==='manager'?'Encargado':'Garzón'}</small></button>`).join('')}</div>`
 :'<div class="empty"><img class="empty-art" src="/assets/marca/jarro.svg" alt="" width="84" height="84"><h3>Aún no hay equipo</h3><p>LM Sincronía o el administrador deben crear al encargado de este local.</p></div>'}
 <button type="button" class="btn secondary full spaced" id="device-logout">${icon('logout')}<span>Cerrar el local en este teléfono</span></button>`,{nav:false});
 document.querySelectorAll('[data-who]').forEach(b=>b.onclick=()=>{view={pin:b.dataset.who};render();});
 document.querySelector('#device-logout').onclick=()=>{if(!confirm('¿Cerrar la sesión del local? Para volver se pide la clave del local.'))return;rpc('garzon_logout',{device_token:store.device,full_logout:true}).catch(()=>{});store={};save(KEY,null);save(TABLE_KEY,null);render();};
}
function handleSessionError(e){
 if(/sesión del local terminó/i.test(e.message)){store={};save(KEY,null);toast(e.message,true);return loginPage();}
 shell(`${heading('SIN CONEXIÓN','NO PUDIMOS CARGAR EL LOCAL.',esc(friendly(e)))}<button class="btn" id="retry">Reintentar</button>`,{nav:false});
 document.querySelector('#retry').onclick=render;
}

// ── 3. Cobrar: monto + personas → QR de la mesa ─────────────────────────────────────────────
function cobrarPage(){
 const active=load(TABLE_KEY);
 if(active?.id&&active.location===store.location?.id)return tablePage(active.id);
 shell(`${heading('AL ENTREGAR LA CUENTA','QR DE LA MESA.','Ingresa el total que paga la mesa y cuántas personas van a sumar coronas. La cuenta se divide en partes iguales entre ellas.')}
 <form class="panel g-bill" id="bill"><label>Total de la cuenta<span class="money-input"><b>$</b><input name="amount" inputmode="numeric" autocomplete="off" placeholder="0" required></span></label>
 <fieldset class="people-picker"><legend>¿Cuántos van a sumar coronas? <small>Pregunta en la mesa quiénes son del Club</small></legend><div class="chips">${Array.from({length:10},(_,i)=>i+1).map(n=>`<label class="chip"><input type="radio" name="people" value="${n}" ${n===2?'checked':''}><span>${n}</span></label>`).join('')}<label class="chip chip-more"><input type="radio" name="people" value="more"><span>Más</span></label></div><label class="people-more">Cuántos son (11 a 20)<input name="people_more" type="number" inputmode="numeric" min="11" max="20"></label></fieldset>
 <label><span>Mesa <small class="opt">(opcional)</small></span><input name="label" maxlength="20" placeholder="Ej. 7 o Terraza 2" autocomplete="off"></label>
 <div class="split-preview" id="split" aria-live="polite"></div>
 <button class="btn full" type="submit">${icon('qr')}<span>Generar QR de la mesa</span></button></form>
 <p class="hint">Si usaron coronas, ingresa el total <strong>después</strong> del descuento. Mínimo $5.000 por persona. El QR dura 10 minutos.</p>`);
 const form=document.querySelector('#bill'),amountInput=form.elements.amount;
 const amount=()=>Number(String(amountInput.value).replace(/\D/g,''));
 const people=()=>{const v=form.querySelector('[name="people"]:checked')?.value;return v==='more'?Number(form.elements.people_more.value):Number(v);};
 const preview=()=>{const a=amount(),p=people(),part=p?Math.floor(a/p):0,el=document.querySelector('#split');
  if(!a||!p){el.innerHTML='';return;}
  el.className='split-preview'+(part<5000?' warn':'');
  el.innerHTML=part<5000?`Cada parte quedaría en <strong>${money(part)}</strong>. El mínimo es $5.000 por persona: revisa el total o las personas.`:`<span>Cada persona suma por</span><strong>${money(part)}</strong>`;};
 amountInput.oninput=()=>{const n=amount();amountInput.value=n?n.toLocaleString('es-CL'):'';preview();};
 form.onchange=preview;form.elements.people_more.oninput=preview;
 form.onsubmit=e=>{e.preventDefault();run(e.submitter,async()=>{
  const a=amount(),p=people(),label=form.elements.label.value.trim();
  if(!Number.isInteger(p)||p<1||p>20)throw new Error('Indica entre 1 y 20 personas.');
  if(Math.floor(a/p)<5000)throw new Error('Cada parte debe ser de al menos $5.000.');
  const key=`${a}:${p}:${label}`;if(!tableRequest||tableRequest.key!==key)tableRequest={key,id:crypto.randomUUID()};
  const t=await rpc('garzon_open_table',{...auth(),amount_value:a,people_value:p,table_label_value:label||null,request_id:tableRequest.id});
  tableRequest=null;save(TABLE_KEY,{id:t.id,location:store.location.id});tablePage(t.id,t);
 });};
}
async function tablePage(id,initial){
 let t=initial;
 if(!t){try{t=await rpc('garzon_table',{...auth(),table_value:id});}catch(e){save(TABLE_KEY,null);toast(friendly(e),true);return cobrarPage();}}
 const url=`${publicOrigin()}/mesa?qr=${t.code}`;
 const done=t.claimed>=t.people;
 shell(`<section class="table-qr${t.cancelled?' cancelled':''}">
  <div class="table-qr-head"><span class="pill">${t.table_label?'MESA '+esc(t.table_label):'MESA'}</span><span class="g-total">${money(t.amount)} entre ${t.people}</span></div>
  <h1>${money(t.part)}<small>por persona</small></h1>
  ${t.cancelled?'<p class="g-alert">Cuenta anulada por el encargado.</p>':t.expired?'<p class="g-alert">El QR venció. Renuévalo si alguien aún no suma.</p>':`<div class="qr big">${qrSvg(url)}</div><div class="code">${pretty(t.code)}</div><div class="qr-timer" aria-hidden="true"><span></span></div><small class="qr-left" id="table-left"></small>`}
  <div class="claims"><div class="claims-bar"><span style="width:${Math.min(100,t.claimed/t.people*100)}%"></span></div><p><strong id="claimed">${t.claimed} de ${t.people}</strong> ya sumaron sus coronas${done?' ✓':''}</p></div>
 </section>
 <div class="g-actions">${!t.cancelled&&!done&&t.expired?`<button class="btn full" id="renew">${icon('clock')}<span>Renovar QR 10 minutos</span></button>`:''}<button class="btn ${t.expired||done||t.cancelled?'':'secondary '}full" id="new-table">${icon('plus')}<span>Nueva mesa</span></button></div>
 <p class="hint">Muéstrale el QR a la mesa. Quien no tenga la app la instala desde el mismo QR. Las partes que nadie escanee se pierden.</p>`);
 document.querySelector('#new-table').onclick=()=>{if(!done&&!t.expired&&!t.cancelled&&!confirm('Esta mesa aún tiene el QR activo. ¿Pasar a una mesa nueva?'))return;save(TABLE_KEY,null);cobrarPage();};
 document.querySelector('#renew')?.addEventListener('click',e=>run(e.currentTarget,async()=>{const r=await rpc('garzon_renew_table',{...auth(),table_value:t.id});tablePage(t.id,r);}));
 if(t.cancelled||t.expired||done)return;
 const tick=()=>{const left=Math.max(0,Math.round((new Date(t.expires_at)-Date.now())/1000));const el=document.querySelector('#table-left');if(!el)return;el.textContent=`Vence en ${Math.floor(left/60)}:${String(left%60).padStart(2,'0')}`;const bar=document.querySelector('.table-qr .qr-timer span');if(bar)bar.style.width=`${left/600*100}%`;if(!left)tablePage(t.id);};
 tick();timers.push(setInterval(tick,1000));
 timers.push(setInterval(async()=>{try{const r=await rpc('garzon_table',{...auth(),table_value:t.id});if(r.claimed!==t.claimed||r.cancelled||r.code!==t.code){if(r.claimed>t.claimed)toast(r.claimed>=r.people?'¡Toda la mesa sumó sus coronas!':'Otra persona sumó sus coronas.');tablePage(t.id,r);}}catch{/* siguiente intento */}},3000));
}

// ── 4. Escanear el QR del socio: canje o cumpleaños ─────────────────────────────────────────
function escanearPage(){
 if(view?.result)return scanResult(view.result);
 shell(`${heading('ANTES DE EMITIR LA BOLETA','ESCANEA AL SOCIO.','Para un descuento con coronas o el regalo de cumpleaños. El QR del socio cambia cada 30 segundos.')}
 <section class="panel"><button type="button" class="btn full" id="open-camera">${icon('camera')}<span>Abrir la cámara</span></button><div id="camera"></div>
 <form class="manual-code" id="manual-member"><label>O escribe el código<input name="code" maxlength="13" placeholder="Ej. C 7KM 2Q9 XDA" autocapitalize="characters" autocomplete="off" spellcheck="false" required></label><button class="btn secondary" type="submit">Validar</button></form></section>
 <p class="hint">El descuento se aplica al escanear: luego informa a caja el monto aprobado antes de emitir la boleta.</p>`);
 const handle=async code=>{
  if(code[0]==='C'){const r=await rpc('garzon_redeem',{...auth(),code_value:code});view={result:{kind:'redeem',...r}};}
  else{const r=await rpc('garzon_scan_member',{...auth(),code_value:code});view={result:{kind:'birthday',...r}};}
  render();
 };
 document.querySelector('#open-camera').onclick=async e=>{e.currentTarget.hidden=true;stopCamera=await startQrScanner(document.querySelector('#camera'),async text=>{
  const code=memberCodeFrom(text);if(!code){toast('Ese QR no es de un socio del Club.',true);return false;}
  let ok=false;await run(null,async()=>{await handle(code);ok=true;});return ok;
 },{onError:err=>{toast(err.message,true);const b=document.querySelector('#open-camera');if(b)b.hidden=false;}});};
 document.querySelector('#manual-member').onsubmit=e=>{e.preventDefault();const code=memberCodeFrom(new FormData(e.target).get('code'));if(!code)return toast('Revisa el código: empieza con C o B y tiene 10 caracteres.',true);run(e.submitter,()=>handle(code));};
}
function scanResult(r){
 if(r.kind==='redeem'){
  shell(`<section class="g-result ok"><span class="g-check">${icon('check')}</span><p class="eyebrow">DESCUENTO APROBADO${r.already_used?' (YA ESTABA APLICADO)':''}</p><h1>${money(r.amount)}</h1><p>${r.name?esc(r.name)+' · ':''}Informa a caja que descuente <strong>${money(r.amount)}</strong> antes de emitir la boleta.</p></section>
  <button class="btn full" id="scan-again">${icon('scan')}<span>Escanear otro</span></button><button class="btn secondary full" id="to-bill">${icon('receipt')}<span>Ir a cobrar la mesa</span></button>`);
  document.querySelector('#scan-again').onclick=()=>{view=null;render();};document.querySelector('#to-bill').onclick=()=>{view=null;tab='cobrar';render();};
  return;
 }
 if(r.kind==='birthday-done'){
  shell(`<section class="g-result ok"><span class="g-check">${icon('party')}</span><p class="eyebrow">REGALO ENTREGADO</p><h1>¡Feliz cumpleaños, ${esc(r.name)}!</h1><p>Una michelada de regalo (puede ser sin alcohol). Avisa a la barra.</p></section><button class="btn full" id="scan-again">${icon('scan')}<span>Escanear otro</span></button>`);
  document.querySelector('#scan-again').onclick=()=>{view=null;render();};return;
 }
 shell(`<section class="g-result birthday"><span class="g-check">${icon('gift')}</span><p class="eyebrow">CUMPLEAÑOS</p><h1>${esc(r.name)}</h1><p>Fecha de nacimiento: <strong>${esc(r.birthday)}</strong></p>
 <label class="check"><input type="checkbox" id="id-checked"> Revisé la cédula: el nombre y la fecha coinciden.</label></section>
 <button class="btn full" id="give-gift">${icon('gift')}<span>Entregar michelada de regalo</span></button><button class="btn secondary full" id="scan-cancel">Cancelar</button>`);
 document.querySelector('#scan-cancel').onclick=()=>{view=null;render();};
 document.querySelector('#give-gift').onclick=e=>run(e.currentTarget,async()=>{
  if(!document.querySelector('#id-checked').checked)throw new Error('Primero revisa la cédula del socio.');
  const done=await rpc('garzon_birthday',{...auth(),code_value:r.code,id_checked:true});view={result:{kind:'birthday-done',name:done.name}};render();
 });
}

// ── 5. Hoy: cuadratura del local y anulaciones del encargado ────────────────────────────────
async function hoyPage(){
 shell(`${heading('CUADRATURA','HOY EN EL LOCAL.')}<div class="splash" role="status"><p>Cargando el día…</p></div>`);
 let d;try{d=await rpc('garzon_day',auth());}catch(e){return run(null,()=>{throw e;});}
 if(tab!=='hoy')return;
 const manager=d.waiter.role==='manager';
 const tables=d.tables,valid=tables.filter(t=>!t.cancelled),reds=d.redemptions,used=reds.filter(r=>r.status==='used');
 shell(`${heading('CUADRATURA','HOY EN EL LOCAL.','Compara con las ventas y descuentos de la caja al cierre del día.')}
 <div class="g-stats"><article><small>Cuentas</small><strong>${valid.length}</strong><span>${money(valid.reduce((s,t)=>s+Number(t.amount),0))}</span></article><article><small>Canjes</small><strong>${used.length}</strong><span>${money(used.reduce((s,r)=>s+Number(r.amount),0))}</span></article><article><small>Cumpleaños</small><strong>${d.birthdays}</strong><span>micheladas</span></article></div>
 <section class="section"><h2>CUENTAS</h2>${tables.length?`<div class="panel g-list">${tables.map(t=>`<article class="${t.cancelled?'void':''}"><div><strong>${money(t.amount)}</strong> <small>${hour(t.created_at)} · ${t.table_label?'Mesa '+esc(t.table_label)+' · ':''}${esc(t.waiter)}</small><small>${t.claimed} de ${t.people} sumaron · ${money(t.part)} c/u${t.cancelled?' · ANULADA':''}</small></div>${manager&&!t.cancelled?`<button class="btn small secondary" data-void-table="${t.id}">Anular</button>`:''}<button class="icon-btn" data-open-table="${t.id}" aria-label="Ver el QR de esta mesa">${icon('qr')}</button></article>`).join('')}</div>`:'<p class="muted">Aún no hay cuentas hoy.</p>'}</section>
 <section class="section"><h2>CANJES</h2>${reds.length?`<div class="panel g-list">${reds.map(r=>`<article class="${r.status==='cancelled'?'void':''}"><div><strong>${money(r.amount)}</strong> <small>${hour(r.created_at)} · ${esc(r.member)} · ${esc(r.waiter)}</small>${r.status==='cancelled'?'<small>ANULADO · coronas devueltas</small>':''}</div>${manager&&r.can_void?`<button class="btn small secondary" data-void-red="${r.id}">Anular</button>`:''}</article>`).join('')}</div>`:'<p class="muted">Aún no hay canjes hoy.</p>'}</section>
 ${manager?'<p class="hint">Como encargado puedes anular una cuenta mal ingresada (24 horas) o un canje que no se aplicó en caja (2 horas). Queda registrado con tu nombre y el motivo.</p>':'<p class="hint">Si algo quedó mal ingresado, avisa al encargado: solo él puede anular.</p>'}`);
 document.querySelectorAll('[data-open-table]').forEach(b=>b.onclick=()=>{save(TABLE_KEY,{id:b.dataset.openTable,location:store.location.id});tab='cobrar';render();});
 document.querySelectorAll('[data-void-table]').forEach(b=>b.onclick=()=>{const reason=prompt('Motivo de la anulación (por ejemplo: monto mal ingresado):');if(!reason)return;run(b,async()=>{await rpc('garzon_void_table',{...auth(),table_value:b.dataset.voidTable,reason_value:reason});toast('Cuenta anulada: se revirtieron las coronas.');hoyPage();});});
 document.querySelectorAll('[data-void-red]').forEach(b=>b.onclick=()=>{const reason=prompt('Motivo (por ejemplo: el descuento no se aplicó en caja):');if(!reason)return;run(b,async()=>{await rpc('garzon_void_redemption',{...auth(),redemption_value:b.dataset.voidRed,reason_value:reason});toast('Canje anulado: las coronas volvieron al socio.');hoyPage();});});
}

// ── 6. Equipo (solo encargado) ──────────────────────────────────────────────────────────────
async function equipoPage(){
 let team;try{team=await rpc('garzon_team',auth());}catch(e){return run(null,()=>{throw e;});}
 if(tab!=='equipo')return;
 shell(`${heading('ENCARGADO','TU EQUIPO.','Agrega garzones con su PIN o desactiva a quien ya no trabaja en el local.')}
 <section class="panel"><ul class="team-list">${team.map(w=>`<li><strong>${esc(w.name)}</strong> <span class="pill">${w.role==='manager'?'ENCARGADO':'GARZÓN'}</span>${w.active?'':' <small>inactivo</small>'}${w.locked?' <small>PIN bloqueado</small>':''}${w.role==='waiter'?`<span class="team-actions"><button class="btn small secondary" data-pin="${w.id}" data-name="${esc(w.name)}">Nuevo PIN</button><button class="btn small secondary" data-toggle="${w.id}" data-name="${esc(w.name)}" data-active="${w.active}">${w.active?'Desactivar':'Activar'}</button></span>`:''}</li>`).join('')}</ul></section>
 <form class="panel" id="new-waiter"><h2>Agregar garzón</h2><label>Nombre<input name="name" maxlength="40" required autocomplete="off"></label><label>PIN de 4 a 6 números<input name="pin" inputmode="numeric" pattern="[0-9]{4,6}" maxlength="6" required autocomplete="off"></label><button class="btn full" type="submit">${icon('plus')}<span>Agregar</span></button><p class="hint">Cada persona debe usar su propio PIN: lo que haga queda a su nombre.</p></form>`);
 document.querySelector('#new-waiter').onsubmit=e=>{e.preventDefault();run(e.submitter,async()=>{const d=Object.fromEntries(new FormData(e.target));await rpc('garzon_save_waiter',{...auth(),id_value:null,name_value:d.name,pin_value:d.pin,active_value:true});toast(`${d.name} ya puede entrar con su PIN.`);equipoPage();});};
 document.querySelectorAll('[data-pin]').forEach(b=>b.onclick=()=>{const pin=prompt(`Nuevo PIN para ${b.dataset.name} (4 a 6 números):`);if(!pin)return;run(b,async()=>{await rpc('garzon_save_waiter',{...auth(),id_value:b.dataset.pin,name_value:b.dataset.name,pin_value:pin,active_value:true});toast('PIN actualizado.');equipoPage();});});
 document.querySelectorAll('[data-toggle]').forEach(b=>b.onclick=()=>run(b,async()=>{const active=b.dataset.active!=='true';await rpc('garzon_save_waiter',{...auth(),id_value:b.dataset.toggle,name_value:b.dataset.name,pin_value:null,active_value:active});toast(active?'Activado.':'Desactivado: ya no puede entrar.');equipoPage();}));
}

async function render(){
 if(!configured){shell(`${heading('APP DEL GARZÓN','FALTA CONECTAR SUPABASE.')}`,{nav:false});return;}
 if(!store.device)return loginPage();
 if(!store.waiter||new Date(store.waiter.expires_at)<=new Date()){store.waiter=null;save(KEY,store);return whoPage();}
 if(tab==='escanear')return escanearPage();
 if(tab==='hoy')return hoyPage();
 if(tab==='equipo'&&store.waiter.role==='manager')return equipoPage();
 tab='cobrar';return cobrarPage();
}
render();
