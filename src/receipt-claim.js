import {rpc} from './api.js';
import {money} from './domain.js';
import {tableSelector} from './tables.js';

export function receiptClaimPanel(pilot,{title='Ingresa tu boleta',showInactive=true,checkouts=[]}={}) {
 const enabled=pilot?.enabled&&pilot?.participant;
 if(!enabled&&!showInactive)return '';
 return `<section class="panel receipt-claim" id="receipt-claim">
 <p class="eyebrow">SUMA CORONAS CON TU COMPRA</p><h2>${title}</h2>
 <p>Escribe el código de tu boleta para sumar coronas según tu rango.</p>
 ${enabled?`<p class="hint">Prueba activa: usa una de las cinco boletas PRUEBA-. Cada código se puede usar una sola vez entre los participantes.</p>
 <form id="receipt-form"><label>Código de la boleta<input name="code" required maxlength="24" placeholder="Ej. PRUEBA-60000" autocapitalize="characters" autocomplete="off" spellcheck="false"></label>
 ${tableSelector(checkouts)}
 <label>Ficha de descuento (opcional)<input name="redemption" maxlength="12" placeholder="Si reservaste un descuento para esta compra" autocapitalize="characters" autocomplete="off"></label>
 <button class="btn full" type="submit">Canjear boleta</button></form>
 <p class="hint">Tus coronas quedan pendientes durante 24 horas desde que canjeas el código. Después estarán disponibles automáticamente.</p>
 <p class="hint">La ficha opcional aplica el descuento reservado para el local de pruebas. El monto de la boleta corresponde a lo pagado después del descuento.</p>`:
 `<p>${pilot?.configured&&!pilot.enabled?'La prueba está cerrada. Tus coronas disponibles siguen en tu cuenta.':'Por ahora, el ingreso de códigos está habilitado para las cuentas con boletas de prueba activas. Las compras reales se registran desde caja.'}</p><a data-nav class="text-link" href="/pruebas">${pilot?.is_admin?'Preparar o revisar las boletas de prueba →':'Ver el estado de mis boletas de prueba →'}</a>`}
 </section>`;
}

export function bindReceiptClaim({run,toast,refresh}) {
 const form=document.querySelector('#receipt-form');
 if(form)form.onsubmit=e=>{e.preventDefault();run(e.submitter,async()=>{
  const d=Object.fromEntries(new FormData(form));
  const result=await rpc('claim_test_receipt',{code_value:d.code.trim().toUpperCase(),redemption_code:d.redemption.trim().toUpperCase()||null,table_code:d.table_code||null});
  await refresh();toast(result.already_claimed?'Ya habías canjeado esa boleta; no duplicamos tus coronas.':`Boleta canjeada: ${money(result.earned)} en coronas por activar.`);
 });};

}

export async function receiptClaimStatus() {
 try{return await rpc('my_test_pilot');}
 catch(error){if(error.code==='PGRST202')return null;throw error;}
}
