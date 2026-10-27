// MODO DEMOSTRACIÓN (solo en este computador): un Supabase de mentira en memoria + Vite apuntando a él.
// Sirve para recorrer la app del socio y la del garzón con datos de ejemplo, sin tocar la base real.
// Las dos apps comparten el mismo estado: el QR que genera el garzón se suma desde la app del socio.
// Uso: npm run demo → app del socio en http://localhost:5174 y del garzón en http://localhost:5174/garzon
// Entrar como socio: cualquier correo y contraseña. Garzón: clave del local "demo1234"; PIN Carla 1234 (encargada), Pedro 5678.
import http from 'node:http';
import {spawn} from 'node:child_process';
import {LOCALES_REY} from '../src/locales-rey.js';

const API=54329,WEB=5174;
const now=()=>Date.now(),iso=ms=>new Date(ms).toISOString();
const me='00000000-0000-4000-8000-0000000000d1';
const today=new Date().toLocaleDateString('en-CA',{timeZone:'America/Santiago'});
const local=LOCALES_REY[0];
const profile={id:me,first_name:'Martín',last_name:'Arellano',rut:null,phone:null,birthday:`${Number(today.slice(0,4))-30}${today.slice(4)}`,member_code:'49A1B0AE87CB',share_activity:true,ranking_visible:false};
const pctFor=s=>s>=700000?12:s>=350000?10:s>=150000?8:s>=50000?6:4;
const tierFor=s=>s>=700000?'Rey':s>=350000?'Noble':s>=150000?'Guardia Real':s>=50000?'Comerciante':'Plebeyo';
const st={balance:13700,pending:0,spending:90000,ledger:[],notifications:[],redeemedToday:false,birthdayClaimed:false,
 tables:new Map(),memberQr:new Map(),redemptions:[],birthdays:0,
 team:[{id:'w-carla',name:'Carla',role:'manager',active:true,pin:'1234'},{id:'w-pedro',name:'Pedro',role:'waiter',active:true,pin:'5678'}],
 devices:new Set(),waiterTokens:new Map()};
const ALPHA='23456789ABCDEFGHJKMNPQRSTUVWXYZ';const code=n=>Array.from({length:n},()=>ALPHA[Math.floor(Math.random()*ALPHA.length)]).join('');
const token=`${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({sub:me,exp:Math.floor(now()/1000)+86400})).toString('base64url')}.demo`;
const user={id:me,aud:'authenticated',role:'authenticated',email:'martin@demo.cl',email_confirmed_at:iso(now()),user_metadata:{},app_metadata:{provider:'email'},created_at:iso(now())};
class Err extends Error{}
const fail=m=>{throw new Err(m);};
const notify=message=>st.notifications.unshift({id:'n'+now()+Math.random(),kind:'purchase',message,created_at:iso(now()),read_at:null,user_id:me});
const tableJson=t=>({id:t.id,code:t.code,amount:t.amount,people:t.people,part:Math.floor(t.amount/t.people),table_label:t.label,created_at:iso(t.created),expires_at:iso(t.expires),expired:t.expires<=now(),cancelled:t.cancelled,claimed:t.claims,waiter:t.waiter});
const waiterOf=b=>{const w=st.waiterTokens.get(b.waiter_token);if(!st.devices.has(b.device_token))fail('La sesión del local terminó. Ingresa de nuevo con la clave del local.');if(!w)fail('Ingresa con tu PIN para continuar.');return w;};
const manager=b=>{const w=waiterOf(b);if(w.role!=='manager')fail('Solo el encargado del local puede hacer esto.');return w;};

const rpc={
 my_wallet:()=>({balance:st.balance,pending:st.pending,debt:0,spending:st.spending,tier:tierFor(st.spending),pct:pctFor(st.spending)}),
 my_friends:()=>[{id:'f1',other_id:'00000000-0000-4000-8000-0000000000d2',first_name:'Luis',last_name:'M.',status:'accepted',incoming:false,muted:false}],
 my_staff_role:()=>({role:'admin',location_id:null}),
 club_ranking:()=>({total:12,limit:10,visible:false,top:[{position:1,name:'Cote M.',tier:'Rey',me:false},{position:2,name:null,tier:'Noble',me:false},{position:3,name:'Martín A.',tier:tierFor(st.spending),me:true}],me:{position:3,tier:tierFor(st.spending),gap:42000,gap_top:0}}),
 my_birthday:()=>({today:true,claimed:st.birthdayClaimed}),
 my_test_pilot:()=>({enabled:false,configured:false,is_admin:true}),
 set_activity_sharing:()=>null,set_ranking_visibility:()=>null,mark_notifications_read:()=>{st.notifications.forEach(n=>n.read_at=iso(now()));return null;},announce_location:()=>false,
 admin_summary:()=>({members:2,friends:1,balance:st.balance,pending:st.pending,receipts:st.tables.size,locations:LOCALES_REY.length}),
 admin_locations:()=>LOCALES_REY.map(l=>({...l,active:true,verified:true})),
 admin_members:()=>[{id:me,first_name:'Martín',last_name:'A.',member_code:profile.member_code,balance:st.balance}],
 admin_credit_history:()=>[],
 admin_local_access:()=>LOCALES_REY.map((l,i)=>({id:l.id,name:l.name,is_test:false,active:true,has_access:i===0,locked:false,devices:i===0?st.devices.size:0,waiters:i===0?st.team.map(({pin,...w})=>w):[]})),
 admin_set_local_password:()=>null,admin_save_waiter:()=>'w-nuevo',admin_revoke_local_sessions:()=>null,
 // Socio: QR de la mesa
 table_qr_info:b=>{const t=st.tables.get(String(b.code_value).toUpperCase().replace(/[^A-Z0-9]/g,''));if(!t)fail('No encontramos esa mesa. Revisa el código o pide al garzón un QR nuevo.');const own=t.mine;
  return {code:t.code,amount:t.amount,people:t.people,part:Math.floor(t.amount/t.people),remaining:Math.max(0,t.people-t.claims),expires_at:iso(t.expires),expired:t.expires<=now(),cancelled:t.cancelled,table_label:t.label,location_name:local.name,claimed:Boolean(own),earned:own?.earned??null,available_at:own?iso(own.at+86400000):null};},
 claim_table_qr:b=>{const t=st.tables.get(String(b.code_value).toUpperCase().replace(/[^A-Z0-9]/g,''));if(!t)fail('No encontramos esa mesa.');if(t.cancelled)fail('Esta cuenta fue anulada por el local.');
  if(t.mine)return {earned:t.mine.earned,part:Math.floor(t.amount/t.people),available_at:iso(t.mine.at+86400000),already_claimed:true};
  if(t.expires<=now())fail('El QR de esta mesa venció. Pide al garzón que lo renueve.');if(t.claims>=t.people)fail('Todas las partes de esta mesa ya fueron sumadas.');
  const part=Math.floor(t.amount/t.people),pct=pctFor(st.spending),tier=tierFor(st.spending),earned=Math.min(8000,Math.floor(part*pct/100));
  t.mine={earned,at:now()};t.claims++;st.pending+=earned;st.spending+=part;
  st.ledger.unshift({id:'l'+now(),note:'Tu parte de la mesa · '+local.name,amount:earned,settled:false,created_at:iso(now())});notify(`Tu parte de la mesa sumó ${earned} coronas. Se activan en 24 horas 👑`);
  return {earned,part,pct,tier,available_at:iso(now()+86400000),already_claimed:false,location_name:local.name};},
 // Socio: QR de canje y de cumpleaños
 redeem_qr:b=>{const a=Number(b.amount_value);if(!(a>=1000&&a<=20000&&a%500===0))fail('Elige un descuento entre $1.000 y $20.000, en tramos de $500.');if(st.redeemedToday)fail('Ya usaste tu canje de hoy. Mañana puedes volver a canjear.');if(st.balance<a)fail('No tienes suficientes coronas disponibles.');
  for(const q of st.memberQr.values())if(q.purpose==='redeem'&&!q.used)q.expires=Math.min(q.expires,now());
  const q={code:'C'+code(9),purpose:'redeem',amount:a,expires:now()+30000,used:false};st.memberQr.set(q.code,q);return {code:q.code,amount:a,expires_at:iso(q.expires),now:iso(now())};},
 birthday_qr:()=>{if(st.birthdayClaimed)fail('Ya recibiste tu regalo de cumpleaños este año.');for(const q of st.memberQr.values())if(q.purpose==='birthday'&&!q.used&&!(q.held>now()))q.expires=Math.min(q.expires,now());
  const q={code:'B'+code(9),purpose:'birthday',expires:now()+30000,used:false};st.memberQr.set(q.code,q);return {code:q.code,expires_at:iso(q.expires),now:iso(now())};},
 member_qr_status:b=>{const q=st.memberQr.get(b.code_value);if(!q)fail('Código no encontrado');return {used:q.used,expired:q.expires<=now(),amount:q.amount,purpose:q.purpose,location_name:q.used?local.name:null};},
 // Garzón
 garzon_locations:()=>[{id:local.id,name:local.name,commune:local.commune,is_test:false}],
 garzon_login:b=>{if(b.password_value!=='demo1234')return {error:'Local o clave incorrectos.'};const d='dev-'+code(16);st.devices.add(d);return {device_token:d,location:{id:local.id,name:local.name,is_test:false}};},
 garzon_waiters:b=>{if(!st.devices.has(b.device_token))fail('La sesión del local terminó. Ingresa de nuevo con la clave del local.');return {location:{id:local.id,name:local.name,is_test:false},waiters:st.team.filter(w=>w.active).sort((a,b)=>(b.role==='manager')-(a.role==='manager')).map(w=>({id:w.id,name:w.name,role:w.role,locked:false}))};},
 garzon_pin:b=>{const w=st.team.find(x=>x.id===b.waiter_value&&x.active);if(!w)fail('Garzón no encontrado en este local.');if(w.pin!==b.pin_value)return {error:'PIN incorrecto.'};const t='wt-'+code(16);st.waiterTokens.set(t,w);return {waiter_token:t,waiter:{id:w.id,name:w.name,role:w.role},expires_at:iso(now()+43200000)};},
 garzon_logout:()=>null,
 garzon_open_table:b=>{const w=waiterOf(b);const existing=[...st.tables.values()].find(t=>t.id===b.request_id);if(existing)return tableJson(existing);
  const a=Number(b.amount_value),p=Number(b.people_value);if(!(a>=5000&&a<=2000000))fail('Ingresa el total de la cuenta: entre $5.000 y $2.000.000.');if(!(p>=1&&p<=20))fail('Indica entre 1 y 20 personas.');if(Math.floor(a/p)<5000)fail(`Cada parte debe ser de al menos $5.000. Con ${p} personas cada una quedaría en $${Math.floor(a/p)}.`);
  const t={id:b.request_id,code:code(8),amount:a,people:p,label:b.table_label_value||null,created:now(),expires:now()+600000,cancelled:false,claims:0,waiter:w.name,mine:null};st.tables.set(t.code,t);return tableJson(t);},
 garzon_table:b=>{waiterOf(b);const t=[...st.tables.values()].find(x=>x.id===b.table_value);if(!t)fail('Mesa no encontrada');return tableJson(t);},
 garzon_renew_table:b=>{waiterOf(b);const t=[...st.tables.values()].find(x=>x.id===b.table_value);if(!t)fail('Mesa no encontrada');st.tables.delete(t.code);t.code=code(8);t.expires=now()+600000;st.tables.set(t.code,t);return tableJson(t);},
 garzon_scan_member:b=>{waiterOf(b);const q=st.memberQr.get(String(b.code_value).toUpperCase().replace(/[^A-Z0-9]/g,''));if(!q)fail('Código no válido. Pide al socio que muestre su QR de nuevo.');if(q.used)fail('Este código ya se usó.');if(q.expires<=now())fail('El código venció. El QR se renueva solo: escanéalo de nuevo.');
  if(q.purpose==='birthday'){q.held=now()+180000;return {purpose:'birthday',code:q.code,name:'Martín Arellano',birthday:profile.birthday.split('-').reverse().join('/')};}return {purpose:'redeem',code:q.code,amount:q.amount,name:'Martín A.'};},
 garzon_redeem:b=>{const w=waiterOf(b);const q=st.memberQr.get(String(b.code_value).toUpperCase().replace(/[^A-Z0-9]/g,''));if(!q||q.purpose!=='redeem')fail('Código de canje no válido.');
  if(q.used)return {redemption_id:q.red,amount:q.amount,already_used:true};if(q.expires<=now())fail('El código venció. El QR se renueva solo: escanéalo de nuevo.');if(st.redeemedToday)fail('Este socio ya usó su canje de hoy.');if(st.balance<q.amount)fail('El socio no tiene coronas suficientes para este descuento.');
  const r={id:'red-'+code(6),amount:q.amount,created_at:iso(now()),status:'used',voided_at:null,member:'Martín A.',waiter:w.name};st.redemptions.unshift(r);q.used=true;q.red=r.id;st.balance-=q.amount;st.redeemedToday=true;
  st.ledger.unshift({id:'l'+now(),note:'Descuento en '+local.name,amount:-q.amount,settled:true,created_at:iso(now())});notify(`Descuento aprobado: ${q.amount} coronas en ${local.name} 👑`);
  return {redemption_id:r.id,amount:r.amount,name:'Martín A.',already_used:false};},
 garzon_birthday:b=>{waiterOf(b);if(!b.id_checked)fail('Primero revisa la cédula del socio.');const q=st.memberQr.get(b.code_value);if(!q||q.purpose!=='birthday')fail('Código de cumpleaños no válido.');if(q.used)fail('Este código ya se usó.');if(st.birthdayClaimed)fail('Este socio ya recibió su regalo de cumpleaños este año.');
  q.used=true;st.birthdayClaimed=true;st.birthdays++;notify('¡Feliz cumpleaños! Disfruta tu michelada de regalo 🎂');return {name:'Martín',ok:true};},
 garzon_day:b=>{const w=waiterOf(b);return {waiter:{id:w.id,name:w.name,role:w.role},tables:[...st.tables.values()].sort((a,c)=>c.created-a.created).map(tableJson),redemptions:st.redemptions.map(r=>({...r,can_void:r.status==='used'&&now()-Date.parse(r.created_at)<7200000})),birthdays:st.birthdays};},
 garzon_void_table:b=>{manager(b);const t=[...st.tables.values()].find(x=>x.id===b.table_value);if(!t)fail('Mesa no encontrada');if(!t.cancelled){t.cancelled=true;t.expires=Math.min(t.expires,now());if(t.mine){st.pending-=t.mine.earned;st.spending-=Math.floor(t.amount/t.people);st.ledger.unshift({id:'l'+now(),note:'Cuenta anulada por el local',amount:-t.mine.earned,settled:true,created_at:iso(now())});}}return tableJson(t);},
 garzon_void_redemption:b=>{manager(b);const r=st.redemptions.find(x=>x.id===b.redemption_value);if(!r)fail('Canje no encontrado');if(r.status==='cancelled')return {id:r.id,already_voided:true};
  r.status='cancelled';r.voided_at=iso(now());st.balance+=r.amount;st.redeemedToday=false;st.ledger.unshift({id:'l'+now(),note:'Canje anulado por el local: coronas devueltas',amount:r.amount,settled:true,created_at:iso(now())});notify(`El local anuló tu canje y te devolvió ${r.amount} coronas.`);return {id:r.id,already_voided:false};},
 garzon_team:b=>{manager(b);return st.team.map(({pin,...w})=>({...w,locked:false}));},
 garzon_save_waiter:b=>{manager(b);if(!b.id_value){if(!/^[0-9]{4,6}$/.test(b.pin_value||''))fail('El PIN debe tener de 4 a 6 números.');const w={id:'w-'+code(6),name:String(b.name_value).trim(),role:'waiter',active:true,pin:b.pin_value};st.team.push(w);return w.id;}
  const w=st.team.find(x=>x.id===b.id_value);if(!w)fail('Garzón no encontrado');if(w.role==='manager'&&!b.active_value)fail('No puedes desactivarte a ti mismo.');w.active=b.active_value;if(b.pin_value)w.pin=b.pin_value;if(!w.active)for(const [k,v] of st.waiterTokens)if(v.id===w.id)st.waiterTokens.delete(k);return w.id;}
};

const send=(res,status,data,extra={})=>{res.writeHead(status,{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST,PATCH,DELETE,OPTIONS','Access-Control-Expose-Headers':'*','Content-Type':'application/json',...extra});res.end(data===undefined?'':JSON.stringify(data));};
http.createServer((req,res)=>{
 if(req.method==='OPTIONS')return send(res,204);
 let raw='';req.on('data',c=>raw+=c);req.on('end',()=>{
  const url=new URL(req.url,'http://x'),path=url.pathname;let body={};try{body=raw?JSON.parse(raw):{};}catch{}
  try{
   if(path==='/auth/v1/token')return send(res,200,{access_token:token,token_type:'bearer',expires_in:86400,expires_at:Math.floor(now()/1000)+86400,refresh_token:'demo-refresh',user});
   if(path==='/auth/v1/user')return send(res,200,user);
   if(path==='/auth/v1/logout')return send(res,204);
   if(path==='/auth/v1/signup')return send(res,200,{...user,identities:[]});
   if(path==='/auth/v1/recover')return send(res,200,{});
   if(path.startsWith('/rest/v1/rpc/')){const name=path.slice(13);if(!rpc[name])return send(res,404,{code:'PGRST202',message:'Función no disponible en la demostración: '+name});return send(res,200,rpc[name](body)??null);}
   if(path==='/rest/v1/profiles')return send(res,200,/vnd\.pgrst\.object/.test(req.headers.accept||'')?profile:[profile]);
   if(path==='/rest/v1/locations')return send(res,200,LOCALES_REY.map(l=>({...l,active:true,verified:true})));
   if(path==='/rest/v1/notifications')return send(res,200,st.notifications);
   if(path==='/rest/v1/ledger')return send(res,200,st.ledger);
   if(path==='/rest/v1/redemptions')return send(res,200,[]);
   return send(res,404,{message:'No disponible en la demostración'});
  }catch(e){return send(res,400,{code:'P0001',message:e instanceof Err?e.message:'Error en la demostración'});}
 });
}).listen(API,'127.0.0.1',()=>console.log(`Supabase de demostración en http://127.0.0.1:${API}`));

const vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','localhost','--port',String(WEB),'--strictPort'],{stdio:'inherit',env:{...process.env,VITE_SUPABASE_URL:`http://127.0.0.1:${API}`,VITE_SUPABASE_ANON_KEY:'demo-public-key'}});
process.on('SIGINT',()=>{vite.kill();process.exit(0);});process.on('SIGTERM',()=>{vite.kill();process.exit(0);});
