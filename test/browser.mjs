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
 const calls=[];let balance=5000,muted=false,sharing=true;
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
 else if(path==='/rest/v1/locations')data=[local];
 else if(path==='/rest/v1/profiles')data={id:martin,first_name:'Martín',last_name:'Soto',rut:'123456785',phone:'+56912345678',birthday:'1990-10-08',member_code:'ABCDEF123456',share_activity:sharing};
 else if(path==='/rest/v1/notifications')data=[];
 else if(path==='/rest/v1/ledger'||path==='/rest/v1/redemptions')data=[];
 else if(path.endsWith('/my_wallet'))data={balance,pending:2400,debt:0,spending:30000,tier:'Plebeyo',pct:8};
 else if(path.endsWith('/my_staff_role'))data=null;
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
 await page.setViewportSize({width:1440,height:1000});await page.goto(base);await page.getByText('HOLA, MARTÍN').waitFor();await page.screenshot({path:'test/artifacts/inicio-desktop.png',fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 assert.deepEqual(errors,[]);console.log('Browser: registration validation, confirmation, login, recovery, menu-open notification, friend mute, invite, transfer, 10 mobile routes and desktop layout passed (simulated Supabase HTTP).');
}finally{await browser?.close();server.kill();}
