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
 const calls=[];let balance=5000,pending=1200,muted=false,sharing=true,isAdmin=false;
 let rankingVisible=false;const credits=[];let pilot=null;let redeemCodes=0,statusChecks=0,redeemed=false,tableClaimed=false;
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
 else if(path==='/rest/v1/profiles')data={id:martin,first_name:'Martín',last_name:'Soto',rut:'123456785',phone:'+56912345678',birthday:'1990-10-08',member_code:'ABCDEF123456',share_activity:sharing,ranking_visible:rankingVisible};
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
 else if(path.endsWith('/club_ranking'))data={total:128,limit:10,visible:rankingVisible,top:[{position:1,name:'Cote M.',tier:'Rey',me:false},{position:2,name:null,tier:'Noble',me:false}],me:{position:27,tier:'Plebeyo',gap:38500,gap_top:112000}};
 else if(path.endsWith('/set_ranking_visibility')){rankingVisible=body.enabled;data=null;}
 else if(path.endsWith('/request_friend'))data=null;
 else if(path.endsWith('/my_birthday'))data={today:false,claimed:false};
 else if(path.endsWith('/admin_local_access'))data=[{id:local.id,name:local.name,is_test:false,active:true,has_access:true,locked:false,devices:1,waiters:[{id:'w1',name:'Carla',role:'manager',active:true}]}];
 else if(path.endsWith('/redeem_qr')){redeemCodes++;data={code:'C7KM2Q9XD'+'ABCDEFGH'[redeemCodes%8],amount:body.amount_value,expires_at:new Date(Date.now()+30000).toISOString(),now:new Date().toISOString()};}
 else if(path.endsWith('/member_qr_status')){statusChecks++;const used=statusChecks>=2;if(used&&!redeemed){redeemed=true;balance-=5000;}data={used,expired:false,amount:5000,purpose:'redeem',location_name:used?'Local de prueba':null};}
 else if(path.endsWith('/table_qr_info'))data={code:'K7M2Q9XD',amount:60000,people:3,part:20000,remaining:tableClaimed?2:3,expires_at:new Date(Date.now()+600000).toISOString(),expired:false,cancelled:false,table_label:'7',location_name:'Local de prueba',claimed:tableClaimed,earned:tableClaimed?800:null,available_at:tableClaimed?new Date(Date.now()+86400000).toISOString():null};
 else if(path.endsWith('/claim_table_qr')){const again=tableClaimed;if(!tableClaimed){tableClaimed=true;pending+=800;}data={earned:800,part:20000,pct:4,tier:'Plebeyo',available_at:new Date(Date.now()+86400000).toISOString(),already_claimed:again};}
 else throw new Error('Unexpected test request: '+path);
 await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
 });
 await page.goto(base);await page.getByRole('heading',{name:/LA BUENA/}).waitFor();
 await page.getByRole('link',{name:'Unirme al Club'}).click();await page.getByRole('heading',{name:'Crear cuenta',exact:true}).waitFor();
 // Registro sin RUT y con celular opcional (propuesta oct-2026): un celular mal escrito sí se rechaza.
 assert.equal(await page.getByLabel('RUT',{exact:true}).count(),0);
 await page.getByLabel('Nombre',{exact:true}).fill('Martín');await page.getByLabel('Apellido',{exact:true}).fill('Soto');await page.getByLabel(/Celular/).fill('12345');await page.getByLabel('Fecha de nacimiento').fill('1990-10-08');await page.getByLabel('Correo electrónico').fill('martin@example.test');await page.getByLabel('Contraseña (mínimo').fill('UnaClaveSegura123');await page.getByLabel('Repite tu contraseña').fill('UnaClaveSegura123');await page.getByRole('checkbox',{name:/Soy mayor/}).check();await page.getByRole('button',{name:/Crear mi cuenta/}).click();await page.getByRole('status').filter({hasText:/celular chileno/}).waitFor();assert.equal(calls.filter(c=>c.path.endsWith('/signup')).length,0);
 await page.getByLabel(/Celular/).fill('');await page.getByRole('button',{name:/Crear mi cuenta/}).click();await page.getByText('Revisa tu correo para confirmar la cuenta.').waitFor();
 const signup=calls.find(c=>c.path.endsWith('/signup'));assert.equal('rut' in signup.body.data,false);assert.equal(signup.body.data.phone,null);assert.equal(signup.body.data.birthday,'1990-10-08');
 await page.goto(base+'/olvide-contrasena');await page.getByLabel('Correo electrónico').fill('martin@example.test');await page.getByRole('button',{name:'Enviar enlace →'}).click();await page.getByText(/Si existe una cuenta/).waitFor();
 await page.goto(base+'/entrar');await page.getByLabel('Correo electrónico').fill('martin@example.test');await page.getByLabel('Contraseña',{exact:true}).fill('UnaClaveSegura123');await page.getByRole('button',{name:'Entrar al Club →'}).click();await page.getByText('HOLA, MARTÍN').waitFor();
 await page.goto(base+'/locales');await page.getByRole('heading',{name:'ELIGE TU REY.'}).waitFor();
 const initial=calls.filter(c=>c.path.endsWith('/announce_location')).length;
 await page.getByLabel('Comuna',{exact:true}).selectOption('Santiago');assert.equal(calls.filter(c=>c.path.endsWith('/announce_location')).length,initial);
 // Stop external navigation at the browser boundary; verify the click invokes the notification RPC.
 await context.route('https://qrfy.io/**',r=>r.fulfill({status:200,contentType:'text/html',body:'<h1>Carta oficial (prueba)</h1>'}));
 const [cartaPopup]=await Promise.all([page.waitForEvent('popup'),page.getByRole('button',{name:/Ver la carta de Local de prueba/}).click()]);
 {const u=new URL(cartaPopup.url());assert.equal(u.pathname,'/carta/index.html');assert.equal(u.searchParams.get('from'),'club');assert.match(u.searchParams.get('local'),/Local de prueba/);await cartaPopup.close();}
 await page.getByRole('status').filter({hasText:/recibieron el aviso/}).waitFor();assert.equal(calls.filter(c=>c.path.endsWith('/announce_location')).length,initial+1);
 // Ranking: chip TOP junto al rango, podio real, tu posición y activar el nombre público
 await page.goto(base+'/ranking');await page.getByRole('heading',{name:'EL TOP 10 DEL REY.'}).waitFor();
 await page.locator('.header-top').filter({hasText:'TOP 27'}).waitFor();
 {const fit=await page.evaluate(()=>{const box=document.querySelector('.header-rank').getBoundingClientRect();return [...document.querySelectorAll('.header-rank-top > *')].map(e=>e.getBoundingClientRect().right<=box.right+0.5);});assert.ok(fit.every(Boolean),'El rango, el chip TOP y el % deben caber dentro del recuadro de la cabecera en móvil: '+fit);}
 await page.getByText('Cote M.').first().waitFor();await page.getByText('Socio anónimo').first().waitFor();
 await page.getByRole('heading',{name:/TOP 27/}).waitFor();await page.getByText('112.000').waitFor();
 assert.equal(await page.locator('.demo-banner').filter({hasText:'VISTA DE EJEMPLO'}).count(),0,'con datos reales no se muestra el banner de ejemplo');
 await page.getByLabel('Mostrar mi nombre en el ranking').check();await page.getByRole('status').filter({hasText:/apareces con tu nombre/}).waitFor();assert.equal(rankingVisible,true);
 await page.getByRole('button',{name:'Ver ejemplo con perfiles ficticios'}).click();await page.getByText('VISTA DE EJEMPLO').waitFor();await page.getByText('Nacho R.').first().waitFor();
 await page.goto(base+'/amigos');await page.getByRole('heading',{name:'TU GENTE, EN EL CLUB.'}).waitFor();await page.getByRole('button',{name:'Silenciar a Luis'}).click();await page.getByText('Avisos de actividad silenciados').waitFor();assert.equal(muted,true);
 await page.getByLabel('Código de tu amigo').fill('123456ABCDEF');await page.getByRole('button',{name:'Enviar solicitud →'}).click();await page.getByRole('status').filter({hasText:/Solicitud enviada/}).waitFor();
 await page.getByRole('link',{name:'Enviar',exact:true}).click();await page.getByLabel('Coronas a enviar').fill('2000');page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Enviar coronas',exact:true}).click();await page.getByRole('heading',{name:'$3.000'}).waitFor();assert.equal(balance,3000);assert.equal(calls.filter(c=>c.path.endsWith('/transfer_crowns')).length,1);
 await mkdir('test/artifacts',{recursive:true});await page.screenshot({path:'test/artifacts/coronas-mobile.png',fullPage:true});
 for(const path of ['/','/locales','/amigos','/coronas','/perfil','/notificaciones','/codigo','/rangos','/ranking','/admin','/caja']){await page.goto(base+path);await page.locator('main h1').waitFor();await page.waitForTimeout(80);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Mobile overflow: '+path);}
 isAdmin=true;await page.goto(base+'/admin');await page.getByRole('heading',{name:'Acreditar coronas',exact:true}).waitFor();
 await page.getByLabel('Código del socio a acreditar').fill('ABCDEF123456');await page.getByLabel('Coronas a acreditar').fill('5000');await page.getByLabel('Motivo de la acreditación').fill('Prueba entre amigos');
 page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'Acreditar coronas',exact:true}).click();assert.equal(calls.filter(c=>c.path.endsWith('/admin_credit_crowns')).length,0);
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Acreditar coronas',exact:true}).click();await page.getByRole('status').filter({hasText:/coronas acreditadas/}).waitFor();assert.equal(balance,8000);
 await page.getByText('Ver últimas acreditaciones').click();await page.locator('#credit-history').getByText(/Prueba entre amigos/).waitFor();assert.equal(credits.length,1);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Admin credit mobile overflow');await page.screenshot({path:'test/artifacts/admin-coronas-mobile.png',fullPage:true});
 await page.goto(base+'/coronas');await page.getByRole('heading',{name:'$8.000'}).waitFor();
 await page.goto(base+'/pruebas');await page.getByRole('heading',{name:'Preparar Martín y Luis'}).waitFor();
 await page.getByLabel('Cuenta de Martín').selectOption('ABCDEF123456');await page.getByLabel('Cuenta de Luis').selectOption('123456ABCDEF');page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Preparar las cinco boletas'}).click();await page.getByRole('heading',{name:'Las cinco boletas'}).waitFor();assert.equal(balance,13000);
 await page.goto(base+'/coronas');await page.getByRole('tablist',{name:'¿Qué quieres hacer con tus coronas?'}).waitFor();
 // Tres pasos en el orden de una visita: usar (antes de la cuenta) → sumar (después de pagar) → regalar
 assert.deepEqual((await page.getByRole('tab').allTextContents()).map(s=>s.replace(/\s+/g,' ').trim()),['1Usar mis coronasAntes de pedir la cuenta','2Sumar mi compraDespués de pagar','3Regalar a un amigoCuando quieras']);
 // Con saldo disponible se abre en "Usar"; "Sumar mi compra" no se ve hasta elegirlo
 assert.equal(await page.getByRole('tab',{name:/Usar mis coronas/}).getAttribute('aria-selected'),'true');
 assert.equal(await page.getByRole('heading',{name:'Escanea el QR de tu mesa',exact:true}).isVisible(),false);
 await page.getByText('Hazlo antes de pedir la cuenta.').waitFor();
 const walletOrder=(await page.locator('.balance-card h2,.wallet-actions h2').allTextContents()).map(s=>s.trim());assert.deepEqual(walletOrder,['$13.000','Usa tus coronas','Escanea el QR de tu mesa','Coronas para un amigo']);
 // Ya no hay fichas reservadas ni enlaces de mesa.
 assert.equal(calls.filter(c=>/create_redemption|prepare_table|my_table_checkouts|my_receipt_tables/.test(c.path)).length,0);
 await page.getByRole('tab',{name:/Sumar mi compra/}).click();await page.getByText('Hazlo al pagar.').waitFor();await page.getByRole('heading',{name:'Escanea el QR de tu mesa',exact:true}).waitFor();
 assert.equal(await page.getByRole('heading',{name:'Usa tus coronas',exact:true}).isVisible(),false);
 assert.match(page.url(),/tab=sumar/);
 await mkdir('test/artifacts',{recursive:true});await page.screenshot({path:'test/artifacts/coronas-paso-sumar.png',fullPage:true});
 await page.getByRole('tab',{name:/Regalar a un amigo/}).click();await page.getByLabel('Coronas a enviar').waitFor();await page.screenshot({path:'test/artifacts/coronas-paso-regalar.png',fullPage:true});
 // Usar: elige el monto, muestra el QR (sin reservar saldo) y la app avisa cuando el garzón lo escanea.
 await page.getByRole('tab',{name:/Usar mis coronas/}).click();await page.getByRole('heading',{name:'Usa tus coronas',exact:true}).waitFor();
 await page.getByRole('button',{name:'$5.000',exact:true}).click();await page.getByRole('button',{name:'Mostrar mi QR al garzón'}).click();
 await page.getByText('DESCUENTO DE $5.000').waitFor();await page.locator('.member-qr .qr svg').waitFor();assert.equal(balance,13000);
 await page.screenshot({path:'test/artifacts/coronas-qr-canje.png',fullPage:true});
 await page.getByRole('heading',{name:'¡Descuento aprobado!'}).waitFor({timeout:8000});assert.equal(balance,8000);
 assert.equal(calls.find(c=>c.path.endsWith('/redeem_qr')).body.amount_value,5000);
 // Sumar: el código del QR de la mesa lleva a /mesa, muestra la parte y suma una sola vez.
 await page.getByRole('tab',{name:/Sumar mi compra/}).click();
 await page.getByLabel(/Escribe el código/).fill('k7m2-q9xd');await page.getByRole('button',{name:'Continuar',exact:true}).click();
 await page.getByRole('heading',{name:'$20.000'}).waitFor();await page.getByText('es tu parte: $60.000 entre 3 personas.').waitFor();
 await page.getByRole('button',{name:'Sumar mis coronas'}).click();await page.getByText(/¡Listo! Sumaste \$800 en coronas/).waitFor();assert.equal(pending,2000);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Mesa mobile overflow');await page.screenshot({path:'test/artifacts/mesa-sumar.png',fullPage:true});
 await page.goto(base+'/mesa?qr=K7M2Q9XD');await page.getByText(/Ya sumaste esta mesa/).waitFor();assert.equal(pending,2000);
 // Boletas ficticias del piloto: solo en /pruebas.
 await page.goto(base+'/pruebas');await page.getByRole('heading',{name:'Canjear boleta de prueba'}).waitFor();
 await page.getByLabel('Código de la boleta').fill('PRUEBA-NOEXISTE');await page.getByRole('button',{name:'Canjear boleta',exact:true}).click();await page.getByRole('status').filter({hasText:/no encontrado/}).waitFor();
 await page.getByLabel('Código de la boleta').fill('PRUEBA-60000');await page.getByRole('button',{name:'Canjear boleta',exact:true}).click();await page.getByRole('status').filter({hasText:/Boleta canjeada/}).waitFor();assert.equal(pending,4400);
 await page.getByLabel('Código de la boleta').fill('PRUEBA-60000');await page.getByRole('button',{name:'Canjear boleta',exact:true}).click();await page.getByRole('status').filter({hasText:/Ya habías canjeado/}).waitFor();assert.equal(pending,4400);
 await page.goto(base+'/coronas?tab=usar');await page.getByText(/\$4.400 por activar/).waitFor();
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Wallet mobile overflow');await page.screenshot({path:'test/artifacts/coronas-usar-mobile.png',fullPage:true});
 await page.setViewportSize({width:1440,height:1000});
 const tabBoxes=await page.getByRole('tab').evaluateAll(items=>items.map(item=>{const r=item.getBoundingClientRect();return {top:Math.round(r.top),bottom:r.bottom};}));const panelTop=await page.locator('.coin-tab:not([hidden])').evaluate(el=>el.getBoundingClientRect().top);assert.ok(tabBoxes.every(b=>b.top===tabBoxes[0].top),'Los tres pasos van en una sola fila');assert.ok(panelTop>=tabBoxes[0].bottom,'El contenido del paso queda bajo las pestañas');
 await page.screenshot({path:'test/artifacts/coronas-boleta-desktop.png',fullPage:true});await page.setViewportSize({width:390,height:844});
 await page.goto(base+'/pruebas');await page.getByText('Canjeada por Martín').waitFor();
 await page.goto(base+'/perfil');await page.getByRole('button',{name:'Cerrar sesión',exact:true}).click();await page.getByRole('link',{name:'Unirme al Club'}).waitFor();await page.getByRole('link',{name:'Ver la carta ↗',exact:true}).click();assert.equal(await page.getByText('Rey de pruebas · NO ES UN LOCAL REAL',{exact:true}).count(),0);
 await page.goto(base+'/entrar');await page.getByLabel('Correo electrónico').fill('martin@example.test');await page.getByLabel('Contraseña',{exact:true}).fill('UnaClaveSegura123');await page.getByRole('button',{name:'Entrar al Club →'}).click();await page.getByText('HOLA, MARTÍN').waitFor();await page.getByRole('heading',{name:'Rey de pruebas · NO ES UN LOCAL REAL',exact:true}).waitFor();
 await page.goto(base+'/pruebas');page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Cerrar la prueba',exact:true}).click();await page.getByText('PRUEBA CERRADA',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Canjear boleta',exact:true}).count(),0);
 await page.goto(base+'/rangos');await page.getByRole('heading',{name:'Guardia Real',exact:true}).waitFor();for(const pct of [4,6,8,10,12])await page.getByText(pct+'%',{exact:true}).waitFor();
 await page.goto(base+'/carta-prueba');await page.getByRole('heading',{name:'LA JUNTA DE PRUEBA.'}).waitFor();
 await page.setViewportSize({width:1440,height:1000});await page.goto(base);await page.getByText('HOLA, MARTÍN').waitFor();await page.screenshot({path:'test/artifacts/inicio-desktop.png',fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 assert.deepEqual(errors,[]);console.log('Browser: registration without RUT, confirmation, login, recovery, menu-open notification, friend mute, invite, transfer, admin credit and local access panel, pilot setup/closure, redeem QR, table QR claim/retry, pilot receipts, tiers, test menu, mobile routes and desktop layout passed (simulated Supabase HTTP).');
}finally{await browser?.close();server.kill();}
