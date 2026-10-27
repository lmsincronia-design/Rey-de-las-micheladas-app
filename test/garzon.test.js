// QR de la mesa, canje con QR, cumpleaños y app del garzón, sobre las migraciones reales (PGlite).
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
let db;
const admin='00000000-0000-4000-8000-0000000000a1',local='10000000-0000-4000-8000-0000000000b1',otherLocal='10000000-0000-4000-8000-0000000000b2';
const members=Array.from({length:6},(_,i)=>`90000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`);
async function uid(id){await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);}
async function call(name,args=[]){const r=await db.query(`select to_jsonb(public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')})) as result`,args);return r.rows[0].result;}
async function as(role,fn){await db.exec(`set role ${role}`);try{return await fn();}finally{await db.exec('reset role');}}
const rejected=(fn,pattern)=>assert.rejects(fn,pattern);
const today=()=>new Date().toLocaleDateString('en-CA',{timeZone:'America/Santiago'});
let device,waiter,managerToken,managerId,waiterId;

before(async()=>{
 db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb);
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;`);
 for(const f of (await readdir(new URL('../supabase/migrations/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort())
  await db.exec(await readFile(new URL('../supabase/migrations/'+f,import.meta.url),'utf8'));
 await db.query('insert into auth.users values($1,$2)',[admin,JSON.stringify({first_name:'Luis',last_name:'Admin',birthday:'1990-01-01',terms:true})]);
 await db.query("insert into public.staff(user_id,role) values($1,'admin')",[admin]);
 for(const [id,name] of [[local,'Rey Pío Nono'],[otherLocal,'Rey Maipú']])
  await db.query('insert into public.locations(id,name,address,commune,menu_url,verified) values($1,$2,$3,$4,$5,true)',[id,name,'Dirección','Santiago','https://example.cl/carta']);
 // Socios con consumo previo para cubrir los cinco rangos (4/6/8/10/12 %).
 for(let i=0;i<members.length;i++){
  await db.query('insert into auth.users values($1,$2)',[members[i],JSON.stringify({first_name:'Socio'+i,last_name:'Prueba',birthday:'1991-05-05',terms:true})]);
  const spending=[0,50000,150000,350000,700000,0][i];
  if(spending)await db.query("insert into ledger(user_id,kind,amount,spending,note) values($1,'purchase',0,$2,'Consumo previo')",[members[i],spending]);
 }
});
after(async()=>{await db.close();});

test('registration no longer asks for RUT and the phone is optional, but invalid values are still rejected',async()=>{
 const p=(await db.query('select rut,phone from profiles where id=$1',[members[0]])).rows[0];
 assert.equal(p.rut,null);assert.equal(p.phone,null);
 await rejected(()=>db.query('insert into auth.users values(gen_random_uuid(),$1)',[JSON.stringify({first_name:'Ana',last_name:'Soto',rut:'123456789',birthday:'1990-01-01',terms:true})]),/RUT inválido/);
 await rejected(()=>db.query('insert into auth.users values(gen_random_uuid(),$1)',[JSON.stringify({first_name:'Ana',last_name:'Soto',phone:'12345',birthday:'1990-01-01',terms:true})]),/Celular/);
 await rejected(()=>db.query('insert into auth.users values(gen_random_uuid(),$1)',[JSON.stringify({first_name:'Ana',last_name:'Soto',birthday:'2015-01-01',terms:true})]),/mayor de 18/);
});

test('only the administrator configures the local password and team',async()=>{
 await uid(members[0]);
 await as('authenticated',()=>rejected(()=>call('admin_set_local_password',[local,'clave-del-local']),/No tienes acceso/));
 await as('authenticated',()=>rejected(()=>call('save_waiter',[local,null,'Pirata','manager','1234',true]),/permission denied/));
 await uid(admin);
 await as('authenticated',async()=>{
  await rejected(()=>call('admin_set_local_password',[local,'corta']),/al menos 8/);
  await call('admin_set_local_password',[local,'clave-del-local']);
  managerId=await call('admin_save_waiter',[local,null,'Carla','manager','4321',true]);
  waiterId=await call('admin_save_waiter',[local,null,'Pedro','waiter','1234',true]);
  await rejected(()=>call('admin_save_waiter',[local,null,'pedro','waiter','5555',true]),/ese nombre/);
  await rejected(()=>call('admin_save_waiter',[local,null,'Ana','waiter','12',true]),/4 a 6/);
  const access=await call('admin_local_access');const row=access.find(l=>l.id===local);
  assert.equal(row.has_access,true);assert.equal(row.waiters.length,2);
 });
 await as('anon',async()=>{
  await rejected(()=>db.query('select * from waiters'),/permission denied/);
  await rejected(()=>db.query('select * from local_access'),/permission denied/);
  const list=await call('garzon_locations');assert.deepEqual(list.map(l=>l.id),[local]);
 });
});

test('the local logs in with its password, locks after five failures, and waiters enter with their PIN',async()=>{
 await uid(null);
 await as('anon',async()=>{
  assert.match((await call('garzon_login',[local,'mala'])).error,/incorrectos/);
  const ok=await call('garzon_login',[local,'clave-del-local']);device=ok.device_token;assert.equal(ok.location.name,'Rey Pío Nono');
  const team=await call('garzon_waiters',[device]);assert.deepEqual(team.waiters.map(w=>w.name),['Carla','Pedro']);
  assert.match((await call('garzon_pin',[device,waiterId,'0000'])).error,/PIN incorrecto/);
  waiter=(await call('garzon_pin',[device,waiterId,'1234'])).waiter_token;
  await rejected(()=>call('garzon_day',[device,'token-falso']),/PIN/);
  await rejected(()=>call('garzon_waiters',['dispositivo-falso']),/sesión del local terminó/);
 });
 // Un segundo teléfono del mismo local para el encargado.
 await as('anon',async()=>{
  const second=(await call('garzon_login',[local,'clave-del-local'])).device_token;
  managerToken={device:second,waiter:(await call('garzon_pin',[second,managerId,'4321'])).waiter_token};
 });
 // Cinco intentos fallidos bloquean la clave del local durante 15 minutos (los fallos sí quedan guardados).
 await as('anon',async()=>{
  for(let i=0;i<5;i++)await call('garzon_login',[otherLocal,'x']).catch(()=>{});
 });
 await uid(admin);await as('authenticated',()=>call('admin_set_local_password',[otherLocal,'otra-clave-1']));
 await as('anon',async()=>{
  for(let i=0;i<5;i++)assert.match((await call('garzon_login',[otherLocal,'mala'])).error,/incorrectos/);
  await rejected(()=>call('garzon_login',[otherLocal,'otra-clave-1']),/Demasiados intentos/);
 });
});

let mesa;
test('the waiter opens a table: equal parts, $5.000 minimum per person and idempotent retries',async()=>{
 await as('anon',async()=>{
  await rejected(()=>call('garzon_open_table',[device,waiter,20000,5,null,crypto.randomUUID()]),/al menos \$5\.000/);
  await rejected(()=>call('garzon_open_table',[device,waiter,4000,1,null,crypto.randomUUID()]),/entre \$5\.000/);
  await rejected(()=>call('garzon_open_table',[device,waiter,100000,21,null,crypto.randomUUID()]),/entre 1 y 20/);
  const id=crypto.randomUUID();
  mesa=await call('garzon_open_table',[device,waiter,100000,5,'Mesa 7',id]);
  assert.equal(mesa.part,20000);assert.equal(mesa.people,5);assert.equal(mesa.claimed,0);assert.match(mesa.code,/^[2-9A-HJ-NP-Z]{8}$/);assert.equal(mesa.waiter,'Pedro');
  assert.equal((await call('garzon_open_table',[device,waiter,100000,5,'Mesa 7',id])).code,mesa.code);
  await rejected(()=>call('garzon_open_table',[device,waiter,90000,5,'Mesa 7',id]),/ya utilizada/);
 });
});

test('each member scans once and earns their part times their own rank, without tiers by amount',async()=>{
 await uid(null);
 const preview=await as('anon',()=>call('table_qr_info',[mesa.code.toLowerCase()]));
 assert.equal(preview.part,20000);assert.equal(preview.remaining,5);assert.equal(preview.location_name,'Rey Pío Nono');
 await as('anon',()=>rejected(()=>call('claim_table_qr',[mesa.code]),/permission denied/));
 const expected=[800,1200,1600,2000,2400];
 for(let i=0;i<5;i++){
  await uid(members[i]);
  const claim=await as('authenticated',()=>call('claim_table_qr',[mesa.code]));
  assert.equal(claim.earned,expected[i]);assert.equal(claim.pct,[4,6,8,10,12][i]);assert.equal(claim.already_claimed,false);
  assert.equal((await as('authenticated',()=>call('claim_table_qr',[mesa.code]))).already_claimed,true);
  const w=await as('authenticated',()=>call('my_wallet'));assert.equal(w.balance,0);assert.equal(w.pending,expected[i]);
 }
 await uid(members[5]);await as('authenticated',()=>rejected(()=>call('claim_table_qr',[mesa.code]),/ya fueron sumadas/));
 const rows=(await db.query("select l.spending,extract(epoch from (l.available_at-l.created_at))::int delay from ledger l join table_qr t on t.receipt_id=l.receipt_id where t.id=$1",[mesa.id])).rows;
 assert.equal(rows.length,5);assert.ok(rows.every(r=>r.spending===20000&&r.delay===86400));
 const status=await as('anon',()=>call('garzon_table',[device,waiter,mesa.id]));assert.equal(status.claimed,5);
});

test('the QR expires after 10 minutes, the waiter can renew it, and three tables per day is the maximum',async()=>{
 const t=await as('anon',()=>call('garzon_open_table',[device,waiter,30000,3,null,crypto.randomUUID()]));
 await db.query("update table_qr set expires_at=now()-interval '1 second' where id=$1",[t.id]);
 await uid(members[5]);await as('authenticated',()=>rejected(()=>call('claim_table_qr',[t.code]),/venció/));
 const renewed=await as('anon',()=>call('garzon_renew_table',[device,waiter,t.id]));assert.notEqual(renewed.code,t.code);assert.equal(renewed.expired,false);
 await as('authenticated',()=>rejected(()=>call('claim_table_qr',[t.code]),/No encontramos/));
 assert.equal((await as('authenticated',()=>call('claim_table_qr',[renewed.code]))).earned,400);
 for(let i=0;i<2;i++){const extra=await as('anon',()=>call('garzon_open_table',[device,waiter,10000,1,null,crypto.randomUUID()]));await as('authenticated',()=>call('claim_table_qr',[extra.code]));}
 const fourth=await as('anon',()=>call('garzon_open_table',[device,waiter,10000,1,null,crypto.randomUUID()]));
 await as('authenticated',()=>rejected(()=>call('claim_table_qr',[fourth.code]),/3 cuentas hoy/));
});

let redeemCode;
test('redeeming: the member shows a 30-second QR and the crowns are discounted only when the waiter scans it',async()=>{
 await db.query("update ledger set available_at=now()-interval '1 second' where user_id=$1 and kind='purchase'",[members[4]]);
 await uid(members[4]);
 await as('authenticated',async()=>{
  assert.equal((await call('my_wallet')).balance,2400);
  await rejected(()=>call('redeem_qr',[1200]),/tramos de \$500/);
  await rejected(()=>call('redeem_qr',[25000]),/entre \$1\.000 y \$20\.000/);
  await rejected(()=>call('redeem_qr',[3000]),/suficientes/);
  await rejected(()=>call('create_redemption',[local,1000,crypto.randomUUID()]),/permission denied/);
  const qr=await call('redeem_qr',[2000]);redeemCode=qr.code;
  const seconds=(new Date(qr.expires_at)-new Date(qr.now))/1000;assert.equal(seconds,30);
  assert.equal((await call('my_wallet')).balance,2400); // sin reserva: el saldo no se toca al mostrar el QR
 });
 const seen=await as('anon',()=>call('garzon_scan_member',[device,waiter,redeemCode]));assert.equal(seen.purpose,'redeem');assert.equal(seen.amount,2000);assert.equal(seen.name,'Socio4 P.');
 const ok=await as('anon',()=>call('garzon_redeem',[device,waiter,redeemCode]));assert.equal(ok.amount,2000);assert.equal(ok.already_used,false);
 assert.equal((await as('anon',()=>call('garzon_redeem',[device,waiter,redeemCode]))).already_used,true);
 await as('authenticated',async()=>{
  assert.equal((await call('my_wallet')).balance,400);
  const status=await call('member_qr_status',[redeemCode]);assert.equal(status.used,true);assert.equal(status.location_name,'Rey Pío Nono');
  await rejected(()=>call('redeem_qr',[1000]),/canje de hoy/);
 });
 // Un QR vencido no sirve aunque el socio todavía tenga saldo.
 await uid(members[3]);await db.query("update ledger set available_at=now()-interval '1 second' where user_id=$1 and kind='purchase'",[members[3]]);
 const old=await as('authenticated',()=>call('redeem_qr',[1000]));
 await db.query("update member_qr set expires_at=now()-interval '1 second' where code=$1",[old.code]);
 await as('anon',()=>rejected(()=>call('garzon_redeem',[device,waiter,old.code]),/venció/));
});

test('only the manager voids: a redemption within 2 hours returns the crowns, a table reverses every share',async()=>{
 const day=await as('anon',()=>call('garzon_day',[device,waiter]));
 const red=day.redemptions[0];assert.equal(red.amount,2000);assert.equal(red.can_void,true);assert.equal(red.waiter,'Pedro');
 await as('anon',()=>rejected(()=>call('garzon_void_redemption',[device,waiter,red.id,'Error de caja']),/encargado/));
 await as('anon',()=>rejected(()=>call('garzon_void_redemption',[managerToken.device,managerToken.waiter,red.id,'']),/motivo/));
 await as('anon',()=>call('garzon_void_redemption',[managerToken.device,managerToken.waiter,red.id,'No se aplicó en caja']));
 assert.equal((await as('anon',()=>call('garzon_void_redemption',[managerToken.device,managerToken.waiter,red.id,'Otra vez']))).already_voided,true);
 await uid(members[4]);assert.equal((await as('authenticated',()=>call('my_wallet'))).balance,2400);
 await as('anon',()=>call('garzon_void_table',[managerToken.device,managerToken.waiter,mesa.id,'Monto mal ingresado']));
 for(const id of members.slice(0,4)){await uid(id);assert.equal((await as('authenticated',()=>call('my_wallet'))).pending,0);}
 await uid(members[5]);await as('authenticated',()=>rejected(()=>call('claim_table_qr',[mesa.code]),/anulada/));
 const audit=(await db.query("select action from local_audit where location_id=$1 order by created_at",[local])).rows.map(r=>r.action);
 for(const action of ['device_login','pin_login','table_open','redeem','redeem_void','table_void'])assert.ok(audit.includes(action),action);
});

test('birthday: one michelada per year, only on the day and only after the waiter checks the ID card',async()=>{
 await uid(members[2]);
 await as('authenticated',()=>rejected(()=>call('birthday_qr'),/día de tu cumpleaños/));
 await db.query("update profiles set birthday=($1::date - interval '30 years')::date where id=$2",[today(),members[2]]);
 await as('authenticated',async()=>{assert.equal((await call('my_birthday')).today,true);});
 const qr=await as('authenticated',()=>call('birthday_qr'));
 const seen=await as('anon',()=>call('garzon_scan_member',[device,waiter,qr.code]));assert.equal(seen.purpose,'birthday');assert.equal(seen.name,'Socio2 Prueba');
 await as('anon',()=>rejected(()=>call('garzon_birthday',[device,waiter,qr.code,false]),/cédula/));
 // Mientras el garzón revisa la cédula, el QR del socio se renueva y vence: el código escaneado sigue sirviendo.
 await as('authenticated',()=>call('birthday_qr'));
 await db.query("update member_qr set expires_at=now()-interval '1 second' where code=$1",[qr.code]);
 await as('anon',()=>call('garzon_birthday',[device,waiter,qr.code,true]));
 await as('authenticated',async()=>{assert.equal((await call('my_birthday')).claimed,true);await rejected(()=>call('birthday_qr'),/este año/);});
});

test('the manager adds and deactivates waiters; deactivated waiters lose their session',async()=>{
 await as('anon',async()=>{
  await rejected(()=>call('garzon_team',[device,waiter]),/encargado/);
  const id=await call('garzon_save_waiter',[managerToken.device,managerToken.waiter,null,'Rocío','2468',true]);
  assert.ok((await call('garzon_team',[managerToken.device,managerToken.waiter])).some(w=>w.name==='Rocío'&&w.role==='waiter'));
  await rejected(()=>call('garzon_save_waiter',[managerToken.device,managerToken.waiter,managerId,'Carla',null,false]),/ti mismo/);
  await call('garzon_save_waiter',[managerToken.device,managerToken.waiter,waiterId,'Pedro',null,false]);
  await rejected(()=>call('garzon_day',[device,waiter]),/PIN/);
  assert.ok(id);
 });
 // Cambiar la clave del local cierra todas las sesiones abiertas.
 await uid(admin);await as('authenticated',()=>call('admin_set_local_password',[local,'clave-nueva-123']));
 await as('anon',()=>rejected(()=>call('garzon_waiters',[managerToken.device]),/sesión del local terminó/));
});
