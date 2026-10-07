import {rpc} from './api.js';
import {esc, money} from './domain.js';

export function adminCreditsPanel(members) {
  return `<section class="section panel" id="admin-credits">
    <p class="eyebrow">PILOTO Y PROMOCIONES</p>
    <h2>Acreditar coronas</h2>
    <p>Acredita saldo disponible a un socio para probar el Club o entregar una promoción.
    Son coronas utilizables: cada una equivale a $1. Cada carga queda registrada y no aumenta el rango.</p>
    <form id="credit-form">
      <div class="form-grid">
        <label>Código del socio a acreditar
          <input name="member_code" list="credit-members" required minlength="12" maxlength="12" autocomplete="off" placeholder="Código de 12 caracteres">
          <datalist id="credit-members">${members.map(m=>`<option value="${esc(m.member_code)}">${esc(m.first_name)} ${esc(m.last_name)}</option>`).join('')}</datalist>
        </label>
        <label>Coronas a acreditar
          <input name="amount" type="number" required min="1" max="20000" step="1" inputmode="numeric" placeholder="Ej. 5000">
        </label>
      </div>
      <label>Motivo de la acreditación
        <input name="reason" required minlength="5" maxlength="200" placeholder="Ej. Prueba de envío entre amigos">
      </label>
      <button class="btn" type="submit">Acreditar coronas</button>
    </form>
    <p id="credit-status" role="status"></p>
    <details><summary>Ver últimas acreditaciones</summary><div id="credit-history"></div></details>
  </section>`;
}

export function bindAdminCredits({run,toast,members,onCredit}) {
  const form=document.querySelector('#credit-form');
  let requestId=crypto.randomUUID();
  let lastRequest='';
  form.onsubmit=e=>{
    e.preventDefault();
    run(e.submitter,async()=>{
      const data=Object.fromEntries(new FormData(form));
      const code=data.member_code.trim().toUpperCase();
      const amount=Number(data.amount);
      const reason=data.reason.trim();
      if(!/^[A-Z0-9]{12}$/.test(code)||!Number.isSafeInteger(amount)||amount<1||amount>20000||reason.length<5)
        throw new Error('Revisa el código, el monto y el motivo de la acreditación.');
      const fingerprint=JSON.stringify([code,amount,reason]);
      if(lastRequest&&lastRequest!==fingerprint)requestId=crypto.randomUUID();
      lastRequest=fingerprint;
      const member=members.find(m=>m.member_code===code);
      const recipient=member?`${member.first_name} ${member.last_name} (${code})`:code;
      if(!confirm(`¿Acreditar ${money(amount)} en coronas a ${recipient}?\nMotivo: ${reason}`))return;
      let result;
      try {
        result=await rpc('admin_credit_crowns',{code_value:code,amount_value:amount,reason_value:reason,request_id:requestId});
      } catch(error) {
        if(error.code==='PGRST202')throw new Error('Falta aplicar la migración 202610070002_admin_credits.sql en Supabase.');
        throw error;
      }
      // Reset only after a confirmed response. Retrying a failed request keeps its UUID.
      requestId=crypto.randomUUID();lastRequest='';form.reset();
      toast(result.already_applied?'Esa acreditación ya estaba aplicada.':`${money(amount)} en coronas acreditadas 👑`);
      await onCredit();
    });
  };
  const history=document.querySelector('#credit-history');
  document.querySelector('#admin-credits details').addEventListener('toggle',async e=>{
    if(!e.target.open)return;
    history.textContent='Cargando…';
    try {
      const credits=await rpc('admin_credit_history');
      history.innerHTML=credits.length?`<div class="movements">${credits.map(c=>`<article><div><strong>${esc(c.member_name)} · ${esc(c.member_code)}</strong><small>${esc(c.reason)} · ${esc(c.admin_name)}</small><small>${new Date(c.created_at).toLocaleString('es-CL')}</small></div><b class="positive">+${money(c.amount)}</b></article>`).join('')}</div>`:'Todavía no hay acreditaciones manuales.';
    } catch(error) {
      history.textContent=error.code==='PGRST202'?'Aplica la migración de acreditaciones para habilitar el historial.':'No pudimos cargar las acreditaciones. Cierra y vuelve a abrir el historial.';
    }
  });
}
