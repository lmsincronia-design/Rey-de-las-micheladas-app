import {rpc} from './api.js';
import {receiptClaimPanel,bindReceiptClaim} from './receipt-claim.js';
import {esc,money} from './domain.js';

export async function testPilotPage({shell,heading,state,run,toast,refresh,stillCurrent}) {
 let pilot;
 try {pilot=await rpc('my_test_pilot');}
 catch(e){if(e.code!=='PGRST202')throw e; if(!stillCurrent())return;shell(`${heading('PRUEBAS DEL CLUB','FALTA ACTIVAR LAS PRUEBAS.','Aplica las migraciones 002, 003, 004 y 005 en Supabase. Después vuelve a esta pantalla.')}`);return;}
 if(!stillCurrent())return;
 const members=pilot.is_admin&&!pilot.configured?await rpc('admin_members'):[];
 if(!stillCurrent())return;
 const options=members.map(m=>`<option value="${esc(m.member_code)}">${esc(m.first_name)} ${esc(m.last_name)} · ${esc(m.member_code)}</option>`).join('');
 shell(`${heading('DATOS DE PRUEBA','PROBEMOS EL CLUB.','Boletas ficticias para recorrer el flujo de coronas. No son documentos tributarios ni compras realizadas.')}
 <section class="panel"><p>Usamos las cuentas y el saldo de este proyecto. Las cargas, compras de prueba y transferencias quedan registradas. Cada boleta la puede usar una sola persona, una sola vez.</p>
 ${pilot.configured?`<p>Cuenta de Martín: <strong>${esc(pilot.martin_code)}</strong> · Cuenta de Luis: <strong>${esc(pilot.luis_code)}</strong></p><p class="pill">${pilot.enabled?'PRUEBA ACTIVA':'PRUEBA CERRADA'}</p>`:''}
 ${pilot.is_admin&&!pilot.configured?`<h2>Preparar Martín y Luis</h2><p>Se agregarán 5.000 coronas a Martín y 3.000 a Luis. Repetir la preparación no duplica las cargas.</p><form id="pilot-setup"><label>Cuenta de Martín · +5.000 coronas<select name="martin" required><option value="">Selecciona su cuenta</option>${options}</select></label><label>Cuenta de Luis · +3.000 coronas<select name="luis" required><option value="">Selecciona tu cuenta</option>${options}</select></label><button class="btn" type="submit">Preparar las cinco boletas</button></form>`:''}
 ${!pilot.is_admin&&!pilot.configured?'<p>El administrador debe seleccionar tus cuentas y preparar las boletas desde esta pantalla.</p>':''}</section>
 ${receiptClaimPanel(pilot,{title:'Canjear boleta de prueba',showInactive:false})}
 <div class="actions section"><a data-nav href="/coronas" class="btn">Ingresar boletas, usar y enviar coronas →</a><a data-nav href="/amigos" class="btn secondary">Añadir amigos</a></div>
 ${pilot.vouchers?`<section class="section panel"><h2>Las cinco boletas</h2><div class="movements">${pilot.vouchers.map(v=>`<article><div><strong>${esc(v.code)}</strong><small>${v.cancelled?'Anulada':v.claimed?`Canjeada por ${esc(v.member_name)}`:'Disponible'}</small></div><b>${money(v.amount)}</b></article>`).join('')}</div></section>`:''}
 ${pilot.is_admin&&pilot.enabled?'<section class="panel"><h2>Finalizar la prueba</h2><p>Cierra nuevos canjes de estas boletas y oculta el local ficticio. Conserva los saldos, rangos, movimientos y auditoría; no borra ni revierte las operaciones.</p><a data-nav href="/caja" class="btn secondary">Ir a caja para probar anulaciones</a> <button class="btn danger" id="pilot-close">Cerrar la prueba</button></section>':''}
 <p class="hint">1 corona = $1 CLP de descuento. Plebeyo 4% · Comerciante 6% · Guardia Real 8% · Noble 10% · Rey 12%. No es descuento automático sobre la boleta: acumulas coronas y después las usas con una ficha.</p>`);
 const setup=document.querySelector('#pilot-setup');
 if(setup)setup.onsubmit=e=>{e.preventDefault();run(e.submitter,async()=>{
  const d=Object.fromEntries(new FormData(setup));if(d.martin===d.luis)throw new Error('Selecciona dos cuentas distintas.');
  if(!confirm(`¿Agregar 5.000 coronas a ${setup.elements.martin.selectedOptions[0].textContent} y 3.000 a ${setup.elements.luis.selectedOptions[0].textContent}?`))return;
  await rpc('admin_prepare_test_pilot',{martin_code:d.martin,luis_code:d.luis});await refresh();toast('Prueba preparada: saldos acreditados y cinco boletas disponibles.');
 });};
 bindReceiptClaim({run,toast,refresh});
 const close=document.querySelector('#pilot-close');if(close)close.onclick=()=>run(close,async()=>{if(!confirm('¿Cerrar la prueba? Los saldos y movimientos se conservan y las boletas restantes ya no podrán canjearse.'))return;await rpc('admin_close_test_pilot');await refresh();toast('Prueba cerrada.');});
}

export function testMenu({shell,heading}) {
 shell(`${heading('CARTA FICTICIA · SOLO PRUEBAS','LA JUNTA DE PRUEBA.','Estos productos y precios son inventados para probar la app. No corresponden a la carta de un local real.')}<section class="panel movements">${[['Michelada de prueba',6000],['Hamburguesa de prueba',12000],['Papas para compartir de prueba',8000]].map(([name,amount])=>`<article><strong>${name}</strong><b>${money(amount)}</b></article>`).join('')}</section><a data-nav href="/pruebas" class="btn">Volver a las boletas de prueba</a>`);
}
