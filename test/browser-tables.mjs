// UI integration across payer and guest browsers; SQL accounting is tested in database.test.js.
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','4176','--strictPort'],{env:{...process.env,VITE_SUPABASE_URL:'https://table-test.supabase.co',VITE_SUPABASE_ANON_KEY:'test-public-key'}});
const base='http://127.0.0.1:4176',shareToken='abcdef0123456789abcdef0123456789',checkoutCode='M123456789AB';
let browser;
try{
 await new Promise((resolve,reject)=>{server.stdout.on('data',d=>{if(String(d).includes('4176'))resolve();});server.stderr.on('data',d=>process.stderr.write(d));server.on('exit',c=>reject(new Error('Vite exited '+c)));setTimeout(()=>reject(new Error('Startup timeout')),10000).unref();});
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':chromium.executablePath()),headless:true,args:['--no-sandbox']});
 const payer={id:'90000000-0000-4000-8000-000000000001',email:'payer@example.test',user_metadata:{first_name:'Luis'}},guest={id:'90000000-0000-4000-8000-000000000002',email:'guest@example.test',user_metadata:{first_name:'Ana'}};
 const local={id:'10000000-0000-4000-8000-000000000001',name:'Local de prueba',commune:'Pruebas',address:'Local ficticio',menu_url:'https://qrfy.io/p/oOBx-dlqTy'};
 const users=[payer,guest];const tokenExpiry=Math.floor(Date.now()/1000)+3600;const jwt=u=>`${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({sub:u.id,exp:tokenExpiry})).toString('base64url')}.test`;
 const checkouts=[],receipts=[],calls=[],errors=[];let guestClaimed=false,guestCredits=0;
 const deadline=new Date(Date.now()+86400000).toISOString();
 async function newPage(){
  const context=await browser.newContext({viewport:{width:390,height:844},locale:'es-CL',permissions:['clipboard-read','clipboard-write']});
  await context.routeWebSocket('wss://table-test.supabase.co/**',ws=>ws.close());
  await context.route('https://table-test.supabase.co/**',async route=>{
   const request=route.request(),path=new URL(request.url()).pathname;let body={};try{body=request.postDataJSON()||{};}catch{}
   calls.push({path,body});const member=users.find(u=>request.headers().authorization===`Bearer ${jwt(u)}`);let data={};
   if(path.endsWith('/token')){const user=users.find(u=>u.email===body.email)||guest;data={access_token:jwt(user),refresh_token:'refresh-'+user.id,expires_in:3600,token_type:'bearer',user:{...user,aud:'authenticated',role:'authenticated'}};}
   else if(path.endsWith('/signup')){guest.user_metadata=body.data;data={user:guest};}
   else if(path.endsWith('/user')){if(request.method()==='PUT')member.user_metadata={...member.user_metadata,...body.data};data=member;}
   else if(path.endsWith('/logout'))data={};
   else if(path==='/rest/v1/locations')data=[local];
   else if(path==='/rest/v1/profiles')data={id:member.id,first_name:member.user_metadata.first_name,last_name:'Prueba',rut:'111111111',birthday:'1990-01-01',phone:'+56912345678',member_code:member===payer?'AAAAAAAAAAAA':'BBBBBBBBBBBB',share_activity:false};
   else if(path==='/rest/v1/notifications'||path==='/rest/v1/ledger'||path==='/rest/v1/redemptions')data=[];
   else if(path.endsWith('/my_wallet'))data={balance:0,pending:member===payer?(receipts.length?1200:0):guestCredits,spending:member===payer?(receipts.length?80000:60000):(guestClaimed?20000:0),tier:member===payer?'Comerciante':'Plebeyo',pct:member===payer?6:4,debt:0};
   else if(path.endsWith('/my_friends'))data=[];
   else if(path.endsWith('/my_staff_role'))data=member===payer?{role:'admin',location_id:null}:null;
   else if(path.endsWith('/my_test_pilot'))data={enabled:false,is_admin:member===payer};
   else if(path.endsWith('/my_table_checkouts'))data=member===payer?checkouts.filter(t=>!t.receipt_id):[];
   else if(path.endsWith('/my_receipt_tables'))data=member===payer?receipts:[];
   else if(path.endsWith('/prepare_table')){data={id:body.request_id,code:checkoutCode,people:body.people_value,expires_at:deadline};checkouts.push(data);}
   else if(path.endsWith('/staff_member'))data={name:'Luis P.',balance:0,pending:0,table_code:checkoutCode,people:5};
   else if(path.endsWith('/staff_sale')){assert.equal(body.people_value,5);assert.equal(body.amount_value,100000);assert.deepEqual(body.codes,[checkoutCode]);checkouts[0].receipt_id='receipt-test';receipts.push({token:shareToken,expires_at:new Date(Date.now()+7*86400000).toISOString(),folio:body.folio,amount:100000,people:5,part:20000,claimed:1,location_name:local.name,created_at:new Date().toISOString()});data='receipt-test';}
   else if(path.endsWith('/table_share_info'))data={amount:100000,people:5,part:20000,remaining:guestClaimed?3:4,expires_at:deadline,cancelled:false,expired:false,location_name:local.name,claimed:member===guest&&guestClaimed,earned:member===guest&&guestClaimed?800:null,available_at:deadline};
   else if(path.endsWith('/claim_table_share')){assert.equal(member?.id,guest.id);const already=guestClaimed;guestClaimed=true;guestCredits=800;data={earned:800,part:20000,pct:4,available_at:deadline,already_claimed:already};}
   else throw new Error('Unexpected table request '+path);
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));return {context,page};
 }
 async function login(page,email){await page.goto(base+'/entrar');await page.getByLabel('Correo electrónico').fill(email);await page.getByLabel('Contraseña',{exact:true}).fill('UnaClaveSegura123');await page.getByRole('button',{name:'Entrar al Club →'}).click();}
 const host=await newPage();await login(host.page,payer.email);await host.page.getByText('HOLA, LUIS').waitFor();
 await host.page.getByRole('link',{name:/Rango Comerciante/}).waitFor();assert.equal(await host.page.getByRole('progressbar',{name:'Progreso del rango'}).getAttribute('aria-valuenow'),'10');
 assert.match(await host.page.locator('.hero-photo img').getAttribute('src'),/foto-junta-rey/);
 await host.page.getByRole('link',{name:'Mi código y mi mesa'}).click();await host.page.getByLabel('Personas en la mesa, incluyéndote').fill('5');await host.page.getByRole('button',{name:'Preparar código para caja'}).click();await host.page.getByText(checkoutCode,{exact:true}).waitFor();
 await host.page.goto(base+'/caja');await host.page.getByLabel('Código de socio o de mesa').fill(checkoutCode);await host.page.getByRole('button',{name:'Consultar',exact:true}).click();await host.page.getByText('Mesa de 5 personas',{exact:true}).waitFor();
 assert.equal(await host.page.getByLabel('Personas de la mesa').inputValue(),'5');await host.page.getByLabel('Folio de boleta',{exact:true}).fill('MESA-100000');await host.page.getByLabel('Total cobrado (con descuento)').fill('100000');await host.page.getByRole('button',{name:'Registrar y acreditar'}).click();await host.page.getByRole('status').filter({hasText:/Boleta registrada/}).waitFor();
 await host.page.goto(base+'/coronas');await host.page.getByRole('heading',{name:'LAS CORONAS DE TU MESA'}).waitFor();await host.page.getByText('$20.000 por persona',{exact:true}).waitFor();await host.page.getByRole('button',{name:'Copiar enlace',exact:true}).click();const shared=await host.page.evaluate(()=>navigator.clipboard.readText());assert.equal(shared,base+'/mesa?codigo='+shareToken);
 await mkdir('test/artifacts',{recursive:true});await host.page.screenshot({path:'test/artifacts/mesa-pagador-mobile.png',fullPage:true});
 await host.page.goto(base+'/rangos');await host.page.getByRole('heading',{name:'Guardia Real',exact:true}).waitFor();assert.ok(await host.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await host.page.screenshot({path:'test/artifacts/rangos-mobile.png',fullPage:true});
 await host.page.setViewportSize({width:1440,height:1000});await host.page.screenshot({path:'test/artifacts/rangos-desktop.png',fullPage:true});await host.page.goto(base);await host.page.getByText('HOLA, LUIS').waitFor();await host.page.screenshot({path:'test/artifacts/portada-nueva-desktop.png',fullPage:true});
 const invited=await newPage();await invited.page.goto(shared);await invited.page.getByRole('heading',{name:'$20.000 de consumo para ti'}).waitFor();await invited.page.getByRole('link',{name:'Crear cuenta y recibir coronas'}).click();
 await invited.page.getByLabel('Nombre',{exact:true}).fill('Ana');await invited.page.getByLabel('Apellido',{exact:true}).fill('Prueba');await invited.page.getByLabel('RUT',{exact:true}).fill('11.111.111-1');await invited.page.getByLabel('Celular',{exact:true}).fill('+56912345678');await invited.page.getByLabel('Fecha de nacimiento').fill('1990-01-01');await invited.page.getByLabel('Correo electrónico').fill(guest.email);await invited.page.getByLabel('Contraseña (mínimo').fill('UnaClaveSegura123');await invited.page.getByLabel('Repite tu contraseña').fill('UnaClaveSegura123');await invited.page.getByRole('checkbox',{name:/Soy mayor/}).check();await invited.page.getByRole('button',{name:/Crear mi cuenta/}).click();await invited.page.getByText('Revisa tu correo para confirmar la cuenta.').waitFor();assert.equal(guest.user_metadata.table_invite,shareToken);
 // Simulate email confirmation followed by login in another browser with no local storage.
 await invited.context.close();const confirmed=await newPage();await login(confirmed.page,guest.email);await confirmed.page.getByRole('heading',{name:'Tu parte ya está registrada 👑'}).waitFor();assert.match(confirmed.page.url(),/\/mesa\?codigo=/);await confirmed.page.getByText('$800 en coronas',{exact:true}).waitFor();assert.equal(guestCredits,800);
 await confirmed.page.reload();await confirmed.page.getByRole('heading',{name:'Tu parte ya está registrada 👑'}).waitFor();assert.equal(guestCredits,800);
 await confirmed.page.getByRole('link',{name:'Ver mis coronas',exact:true}).click();await confirmed.page.getByRole('heading',{name:'♛ $0'}).waitFor();await confirmed.page.getByText(/\$800 por activar/).waitFor();await confirmed.page.getByRole('link',{name:/Rango Plebeyo/}).waitFor();
 assert.ok(await confirmed.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);
 console.log('Tables browser: party size → cashier total → payer link → new guest signup → login in a new browser → own Plebeyo share pending 24h, idempotent reload, new photo and rank progress passed (simulated Supabase HTTP).');
}finally{await browser?.close();server.kill();}
