// Panel del administrador: clave de cada local y su equipo (garzones y encargados con PIN).
import {rpc} from './api.js';
import {esc} from './domain.js';

export function adminLocalsPanel(access){
 if(!access)return `<section class="section"><h2>APP DEL GARZÓN</h2><p class="muted">Falta aplicar la migración del QR de mesa y la app del garzón.</p></section>`;
 const ready=access.filter(l=>l.has_access).length;
 return `<section class="section admin-locals"><div class="section-title"><h2>APP DEL GARZÓN</h2></div>
 <p class="muted">${ready} de ${access.length} locales tienen clave. Cada local entra en <strong>/garzon</strong> con su clave; cada persona del equipo usa su PIN.</p>
 <div class="two-col"><form class="panel" id="local-access-form"><h3>Clave del local</h3>
  <label>Local<select name="location">${access.map(l=>`<option value="${l.id}">${esc(l.name)}${l.has_access?' ✓':''}</option>`).join('')}</select></label>
  <label>Clave nueva (mínimo 8 caracteres)<input name="password" type="text" minlength="8" maxlength="64" autocomplete="off" spellcheck="false" required></label>
  <p class="hint">Cambiar la clave cierra la sesión en todos los teléfonos del local.</p>
  <button class="btn full" type="submit">Guardar clave</button><button class="btn secondary full" type="button" id="revoke-local">Cerrar sesiones del local</button></form>
 <form class="panel" id="waiter-form"><h3>Equipo del local</h3>
  <label>Local<select name="location">${access.map(l=>`<option value="${l.id}">${esc(l.name)}</option>`).join('')}</select></label>
  <div id="waiter-list"></div>
  <label>Persona<select name="id"><option value="">Nueva persona</option></select></label>
  <label>Nombre<input name="name" maxlength="40" required></label>
  <label>Rol<select name="role"><option value="waiter">Garzón</option><option value="manager">Encargado (puede anular y administrar garzones)</option></select></label>
  <label>PIN de 4 a 6 números<input name="pin" inputmode="numeric" pattern="[0-9]{4,6}" maxlength="6" autocomplete="off" placeholder="Déjalo vacío para no cambiarlo"></label>
  <label class="check"><input name="active" type="checkbox" checked> Activo</label>
  <button class="btn full" type="submit">Guardar persona</button></form></div></section>`;
}

export function bindAdminLocals({run,toast,access,onChange}){
 if(!access)return;
 const accessForm=document.querySelector('#local-access-form'),team=document.querySelector('#waiter-form');
 accessForm.onsubmit=e=>{e.preventDefault();run(e.submitter,async()=>{const d=Object.fromEntries(new FormData(accessForm));await rpc('admin_set_local_password',{location_value:d.location,password_value:d.password});toast('Clave del local guardada. Entrégala solo al encargado.');await onChange();});};
 document.querySelector('#revoke-local').onclick=e=>run(e.currentTarget,async()=>{if(!confirm('¿Cerrar la sesión en todos los teléfonos de este local?'))return;await rpc('admin_revoke_local_sessions',{location_value:accessForm.elements.location.value});toast('Sesiones cerradas.');});
 const fill=()=>{
  const local=access.find(l=>l.id===team.elements.location.value);const people=local?.waiters||[];
  document.querySelector('#waiter-list').innerHTML=people.length?`<ul class="team-list">${people.map(w=>`<li><strong>${esc(w.name)}</strong> <span class="pill">${w.role==='manager'?'ENCARGADO':'GARZÓN'}</span>${w.active?'':' <small>inactivo</small>'}</li>`).join('')}</ul>`:'<p class="hint">Este local aún no tiene equipo.</p>';
  team.elements.id.innerHTML=`<option value="">Nueva persona</option>${people.map(w=>`<option value="${w.id}">${esc(w.name)}</option>`).join('')}`;
  pick();
 };
 const pick=()=>{
  const local=access.find(l=>l.id===team.elements.location.value);const w=local?.waiters.find(x=>x.id===team.elements.id.value);
  team.elements.name.value=w?.name||'';team.elements.role.value=w?.role||'waiter';team.elements.active.checked=w?.active??true;team.elements.pin.value='';
  team.elements.pin.required=!w;
 };
 team.elements.location.onchange=fill;team.elements.id.onchange=pick;fill();
 team.onsubmit=e=>{e.preventDefault();run(e.submitter,async()=>{const d=Object.fromEntries(new FormData(team));await rpc('admin_save_waiter',{location_value:d.location,id_value:d.id||null,name_value:d.name,role_value:d.role,pin_value:d.pin||null,active_value:team.elements.active.checked});toast('Equipo actualizado.');await onChange();});};
}
