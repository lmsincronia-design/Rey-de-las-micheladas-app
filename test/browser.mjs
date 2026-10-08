// Browser integration with a simulated Supabase HTTP boundary. Real PostgreSQL RPCs are tested separately.
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import assert from 'node:assert/strict';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','4175','--strictPort'],{env:{...process.env,VITE_SUPABASE_URL:'https://club-test.supabase.co',VITE_SUPABASE_ANON_KEY:'test-public-key'}});
const base='http://127.0.0.1:4175';
let browser;
try{
 await new Promise((resolve,reject)=>{server.stdout.on('data',d=>{if(String(d).includes('4175'))resolve();});server.stderr.on('data',d=>process.stderr.write(d));server.on('exit',code=>reject(new Error(`Vite exited ${code}`)));setTimeout(()=>reject(new Error('Vite startup timeout')),10000).unref();});
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':chromium.executablePath()),headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:390,height:844},locale:'es-CL'});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.routeWebSocket('wss://club-test.supabase.co/**',ws=>ws.close());
 const martin='00000000-0000-4000-8000-000000000001',luis='00000000-0000-4000-8000-000000000002';
 const calls=[];let balance=5000,pending=1200,muted=false,sharing=true,isAdmin=false;const credits=[];let pilot=null;
 const token=`${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({sub:martin,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')}.test`;
 const user={id:martin,aud:'authenticated',role:'authenticated',email:'martin@example.test',email_confirmed_at:new Date().toISOString(),user_metadata:{},app_metadata:{provider:'email'},created_at:new Date().toISOString()};
 const local={id:'10000000-0000-4000-8000-000000000001',name:'Local de prueba',address:'Dirección de prueba',commune:'Santiago',menu_url:'https://qrfy.io/p/oOBx-dlqTy',active:true,verified:true};
 await page.route('https://club-test.supabase.co/**',async route=>{
 const request=route.request(),url=new URL(request.url()),path=url.pathname;let body={};try{body=request.postDataJSON()||{};}catch{}
 calls.push({path,body});let data={};
 if(path.endsWith('/token'))data={access_token:token,refresh_token:'test-refresh',expires_in:3600,token_type:'bearer',user};
 else if(path.endsWith('/user'))data=user;
 else if(path.endsWith('/logout')||path.endsWith('/recover'))data={};
 else if(path.endsWith('/signup'))data={id:martin,user};
 else if(path==='/rest/v1/locations')data=pilot?.enabled&&request.headers().authorization===`Bearer ${token}`?[local,{...local,id:'70000000-0000-4000-8000-000000000001',name:'Rey de pruebas · NO ES UN LOCAL REAL',is_test:true}]:[local];
 else if(path==='/rest/v1/profiles')data={id:martin,first_name:'Martín',last_name:'Soto',rut:'123456785',phone:'+56912345678',birthday:'1990-10-08',member_code:'ABCDEF123456',share_activity:sharing};
 else if(path==='/rest/v1/notifications')data=[];
 else if(path==='/rest/v1/ledger'||path==='/rest/v1/redemptions')data=[];
 else if(path.endsWith('/my_wallet'))data={balance,pending,debt:0,spending:30000,tier:'Plebeyo',pct:4};
 else if(path.endsWith('/my_staff_role'))data=isAdmin?{role:'admin',location_id:null}:null;
 else if(path.endsWith('/admin_summary'))data={members:2,friends:1,balance,pending:1200,receipts:1,locations:1};
 else if(path.endsWith('/admin_locations'))data=[local];
 else if(path.endsWith('/admin_members'))data=[{member_code:'ABCDEF123456',first_name:'Martín',last_name:'Soto',balance},{member_code:'123456ABCDEF',first_name:'Luis',last_name:'Soto',balance:3000}];
 else if(path.endsWith('/admin_credit_crowns')){balance+=body.amount_value;credits.push({id:body.request_id,member_code:body.code_value,member_name:'Martín S.',admin_name:'Martín S.',amount:body.amount_value,reason:body.reason_value,created_at:new Date().toISOString()});data={id:body.request_id,amount:body.amount_value,balance,already_applied:false};}
 else if(path.endsWith('/admin_credit_history'))data=credits;
 else if(path.endsWith('/my_table_checkouts')||path.endsWith('/my_receipt_tables'))data=[];
 else if(path.endsWith('/my_test_pilot'))data=pilot||{enabled:false,is_admin:isAdmin};
 else if(path.endsWith('/admin_prepare_test_pilot')){balance+=5000;pilot={enabled:true,configured:true,is_admin:true,participant:true,martin_code:body.martin_code,luis_code:body.luis_code,location_id:local.id,vouchers:[15000,30000,60000,90000,120000].map(amount=>({code:'PRUEBA-'+amount,amount,claimed:false}))};data=pilot;}
 else if(path.endsWith('/claim_test_receipt')){const v=pilot.vouchers.find(v=>v.code===body.code_value);if(!v){await route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({message:'Código de boleta de prueba no encontrado'})});return;}data={amount:v.amount,earned:2400,already_claimed:v.claimed};if(!v.claimed)pending+=2400;v.claimed=true;v.member_name='Martín';}
 else if(path.endsWith('/admin_close_test_pilot')){pilot.enabled=false;data=null;}
 else if(path.endsWith('/my_friends'))data=[{id:'20000000-0000-4000-8000-000000000001',other_id:luis,first_name:'Luis',last_name:'S.',status:'accepted',incoming:false,muted}];
 else if(path.endsWith('/mute_friend')){muted=body.muted_value;data=null;}
 else if(path.endsWith('/transfer_crowns')){balance-=body.amount_value;data=body.request_id;}
 else if(path.endsWith('/set_activity_sharing')){sharing=body.enabled;data=null;}
 else if(path.endsWith('/announce_location'))data=true;
 else if(path.endsWith('/request_friend'))data=null;
 else throw new Error('Unexpected test request: '+path);
 await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
 });
 await page.goto(base);await page.getByRole('heading',{name:/LA BUENA/}).waitFor();
 await page.getByRole('link',{name:'Unirme al Club'}).click();await page.getByRole('heading',{name:'Crear cuenta',exact:true}).waitFor();
 await page.getByLabel('Nombre',{exact:true}).fill('Martín');await page.getByLabel('Apellido',{exact:true}).fill('Soto');await page.getByLabel('RUT',{exact:true}).fill('12.345.678-9');await page.getByLabel('Celular',{exact:true}).fill('+56912345678');await page.getByLabel('Fecha de nacimiento').fill('1990-10-08');await page.getByLabel('Correo electrónico').fill('martin@example.test');await page.getByLabel('Contraseña (mínimo').fill('UnaClaveSegura123');await page.getByLabel('Repite tu contraseña').fill('UnaClaveSegura123');await page.getByRole('checkbox',{name:/Soy mayor/}).check();await page.getByRole('button',{name:/Crear mi cuenta/}).click();await page.getByRole('status').filter({hasText:/Revisa el RUT/}).waitFor();assert.equal(calls.filter(c=>c.path.endsWith('/signup')).length,0);
 await page.getByLabel('RUT',{exact:true}).fill('12.345.678-5');await page.getByRole('button',{name:/Crear mi cuenta/}).click();await page.getByText('Revisa tu correo para confirmar la cuenta.').waitFor();
 const signup=calls.find(c=>c.path.endsWith('/signup'));assert.equal(signup.body.data.rut,'123456785');assert.equal(signup.body.data.phone,'+56912345678');
 await page.goto(base+'/olvide-contrasena');await page.getByLabel('Correo electrónico').fill('martin@example.test');await page.getByRole('button',{name:'Enviar enlace →'}).click();await page.getByText(/Si existe una cuenta/).waitFor();
 await page.goto(base+'/entrar');await page.getByLabel('Correo electrónico').fill('martin@example.test');await page.getByLabel('Contraseña',{exact:true}).fill('UnaClaveSegura123');await page.getByRole('button',{name:'Entrar al Club →'}).click();await page.getByText('HOLA, MARTÍN').waitFor();
 await page.goto(base+'/locales');await page.getByRole('heading',{name:'ELIGE TU REY.'}).waitFor();
 const initial=calls.filter(c=>c.path.endsWith('/announce_location')).length;
 await page.getByLabel('Comuna',{exact:true}).selectOption('Santiago');assert.equal(calls.filter(c=>c.path.endsWith('/announce_location')).length,initial);
 // Stop external navigation at the browser boundary; verify the click invokes the notification RPC.
 await context.route('https://qrfy.io/**',r=>r.fulfill({status:200,contentType:'text/html',body:'<h1>Carta oficial (prueba)</h1>'}));
 await page.getByRole('button',{name:'Abrir carta ↗'}).click();await page.getByRole('status').filter({hasText:/recibieron el aviso/}).waitFor();assert.equal(calls.filter(c=>c.path.endsWith('/announce_location')).length,initial+1);
 await page.goto(base+'/amigos');await page.getByRole('heading',{name:'TU GENTE, EN EL CLUB.'}).waitFor();await page.getByRole('button',{name:'Silenciar a Luis'}).click();await page.getByText('Avisos de actividad silenciados').waitFor();assert.equal(muted,true);
 await page.getByLabel('Código de tu amigo').fill('123456ABCDEF');await page.getByRole('button',{name:'Enviar solicitud →'}).click();await page.getByRole('status').filter({hasText:/Solicitud enviada/}).waitFor();
 await page.getByRole('link',{name:'Enviar',exact:true}).click();await page.getByLabel('Coronas a enviar').fill('2000');page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Enviar coronitas 👑'}).click();await page.getByRole('heading',{name:'♛ $3.000'}).waitFor();assert.equal(balance,3000);assert.equal(calls.filter(c=>c.path.endsWith('/transfer_crowns')).length,1);
 await mkdir('test/artifacts',{recursive:true});await page.screenshot({path:'test/artifacts/coronas-mobile.png',fullPage:true});
 for(const path of ['/','/locales','/amigos','/coronas','/perfil','/notificaciones','/codigo','/rangos','/admin','/caja']){await page.goto(base+path);await page.locator('main h1').waitFor();await page.waitForTimeout(80);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Mobile overflow: '+path);}
 isAdmin=true;await page.goto(base+'/admin');await page.getByRole('heading',{name:'Acreditar coronas',exact:true}).waitFor();
 await page.getByLabel('Código del socio a acreditar').fill('ABCDEF123456');await page.getByLabel('Coronas a acreditar').fill('5000');await page.getByLabel('Motivo de la acreditación').fill('Prueba entre amigos');
 page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'Acreditar coronas',exact:true}).click();assert.equal(calls.filter(c=>c.path.endsWith('/admin_credit_crowns')).length,0);
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Acreditar coronas',exact:true}).click();await page.getByRole('status').filter({hasText:/coronas acreditadas/}).waitFor();assert.equal(balance,8000);
 await page.getByText('Ver últimas acreditaciones').click();await page.locator('#credit-history').getByText(/Prueba entre amigos/).waitFor();assert.equal(credits.length,1);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Admin credit mobile overflow');await page.screenshot({path:'test/artifacts/admin-coronas-mobile.png',fullPage:true});
 await page.goto(base+'/coronas');await page.getByRole('heading',{name:'♛ $8.000'}).waitFor();
 await page.goto(base+'/pruebas');await page.getByRole('heading',{name:'Preparar Martín y Luis'}).waitFor();
 await page.getByLabel('Cuenta de Martín').selectOption('ABCDEF123456');await page.getByLabel('Cuenta de Luis').selectOption('123456ABCDEF');page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Preparar las cinco boletas'}).click();await page.getByRole('heading',{name:'Las cinco boletas'}).waitFor();assert.equal(balance,13000);
 await page.goto(base+'/coronas');await page.getByRole('heading',{name:'Ingresa tu boleta',exact:true}).waitFor();
 const walletOrder=await page.locator('.balance-card h2,.wallet-actions h2').allTextContents();assert.deepEqual(walletOrder,['♛ $13.000','Ingresa tu boleta','Usarlas en una junta','Coronas para un amigo']);
 await page.getByLabel('Código de la boleta').fill('PRUEBA-NOEXISTE');await page.getByRole('button',{name:'Canjear boleta',exact:true}).click();await page.getByRole('status').filter({hasText:/no encontrado/}).waitFor();assert.equal(balance,13000);
 await page.getByLabel('Código de la boleta').fill('PRUEBA-60000');await page.getByRole('button',{name:'Canjear boleta',exact:true}).click();await page.getByRole('status').filter({hasText:/Boleta canjeada/}).waitFor();assert.equal(balance,13000);assert.equal(pending,3600);
 await page.getByText(/\$3.600 por activar/).waitFor();assert.equal(await page.getByRole('button',{name:'Activar mis coronas de prueba'}).count(),0);
 await page.getByLabel('Código de la boleta').fill('PRUEBA-60000');await page.getByRole('button',{name:'Canjear boleta',exact:true}).click();await page.getByRole('status').filter({hasText:/Ya habías canjeado/}).waitFor();assert.equal(pending,3600);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Wallet receipt mobile overflow');await page.screenshot({path:'test/artifacts/coronas-boleta-mobile.png',fullPage:true});
 await page.setViewportSize({width:1440,height:1000});
 const boxes=await page.locator('.wallet-actions > section').evaluateAll(items=>items.map(item=>{const r=item.getBoundingClientRect();return {top:r.top,bottom:r.bottom};}));assert.ok(boxes[1].top>=boxes[0].bottom&&boxes[2].top>=boxes[1].bottom,'Wallet actions must remain stacked on desktop');
 await page.screenshot({path:'test/artifacts/coronas-boleta-desktop.png',fullPage:true});await page.setViewportSize({width:390,height:844});
 await page.goto(base+'/pruebas');await page.getByText('Canjeada por Martín').waitFor();
 await page.goto(base+'/perfil');await page.getByRole('button',{name:'Cerrar sesión',exact:true}).click();await page.getByRole('link',{name:'Unirme al Club'}).waitFor();await page.getByRole('link',{name:'Ver la carta ↗',exact:true}).click();assert.equal(await page.getByText('Rey de pruebas · NO ES UN LOCAL REAL',{exact:true}).count(),0);
 await page.goto(base+'/entrar');await page.getByLabel('Correo electrónico').fill('martin@example.test');await page.getByLabel('Contraseña',{exact:true}).fill('UnaClaveSegura123');await page.getByRole('button',{name:'Entrar al Club →'}).click();await page.getByText('HOLA, MARTÍN').waitFor();await page.getByRole('heading',{name:'Rey de pruebas · NO ES UN LOCAL REAL',exact:true}).waitFor();
 await page.goto(base+'/pruebas');page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Cerrar la prueba',exact:true}).click();await page.getByText('PRUEBA CERRADA',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Canjear boleta',exact:true}).count(),0);
 await page.goto(base+'/rangos');await page.getByRole('heading',{name:'Guardia Real',exact:true}).waitFor();for(const pct of [4,6,8,10,12])await page.getByText(pct+'%',{exact:true}).waitFor();
 await page.goto(base+'/carta-prueba');await page.getByRole('heading',{name:'LA JUNTA DE PRUEBA.'}).waitFor();
 await page.setViewportSize({width:1440,height:1000});await page.goto(base);await page.getByText('HOLA, MARTÍN').waitFor();await page.screenshot({path:'test/artifacts/inicio-desktop.png',fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 assert.deepEqual(errors,[]);console.log('Browser: registration validation, confirmation, login, recovery, menu-open notification, friend mute, invite, transfer, admin credit confirmation/cancel/history, pilot setup/closure, wallet receipt claim/retry/pending balance and vertical order, new tiers, test menu, 10 mobile routes and desktop layout passed (simulated Supabase HTTP).');
}finally{await browser?.close();server.kill();}
