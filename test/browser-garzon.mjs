// App del garzón (/garzon) en Chromium móvil, con la frontera HTTP de Supabase simulada.
// Las reglas reales (PIN, mínimos, canjes, anulaciones) se prueban sobre PostgreSQL en test/garzon.test.js.
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import assert from 'node:assert/strict';
const port=4177,base=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{env:{...process.env,VITE_SUPABASE_URL:'https://club-test.supabase.co',VITE_SUPABASE_ANON_KEY:'test-public-key'}});
let browser;
try{
 await new Promise((resolve,reject)=>{server.stdout.on('data',d=>{if(String(d).includes(String(port)))resolve();});server.stderr.on('data',d=>process.stderr.write(d));server.on('exit',c=>reject(new Error('Vite exited '+c)));setTimeout(()=>reject(new Error('Vite startup timeout')),12000).unref();});
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':chromium.executablePath()),headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:390,height:844},locale:'es-CL',isMobile:true,hasTouch:true});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const calls=[];
 const local={id:'10000000-0000-4000-8000-000000000001',name:'Rey Pío Nono',is_test:false};
 const waiters=[{id:'w-carla',name:'Carla',role:'manager',locked:false},{id:'w-pedro',name:'Pedro',role:'waiter',locked:false}];
 let table=null,polls=0,redemptions=[],team=[{id:'w-carla',name:'Carla',role:'manager',active:true,locked:false},{id:'w-pedro',name:'Pedro',role:'waiter',active:true,locked:false}];
 const fail=(route,message)=>route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({code:'P0001',message})});
 await page.route('https://club-test.supabase.co/**',async route=>{
  const url=new URL(route.request().url()),path=url.pathname;let body={};try{body=route.request().postDataJSON()||{};}catch{}
  calls.push({path,body});let data=null;
  if(path.endsWith('/garzon_locations'))data=[local];
  else if(path.endsWith('/garzon_login'))data=body.password_value==='clave-del-local'?{device_token:'dev-token',location:local}:{error:'Local o clave incorrectos.'};
  else if(path.endsWith('/garzon_waiters'))data={location:local,waiters};
  else if(path.endsWith('/garzon_pin'))data=body.pin_value==='4321'&&body.waiter_value==='w-carla'?{waiter_token:'w-token',waiter:{id:'w-carla',name:'Carla',role:'manager'},expires_at:new Date(Date.now()+43200000).toISOString()}:{error:'PIN incorrecto.'};
  else if(path.endsWith('/garzon_open_table')){
   if(body.amount_value/body.people_value<5000)return fail(route,'Cada parte debe ser de al menos $5.000.');
   table={id:body.request_id,code:'K7M2Q9XD',amount:body.amount_value,people:body.people_value,part:Math.floor(body.amount_value/body.people_value),table_label:body.table_label_value,created_at:new Date().toISOString(),expires_at:new Date(Date.now()+600000).toISOString(),expired:false,cancelled:false,claimed:0,waiter:'Carla'};data=table;}
  else if(path.endsWith('/garzon_table')){polls++;if(polls>=2&&table.claimed<2)table={...table,claimed:table.claimed+1};data=table;}
  else if(path.endsWith('/garzon_renew_table'))data=table;
  else if(path.endsWith('/garzon_redeem')){
   if(!/^C[2-9A-HJ-NP-Z]{9}$/.test(body.code_value))return fail(route,'Código de canje no válido.');
   const r={id:'red-1',amount:5000,created_at:new Date().toISOString(),status:'used',voided_at:null,member:'Luis S.',waiter:'Carla',can_void:true};redemptions=[r];data={redemption_id:r.id,amount:5000,name:'Luis S.',already_used:false};}
  else if(path.endsWith('/garzon_scan_member'))data={purpose:'birthday',code:body.code_value,name:'Ana Rojas',birthday:'27/10/1995'};
  else if(path.endsWith('/garzon_birthday'))data={name:'Ana',ok:true};
  else if(path.endsWith('/garzon_day'))data={waiter:{id:'w-carla',name:'Carla',role:'manager'},tables:table?[table]:[],redemptions,birthdays:1};
  else if(path.endsWith('/garzon_void_redemption')){redemptions=redemptions.map(r=>({...r,status:'cancelled',voided_at:new Date().toISOString(),can_void:false}));data={id:'red-1',already_voided:false};}
  else if(path.endsWith('/garzon_team'))data=team;
  else if(path.endsWith('/garzon_save_waiter')){team=[...team,{id:'w-rocio',name:body.name_value,role:'waiter',active:true,locked:false}];data='w-rocio';}
  else if(path.endsWith('/garzon_logout'))data=null;
  else throw new Error('Unexpected test request: '+path);
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
 });
 const noOverflow=async label=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Mobile overflow: '+label);
 await mkdir('test/artifacts',{recursive:true});

 // 1. El local entra con su clave (una mala clave no deja entrar).
 await page.goto(base+'/garzon');await page.getByRole('heading',{name:'ENTRA CON TU LOCAL.'}).waitFor();
 await page.getByLabel('Clave del local').fill('mala');await page.getByRole('button',{name:'Entrar'}).click();await page.getByRole('status').filter({hasText:'Local o clave incorrectos.'}).waitFor();
 await page.screenshot({path:'test/artifacts/garzon-1-local.png',fullPage:true});
 await page.getByLabel('Clave del local').fill('clave-del-local');await page.getByRole('button',{name:'Entrar'}).click();
 // 2. ¿Quién atiende? y PIN.
 await page.getByRole('heading',{name:'¿QUIÉN ATIENDE?'}).waitFor();await noOverflow('quien');await page.screenshot({path:'test/artifacts/garzon-2-quien.png',fullPage:true});
 await page.getByRole('button',{name:/Carla/}).click();
 for(const k of ['0','0','0','0'])await page.locator(`[data-key="${k}"]`).click();await page.getByRole('button',{name:'Entrar',exact:true}).click();await page.getByRole('status').filter({hasText:'PIN incorrecto.'}).waitFor();
 for(const k of ['4','3','2','1'])await page.locator(`[data-key="${k}"]`).click();await page.screenshot({path:'test/artifacts/garzon-3-pin.png',fullPage:true});await page.getByRole('button',{name:'Entrar',exact:true}).click();
 // 3. Cobrar: total + personas → parte por persona → QR.
 await page.getByRole('heading',{name:'QR DE LA MESA.'}).waitFor();
 await page.getByLabel('Total de la cuenta').fill('16000');await page.locator('label.chip',{hasText:/^4$/}).click();
 await page.getByText(/El mínimo es \$5.000 por persona/).waitFor();
 await page.getByLabel('Total de la cuenta').fill('60000');await page.locator('label.chip',{hasText:/^3$/}).click();await page.getByLabel(/Mesa/).fill('7');
 await page.locator('#split').getByText('$20.000').waitFor();assert.equal(await page.getByLabel('Total de la cuenta').inputValue(),'60.000');
 await noOverflow('cobrar');await page.screenshot({path:'test/artifacts/garzon-4-cobrar.png',fullPage:true});
 await page.getByRole('button',{name:'Generar QR de la mesa'}).click();
 await page.getByRole('heading',{name:/\$20.000/}).waitFor();await page.getByText('K7M2-Q9XD').waitFor();await page.locator('.table-qr .qr svg').waitFor();
 const open=calls.find(c=>c.path.endsWith('/garzon_open_table')).body;assert.equal(open.amount_value,60000);assert.equal(open.people_value,3);assert.equal(open.table_label_value,'7');assert.equal(open.device_token,'dev-token');assert.equal(open.waiter_token,'w-token');
 await page.getByText('1 de 3').waitFor({timeout:12000});
 await noOverflow('qr');await page.screenshot({path:'test/artifacts/garzon-5-qr-mesa.png',fullPage:true});
 // La mesa activa sigue en pantalla al recargar.
 await page.reload();await page.getByText('K7M2-Q9XD').waitFor();
 // 4. Escanear: canje con código escrito a mano (la cámara no existe en Chromium sin cabeza).
 await page.getByRole('link',{name:'Escanear'}).click();await page.getByRole('heading',{name:'ESCANEA AL SOCIO.'}).waitFor();
 await page.getByLabel('O escribe el código').fill('C7KM2Q9XDA');await page.getByRole('button',{name:'Validar'}).click();
 await page.getByRole('heading',{name:'$5.000'}).waitFor();await page.getByText(/Informa a caja que descuente/).waitFor();
 await noOverflow('canje');await page.screenshot({path:'test/artifacts/garzon-6-canje.png',fullPage:true});
 // Cumpleaños: no se entrega sin revisar la cédula.
 await page.getByRole('button',{name:'Escanear otro'}).click();await page.getByLabel('O escribe el código').fill('B7KM2Q9XDA');await page.getByRole('button',{name:'Validar'}).click();
 await page.getByRole('heading',{name:'Ana Rojas'}).waitFor();await page.getByText('27/10/1995').waitFor();
 await page.getByRole('button',{name:'Entregar michelada de regalo'}).click();await page.getByRole('status').filter({hasText:/revisa la cédula/}).waitFor();assert.equal(calls.filter(c=>c.path.endsWith('/garzon_birthday')).length,0);
 await page.getByLabel(/Revisé la cédula/).check();await page.screenshot({path:'test/artifacts/garzon-7-cumple.png',fullPage:true});await page.getByRole('button',{name:'Entregar michelada de regalo'}).click();
 await page.getByRole('heading',{name:/Feliz cumpleaños, Ana/}).waitFor();
 // 5. Hoy: cuadratura y anulación del canje por la encargada.
 await page.getByRole('link',{name:'Hoy'}).click();await page.getByRole('heading',{name:'HOY EN EL LOCAL.'}).waitFor();await page.getByText('Luis S.',{exact:false}).waitFor();
 page.once('dialog',d=>d.accept('No se aplicó en caja'));await page.locator('[data-void-red]').click();await page.getByText(/ANULADO · coronas devueltas/).waitFor();
 assert.equal(calls.find(c=>c.path.endsWith('/garzon_void_redemption')).body.reason_value,'No se aplicó en caja');
 await noOverflow('hoy');await page.waitForTimeout(400);assert.equal(await page.locator('.g-list article.void').count(),1,'solo el canje anulado se ve tachado');await page.screenshot({path:'test/artifacts/garzon-8-hoy.png',fullPage:true});
 // 6. Equipo: la encargada agrega un garzón.
 await page.getByRole('link',{name:'Equipo'}).click();await page.getByRole('heading',{name:'TU EQUIPO.'}).waitFor();
 await page.getByLabel('Nombre').fill('Rocío');await page.getByLabel(/PIN de 4 a 6/).fill('2468');await page.getByRole('button',{name:'Agregar'}).click();await page.locator('.team-list').getByText('Rocío',{exact:true}).waitFor();
 await noOverflow('equipo');await page.screenshot({path:'test/artifacts/garzon-9-equipo.png',fullPage:true});
 // Cambiar de garzón vuelve a "¿Quién atiende?" sin pedir otra vez la clave del local.
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:/Cambiar de garzón/}).click();await page.getByRole('heading',{name:'¿QUIÉN ATIENDE?'}).waitFor();
 assert.deepEqual(errors,[]);
 console.log('Garzón: local login, PIN, split with $5.000 minimum, table QR and live claims, reload, redeem, birthday with ID check, day summary and manager void, team and switching waiter passed (simulated Supabase HTTP).');
}finally{await browser?.close();server.kill();}
