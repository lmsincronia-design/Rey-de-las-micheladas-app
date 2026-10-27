import {rpc} from './api.js';
import {money} from './domain.js';

// Boletas ficticias del piloto (/pruebas). Las compras reales se suman con el QR de la mesa que genera el garzón.
export function receiptClaimPanel(pilot,{title='Ingresa tu boleta',showInactive=true}={}) {
 const enabled=pilot?.enabled&&pilot?.participant;
 if(!enabled&&!showInactive)return '';
 return `<section class="panel receipt-claim" id="receipt-claim">
 <p class="eyebrow">SOLO PARA PRUEBAS</p><h2>${title}</h2>
 ${enabled?`<p>Escribe el código de una boleta de prueba para sumar coronas según tu rango.</p><p class="hint">Usa una de las cinco boletas PRUEBA-. Cada código se puede usar una sola vez entre los participantes.</p>
 <form id="receipt-form"><label>Código de la boleta<input name="code" required maxlength="24" placeholder="Ej. PRUEBA-60000" autocapitalize="characters" autocomplete="off" spellcheck="false"></label>
 <button class="btn full" type="submit">Canjear boleta</button></form>
 <p class="hint">Tus coronas quedan pendientes durante 24 horas desde que canjeas el código. Después estarán disponibles automáticamente.</p>`:
 `<p>${pilot?.configured&&!pilot.enabled?'La prueba está cerrada. Tus coronas disponibles siguen en tu cuenta.':'Las compras reales se suman con el QR de la mesa que te muestra el garzón.'}</p>`}
 </section>`;
}

export function bindReceiptClaim({run,toast,refresh}) {
 const form=document.querySelector('#receipt-form');
 if(form)form.onsubmit=e=>{e.preventDefault();run(e.submitter,async()=>{
  const d=Object.fromEntries(new FormData(form));
  const result=await rpc('claim_test_receipt',{code_value:d.code.trim().toUpperCase(),redemption_code:null,table_code:null});
  await refresh();toast(result.already_claimed?'Ya habías canjeado esa boleta; no duplicamos tus coronas.':`Boleta canjeada: ${money(result.earned)} en coronas por activar.`);
 });};
}
