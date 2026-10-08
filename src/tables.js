import {rpc,authAction} from './api.js';
import {esc,money} from './domain.js';
const tokenPattern=/^[a-f0-9]{32}$/;
export function rememberTableInvite(){
 const query=new URLSearchParams(location.search);
 const token=location.pathname==='/mesa'?query.get('codigo'):query.get('mesa');
 if(tokenPattern.test(token||''))localStorage.setItem('rey-table-invite',token);
}
export function pendingTableInvite(user){
 const token=localStorage.getItem('rey-table-invite')||user?.user_metadata?.table_invite;
 return tokenPattern.test(token||'')?token:null;
}
export function afterLoginPath(user){
 const table=pendingTableInvite(user);
 if(table)return `/mesa?codigo=${table}`;
 const friend=sessionStorage.getItem('rey-invite');
 return friend?`/amigos?codigo=${encodeURIComponent(friend)}`:'/';
}
export async function myTables(){
 try{const [checkouts,receipts]=await Promise.all([rpc('my_table_checkouts'),rpc('my_receipt_tables')]);return {checkouts,receipts};}
 catch(e){if(e.code==='PGRST202')return {checkouts:[],receipts:[],missing:true};throw e;}
}
export function tableSelector(checkouts=[]){
 return `<label>Mesa de esta boleta<select name="table_code"><option value="">Solo mi consumo · 1 persona</option>${checkouts.map(t=>`<option value="${esc(t.code)}">${t.people} personas · ${esc(t.code)}</option>`).join('')}</select></label><p class="hint">¿Pagaste por la mesa? <a data-nav href="/codigo">Prepara tu código con la cantidad de personas</a> y selecciónalo aquí. Solo se acredita tu parte; después compartes el enlace.</p>`;
}
export function receiptTablesPanel(receipts=[]){
 if(!receipts.length)return '';
 return `<section class="section"><h2>LAS CORONAS DE TU MESA</h2><p>Comparte el enlace con quienes estuvieron contigo. Cada persona recibe coronas por su parte según su propio rango, aunque tenga que registrarse primero.</p><div class="table-receipts">${receipts.map(r=>{const remaining=Math.max(0,r.people-r.claimed),closed=r.cancelled_at||new Date(r.expires_at)<=new Date();return `<article class="panel table-receipt"><span class="pill">${r.cancelled_at?'BOLETA ANULADA':closed?'ENLACE VENCIDO':`${remaining} CUPO${remaining===1?'':'S'} DISPONIBLE${remaining===1?'':'S'}`}</span><h3>${esc(r.location_name)}</h3><p>Boleta ${esc(r.folio)} · ${money(r.amount)} entre ${r.people}</p><h2>${money(r.part)} por persona</h2><p>${r.claimed} de ${r.people} partes reclamadas. Cada cuenta recibe una sola parte.</p>${!closed&&remaining?`<div class="actions"><button class="btn" data-share-table="${esc(r.token)}">Compartir con mi mesa</button><button class="btn secondary" data-copy-table="${esc(r.token)}">Copiar enlace</button></div><p class="hint">Para reclamar hasta ${new Date(r.expires_at).toLocaleString('es-CL')}. Compártelo solo con tu mesa.</p>`:''}</article>`;}).join('')}</div></section>`;
}
export function bindTableShares({run,toast}){
 document.querySelectorAll('[data-copy-table],[data-share-table]').forEach(b=>b.onclick=()=>run(b,async()=>{
  const token=b.dataset.copyTable||b.dataset.shareTable;const url=`${location.origin}/mesa?codigo=${token}`;
  if(b.dataset.shareTable&&navigator.share){try{await navigator.share({title:'Tu parte de la junta 👑',text:'Recibe las coronas de tu parte de la mesa. Si aún no tienes cuenta, puedes crearla desde el enlace.',url});}catch(e){if(e.name!=='AbortError')throw e;}}
  else{await navigator.clipboard.writeText(url);toast('Enlace de tu mesa copiado.');}
 }));
}
export async function memberTablePage({shell,heading,state,qrSvg,run,toast,stillCurrent,refresh}){
 const tables=await myTables();if(!stillCurrent())return;
 shell(`${heading('ANTES DE PEDIR LA CUENTA','TU MESA TAMBIÉN SUMA.','Indica cuántas personas consumieron. Caja confirma la cantidad y registra el total pagado; cada integrante gana coronas solo por su parte.')}
 <div class="two-col"><section class="panel"><h2>¿Cuántos son en la mesa?</h2><form id="prepare-table"><label>Personas en la mesa, incluyéndote<input name="people" type="number" min="1" max="20" step="1" value="1" required></label><p class="hint">Ejemplo: $100.000 entre 5 = $20.000 por persona. Plebeyo: 800 coronas; Comerciante: 1.200.</p><button class="btn full" type="submit" ${tables.missing?'disabled':''}>Preparar código para caja</button></form>${tables.missing?'<p>Falta actualizar la conexión para habilitar mesas.</p>':''}<p>Después de que caja registre la boleta, el enlace para tus acompañantes aparecerá en <a data-nav class="text-link" href="/coronas">Coronas</a>.</p></section><section class="panel code-panel"><p class="eyebrow">TU CÓDIGO DE SOCIO</p><h2>${esc(state.profile.first_name)} ${esc(state.profile.last_name)}</h2><div class="qr">${qrSvg(state.profile.member_code)}</div><div class="code">${esc(state.profile.member_code)}</div><p>Para identificarte en caja. Si pagas por la mesa, usa el código de mesa que prepares.</p></section></div>
 <section class="section"><h2>CÓDIGOS DE MESA POR USAR</h2>${tables.checkouts.map(t=>`<article class="panel table-checkout"><div><span class="pill">${t.people} PERSONA${t.people===1?'':'S'}</span><div class="code">${esc(t.code)}</div><p>Muestra este código a caja. Vence ${new Date(t.expires_at).toLocaleString('es-CL')}.</p></div><div class="qr">${qrSvg(t.code)}</div></article>`).join('')||'<p>Aún no has preparado una mesa.</p>'}</section>`);
 const form=document.querySelector('#prepare-table');let id=crypto.randomUUID(),lastPeople=null;
 form.onsubmit=e=>{e.preventDefault();run(e.submitter,async()=>{const people=Number(new FormData(form).get('people'));if(lastPeople!==null&&lastPeople!==people)id=crypto.randomUUID();lastPeople=people;await rpc('prepare_table',{people_value:people,request_id:id});await refresh();toast('Código de mesa preparado. Muéstralo a caja.');});};
}
export async function tableInvitePage({shell,heading,state,run,toast,refresh,stillCurrent}){
 const token=new URLSearchParams(location.search).get('codigo');
 if(!tokenPattern.test(token||'')){shell(`${heading('TU MESA','EL ENLACE NO ES VÁLIDO.','Pide a quien pagó que te comparta el enlace completo.')}`);return;}
 rememberTableInvite();let info=await rpc('table_share_info',{token_value:token});if(!stillCurrent())return;
 let result,error;
 if(state.session&&!info.cancelled&&!info.expired&&(info.claimed||info.remaining>0)){
  try{result=await rpc('claim_table_share',{token_value:token});await refresh();info=await rpc('table_share_info',{token_value:token});
   localStorage.removeItem('rey-table-invite');
   if(state.session.user.user_metadata?.table_invite){await authAction('updateUser',{data:{table_invite:null}});}
  }catch(e){error=e.message;}
 }
 if(!stillCurrent())return;
 const closed=info.cancelled||info.expired||(!info.remaining&&!info.claimed);
 shell(`${heading('LA JUNTA TAMBIÉN ES TUYA','TU PARTE, TUS CORONAS.','No necesitas haber pagado la cuenta para recibir las coronas de tu consumo.')}
 <section class="panel table-invite"><span class="pill">${esc(info.location_name)}</span><h2>${money(info.part)} de consumo para ti</h2><p>${money(info.amount)} entre ${info.people} personas. Tu porcentaje depende de tu rango al reclamar.</p>
 ${error?`<p role="alert">${esc(error)}</p><button class="btn" id="retry-table">Volver a intentar</button>`:info.cancelled?'<h3>Esta boleta fue anulada.</h3>':info.claimed?`<h3>Tu parte ya está registrada 👑</h3><p><strong>${money(info.earned)} en coronas</strong>. Disponibles desde ${new Date(info.available_at).toLocaleString('es-CL')}.</p><a data-nav href="/coronas" class="btn">Ver mis coronas</a>`:closed?`<h3>${info.expired?'El enlace venció.':'Todos los cupos ya fueron reclamados.'}</h3>`:!state.session?`<p>Si eres nuevo, empiezas como Plebeyo: 4% de vuelta. Recibirás tu parte al entrar después de registrarte y confirmar tu correo.</p><div class="actions"><a data-nav href="/registro" class="btn">Crear cuenta y recibir coronas</a><a data-nav href="/entrar" class="btn secondary">Ya tengo cuenta</a></div><p class="hint">Tu invitación se conserva durante el registro. Quedan ${info.remaining} cupos; un cupo por cuenta.</p>`:''}
 <p class="hint">Las coronas esperan 24 horas desde tu reclamo. El enlace permite reclamar durante 7 días desde el registro de la boleta.</p></section>`);
 document.querySelector('#retry-table')?.addEventListener('click',()=>tableInvitePage({shell,heading,state,run,toast,refresh,stillCurrent}));
}
