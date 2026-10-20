// Capturas de pantalla de todas las vistas con datos de ejemplo (Supabase simulado). Sirve para comparar diseños.
// Uso: node test/capturas.mjs <carpeta-de-salida> [ancho] [alto]     (CHROMIUM_EXECUTABLE=ruta a Chrome si hace falta)
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';

const out=process.argv[2]||'test/artifacts/capturas';
const W=Number(process.argv[3]||390),H=Number(process.argv[4]||844);
const port=4176,base=`http://127.0.0.1:${port}`;
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{env:{...process.env,VITE_SUPABASE_URL:'https://club-test.supabase.co',VITE_SUPABASE_ANON_KEY:'test-public-key'}});
let browser;
try{
 await new Promise((resolve,reject)=>{server.stdout.on('data',d=>{if(String(d).includes(String(port)))resolve();});server.stderr.on('data',d=>process.stderr.write(d));server.on('exit',c=>reject(new Error('Vite salió '+c)));setTimeout(()=>reject(new Error('Vite no arrancó')),12000).unref();});
 await mkdir(out,{recursive:true});
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':chromium.executablePath()),headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:W,height:H},deviceScaleFactor:2,locale:'es-CL',isMobile:W<700,hasTouch:W<700});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource|supabase/i.test(m.text()))errors.push(m.text());});
 await page.routeWebSocket('wss://club-test.supabase.co/**',ws=>ws.close());
 const me='00000000-0000-4000-8000-000000000001',luis='00000000-0000-4000-8000-000000000002',ana='00000000-0000-4000-8000-000000000003';
 const token=`${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({sub:me,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')}.test`;
 const user={id:me,aud:'authenticated',role:'authenticated',email:'martin@example.test',email_confirmed_at:new Date().toISOString(),user_metadata:{},app_metadata:{provider:'email'},created_at:new Date().toISOString()};
 const {LOCALES_REY}=await import('../src/locales-rey.js');
 const locations=LOCALES_REY.map(l=>({...l,active:true,verified:true}));
 const now=Date.now(),iso=ms=>new Date(now+ms).toISOString();
 const ledger=[
  {id:'l1',note:'Coronas por boleta PRUEBA-60000',amount:3600,settled:false,created_at:iso(-3600e3)},
  {id:'l2',note:'Mi parte de la mesa · boleta PRUEBA-30000',amount:900,settled:true,created_at:iso(-86400e3*2)},
  {id:'l3',note:'Envío a Luis S.',amount:-2000,settled:true,created_at:iso(-86400e3*3)},
  {id:'l4',note:'Ficha de descuento reservada',amount:-3000,settled:true,created_at:iso(-86400e3*5)}
 ];
 const notifications=[
  {id:'n1',kind:'purchase',message:'Tu parte de la mesa sumó 900 coronas. Se activan en 24 horas',created_at:iso(-3600e3),read_at:null},
  {id:'n2',kind:'friend',message:'Luis S. abrió la carta de Pío Nono 105 · ¿Te sumas?',created_at:iso(-7200e3),read_at:null},
  {id:'n3',kind:'transfer',message:'Luis S. te envió 2.000 coronas',created_at:iso(-86400e3),read_at:iso(-80000e3)}
 ];
 const ranking={total:128,limit:10,visible:false,top:[
  ['Cote M.','Rey'],['Nacho R.','Rey'],[null,'Rey'],['Seba P.','Noble'],['Fran T.','Noble'],[null,'Noble'],['Cami G.','Guardia Real'],['Javi L.','Guardia Real'],[null,'Guardia Real'],['Anto V.','Comerciante']
 ].map(([name,tier],i)=>({position:i+1,name,tier,me:false})),me:{position:27,tier:'Comerciante',gap:38500,gap_top:112000}};
 await page.route('https://club-test.supabase.co/**',async route=>{
  const request=route.request(),path=new URL(request.url()).pathname;let data={};
  if(path.endsWith('/token'))data={access_token:token,refresh_token:'r',expires_in:3600,token_type:'bearer',user};
  else if(path.endsWith('/user'))data=user;
  else if(path.endsWith('/logout'))data={};
  else if(path==='/rest/v1/locations')data=locations;
  else if(path==='/rest/v1/profiles')data={id:me,first_name:'Martín',last_name:'Arellano',rut:'123456785',phone:'+56912345678',birthday:'1990-10-08',member_code:'49A1B0AE87CB',share_activity:true,ranking_visible:false};
  else if(path==='/rest/v1/notifications')data=notifications;
  else if(path==='/rest/v1/ledger')data=ledger;
  else if(path==='/rest/v1/redemptions')data=[{id:'r1',amount:3000,code:'K7Q2MX',status:'reserved',expires_at:iso(8*60e3),created_at:iso(-2*60e3)}];
  else if(path.endsWith('/my_wallet'))data={balance:11600,pending:3600,debt:0,spending:90000,tier:'Comerciante',pct:6};
  else if(path.endsWith('/my_staff_role'))data=process.env.CAPTURA_ADMIN?{role:'admin',location_id:null}:null;
  else if(path.endsWith('/my_friends'))data=[{id:'f1',other_id:luis,first_name:'Luis',last_name:'M.',status:'accepted',incoming:false,muted:false},{id:'f2',other_id:ana,first_name:'Ana',last_name:'P.',status:'pending',incoming:true,muted:false}];
  else if(path.endsWith('/my_table_checkouts')||path.endsWith('/my_receipt_tables'))data=[];
  else if(path.endsWith('/my_test_pilot'))data={enabled:true,configured:true,is_admin:false,participant:true,vouchers:[]};
  else if(path.endsWith('/club_ranking'))data=ranking;
  else if(path.endsWith('/admin_summary'))data={members:2,friends:1,balance:14000,pending:3600,receipts:3,locations:33};
  else if(path.endsWith('/admin_locations'))data=locations;
  else if(path.endsWith('/admin_members'))data=[{member_code:'49A1B0AE87CB',first_name:'Martín',last_name:'Arellano',balance:11600},{member_code:'123456ABCDEF',first_name:'Luis',last_name:'M.',balance:2400}];
  else if(path.endsWith('/admin_credit_history'))data=[];
  else if(path.endsWith('/table_share_info'))data={location_name:'Pío Nono 105',people:3,amount:50000,part:16666,payer_name:'Martín A.',slots:2,expired:false};
  else data=null;
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
 });
 // Vistas sin sesión
 const shot=async(name,full=false)=>{await page.waitForTimeout(450);await page.screenshot({path:`${out}/${name}.png`,fullPage:full});};
 await page.goto(base+'/');await page.waitForLoadState('networkidle');await shot('00-portada-visitante');
 await page.goto(base+'/registro');await page.waitForLoadState('networkidle');await shot('01-registro');
 await page.goto(base+'/entrar');await page.waitForLoadState('networkidle');
 await page.getByLabel('Correo electrónico').fill('martin@example.test');await page.getByLabel('Contraseña',{exact:true}).fill('UnaClaveSegura123');await shot('02-entrar');
 await page.getByRole('button',{name:/Entrar al Club/}).click();await page.waitForURL(u=>!/entrar/.test(u.pathname),{timeout:8000}).catch(()=>{});await page.waitForLoadState('networkidle');
 const views=[['10-inicio','/'],['11-carta','/locales'],['12-amigos','/amigos'],['13-coronas','/coronas'],['14-coronas-sumar','/coronas?tab=sumar'],['15-coronas-regalar','/coronas?tab=regalar'],['16-ranking','/ranking'],['17-ranking-ejemplo','/ranking?demo=1'],['18-rangos','/rangos'],['19-perfil','/perfil'],['20-notificaciones','/notificaciones'],['21-codigo','/codigo'],['22-pruebas','/pruebas'],['23-terminos','/terminos'],['24-mesa','/mesa?codigo=abc123']];
 if(process.env.CAPTURA_ADMIN)views.push(['30-admin','/admin'],['31-caja','/caja']);
 for(const [name,path] of views){await page.goto(base+path);await page.waitForLoadState('networkidle');await shot(name,true);}
 console.log(`${views.length+3} capturas en ${out} (${W}x${H})`);
 if(errors.length)console.log('Errores de la página:',[...new Set(errors)].slice(0,5));
}finally{await browser?.close();server.kill();}
