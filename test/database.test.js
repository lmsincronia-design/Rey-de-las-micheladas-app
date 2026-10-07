import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
let db;
const martin='00000000-0000-4000-8000-000000000001',luis='00000000-0000-4000-8000-000000000002',stranger='00000000-0000-4000-8000-000000000003',local='10000000-0000-4000-8000-000000000001';
async function uid(id){await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);}
async function call(name,args=[]){if(name==='my_friends')return (await db.query('select * from public.my_friends()')).rows;const result=await db.query(`select to_jsonb(public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')})) as result`,args);return result.rows[0].result;}
async function rejected(fn,pattern){await assert.rejects(fn,pattern);}
before(async()=>{
 db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb);
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;`);
 for(const filename of (await readdir(new URL('../supabase/migrations/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort())
  await db.exec(await readFile(new URL('../supabase/migrations/'+filename,import.meta.url),'utf8'));
 for(const [id,name,rut] of [[martin,'Martín','123456785'],[luis,'Luis','111111111'],[stranger,'Pedro','222222222']]){
 await db.query('insert into auth.users values($1,$2)',[id,JSON.stringify({first_name:name,last_name:'Soto',rut,phone:'+56912345678',birthday:'1990-10-08',terms:true,share_activity:true})]);
 }
 await db.query('insert into public.locations(id,name,address,commune,menu_url,verified) values($1,$2,$3,$4,$5,true)',[local,'Rey de pruebas','Dirección de pruebas','Santiago','https://qrfy.io/p/oOBx-dlqTy']);
});
after(async()=>{await db.close();});
test('database rejects signup with invalid RUT and underage birthday',async()=>{
 const metadata={first_name:'Ana',last_name:'Soto',rut:'123456789',phone:'+56912345678',birthday:'1990-01-01',terms:true};
 await rejected(()=>db.query('insert into auth.users values(gen_random_uuid(),$1)',[JSON.stringify(metadata)]),/RUT inválido/);
 metadata.rut='123456785';metadata.birthday='2020-01-01';await rejected(()=>db.query('insert into auth.users values(gen_random_uuid(),$1)',[JSON.stringify(metadata)]),/mayor de 18/);
});
test('private profiles and wallets cannot be edited or read across users',async()=>{
 await uid(martin);await db.exec('set role authenticated');
 const result=await db.query('select id from public.profiles');assert.deepEqual(result.rows.map(x=>x.id),[martin]);
 await rejected(()=>db.query('update public.wallets set balance=100000 where user_id=$1',[martin]),/permission denied/);
 await rejected(()=>call('wallet_credit',[martin,100000]),/permission denied/);
 await rejected(()=>call('pos_record_sale',[local,'hack',100000,1,[]]),/permission denied/);
 await db.exec('reset role');
});
test('friendships require recipient acceptance, transfers to pending friends fail',async()=>{
 await uid(martin);const code=(await db.query('select member_code from profiles where id=$1',[luis])).rows[0].member_code;
 await call('request_friend',[code]);const friends=await call('my_friends');assert.equal(friends[0].status,'pending');
 await rejected(()=>call('respond_friend',[friends[0].id,true]),/Solicitud no disponible/);
 await rejected(()=>call('transfer_crowns',[luis,1,crypto.randomUUID()]),/aceptar la amistad/);
 await uid(luis);await call('respond_friend',[friends[0].id,true]);assert.equal((await call('my_friends'))[0].status,'accepted');
});
test('POS sales are idempotent and purchase crowns stay pending for 24 hours',async()=>{
 const codes=(await db.query('select member_code from profiles where id=any($1)',[[martin,luis]])).rows.map(x=>x.member_code);
 const receipt=await call('pos_record_sale',[local,'folio-1',60000,2,codes]);assert.equal(await call('pos_record_sale',[local,'folio-1',60000,2,codes]),receipt);
 await uid(martin);const wallet=await call('my_wallet');assert.equal(wallet.balance,0);assert.equal(wallet.pending,1200);assert.equal(wallet.spending,30000);
 await rejected(()=>call('transfer_crowns',[luis,1,crypto.randomUUID()]),/suficientes/);
 await rejected(()=>call('pos_record_sale',[local,'folio-1',60001,2,codes]),/datos distintos/);
});
test('activated crowns transfer atomically and retrying the same id does not double debit',async()=>{
 await db.exec("update ledger set available_at=now()-interval '1 minute' where kind='purchase'");
 await uid(martin);const id=crypto.randomUUID();await call('transfer_crowns',[luis,1000,id]);await call('transfer_crowns',[luis,1000,id]);
 assert.equal((await call('my_wallet')).balance,200);await uid(luis);assert.equal((await call('my_wallet')).balance,2200);
 await uid(martin);await rejected(()=>call('transfer_crowns',[luis,1001,id]),/ya utilizada/);
 await rejected(()=>call('transfer_crowns',[luis,2000,crypto.randomUUID()]),/suficientes/);
 await rejected(()=>call('transfer_crowns',[stranger,1,crypto.randomUUID()]),/aceptar la amistad/);
 assert.equal((await call('my_wallet')).spending,30000);
});
test('opening a menu notifies accepted friends, suppresses spam and respects per-friend muting',async()=>{
 await uid(luis);const f=(await call('my_friends'))[0];await call('mute_friend',[f.id,true]);
 await uid(martin);assert.equal(await call('announce_location',[local]),true);
 let notices=(await db.query("select * from notifications where user_id=$1 and kind='outing'",[luis])).rows;assert.equal(notices.length,0);
 assert.equal(await call('announce_location',[local]),false);
 await db.exec("update activity set created_at=now()-interval '3 hours'");await uid(luis);await call('mute_friend',[f.id,false]);await uid(martin);assert.equal(await call('announce_location',[local]),true);
 notices=(await db.query("select * from notifications where user_id=$1 and kind='outing'",[luis])).rows;assert.equal(notices.length,1);assert.match(notices[0].message,/Martín.*🍺/);
 await call('set_activity_sharing',[false]);await db.exec("update activity set created_at=now()-interval '3 hours'");assert.equal(await call('announce_location',[local]),false);
});
test('redemptions reserve crowns, expire safely, and only trusted POS can confirm',async()=>{
 await uid(luis);const id=crypto.randomUUID();const redemption=await call('create_redemption',[local,1000,id]);assert.equal((await call('my_wallet')).balance,1200);
 assert.equal((await call('create_redemption',[local,1000,id])).id,id);
 await db.exec('set role authenticated');await rejected(()=>call('pos_confirm_redemption',[local,redemption.code]),/permission denied/);await db.exec('reset role');
 await db.query("update redemptions set expires_at=now()-interval '1 minute' where id=$1",[id]);assert.equal((await call('my_wallet')).balance,2200);assert.equal((await call('my_wallet')).balance,2200);
 const second=await call('create_redemption',[local,1000,crypto.randomUUID()]);await call('pos_confirm_redemption',[local,second.code]);const repeated=await call('pos_confirm_redemption',[local,second.code]);assert.equal(repeated.already_used,true);
 await rejected(()=>call('cancel_redemption',[second.id]),/no disponible/);
});
test('cancelled sales reverse pending credits and create debt for already spent credits',async()=>{
 await call('pos_cancel_sale',[local,'folio-1']);await call('pos_cancel_sale',[local,'folio-1']);await uid(martin);const w=await call('my_wallet');assert.equal(w.balance,0);assert.equal(w.debt,1000);assert.equal(w.spending,0);
 await uid(luis);const l=await call('my_wallet');assert.equal(l.balance,0);assert.equal(l.debt,0);
});
test('admin and cashier permissions cannot be claimed through profile metadata',async()=>{
 await uid(martin);await rejected(()=>call('admin_summary'),/No tienes acceso/);
 await rejected(()=>call('staff_member',[local,'ANYCODE']),/No tienes acceso/);
 await db.query('insert into public.staff(user_id,role) values($1,$2)',[luis,'admin']);
 await uid(luis);assert.equal((await call('my_staff_role')).role,'admin');assert.equal((await call('admin_summary')).members,3);
 await call('admin_upsert_location',[null,'Local nuevo','Dirección real de prueba','Providencia','https://qrfy.io/p/example',null,null,true]);
 await uid(martin);await db.exec('set role authenticated');await rejected(()=>db.query("insert into public.staff(user_id,role) values($1,'admin')",[martin]),/permission denied/);await db.exec('reset role');
});
test('linking a redeemed discount to a receipt returns it exactly once on cancellation',async()=>{
 const code=(await db.query('select member_code from profiles where id=$1',[luis])).rows[0].member_code;
 await call('pos_record_sale',[local,'folio-2',30000,1,[code]]);
 await db.exec("update ledger set available_at=now()-interval '1 minute' where kind='purchase' and not settled");
 // Reset the previous test's used redemption date to test another business day.
 await db.query("update redemptions set created_at=now()-interval '2 days' where user_id=$1",[luis]);
 await uid(luis);assert.equal((await call('my_wallet')).balance,1200);
 const item=await call('create_redemption',[local,1000,crypto.randomUUID()]);
 await call('pos_record_sale',[local,'folio-3',9000,1,[code],item.code]);assert.equal((await call('my_wallet')).balance,200);
 await call('pos_cancel_sale',[local,'folio-3']);await call('pos_cancel_sale',[local,'folio-3']);assert.equal((await call('my_wallet')).balance,1200);assert.equal((await call('my_wallet')).pending,0);
});
test('reversing an old receipt does not reduce consumption in the current 12-month window',async()=>{
 const code=(await db.query('select member_code from profiles where id=$1',[luis])).rows[0].member_code;
 const receipt=await call('pos_record_sale',[local,'old-folio',20000,1,[code]]);
 await db.query("update ledger set spending_at=now()-interval '13 months' where receipt_id=$1",[receipt]);
 await uid(luis);const before=(await call('my_wallet')).spending;
 await call('pos_cancel_sale',[local,'old-folio']);assert.equal((await call('my_wallet')).spending,before);
});
test('manual credits require admin role and reject direct writes, ordinary users and cashiers',async()=>{
 const code=(await db.query('select member_code from profiles where id=$1',[martin])).rows[0].member_code;
 await uid(martin);await db.exec('set role anon');
 await rejected(()=>call('admin_credit_crowns',[code,5000,'Prueba del Club',crypto.randomUUID()]),/permission denied/);
 await db.exec('set role authenticated');
 await rejected(()=>call('admin_credit_crowns',[code,5000,'Prueba del Club',crypto.randomUUID()]),/No tienes acceso/);
 await rejected(()=>call('admin_credit_history'),/No tienes acceso/);
 await rejected(()=>db.query('select * from admin_credits'),/permission denied/);
 await rejected(()=>db.query("insert into admin_credits values(gen_random_uuid(),$1,$1,5000,'Prueba',now())",[martin]),/permission denied/);
 await db.exec('reset role');
 await db.query("insert into staff(user_id,role,location_id) values($1,'cashier',$2)",[stranger,local]);
 await uid(stranger);await rejected(()=>call('admin_credit_crowns',[code,5000,'Prueba del Club',crypto.randomUUID()]),/No tienes acceso/);
});
test('admin credits cover debt first, are immediately transferable and never increase spending',async()=>{
 const code=(await db.query('select member_code from profiles where id=$1',[martin])).rows[0].member_code;
 await uid(luis);await db.exec('set role authenticated');
 const id=crypto.randomUUID();const result=await call('admin_credit_crowns',[code,5000,'Prueba entre amigos',id]);
 assert.equal(result.balance,4000);assert.equal(result.already_applied,false);
 assert.equal((await call('admin_credit_crowns',[code,5000,'Prueba entre amigos',id])).already_applied,true);
 await rejected(()=>call('admin_credit_crowns',[code,5001,'Prueba entre amigos',id]),/otros datos/);
 await rejected(()=>call('admin_credit_crowns',[code,5000,'Otro motivo',id]),/otros datos/);
 const history=await call('admin_credit_history');assert.equal(history.length,1);assert.equal(history[0].amount,5000);assert.equal(history[0].member_code,code);
 await uid(martin);const wallet=await call('my_wallet');assert.equal(wallet.balance,4000);assert.equal(wallet.debt,0);assert.equal(wallet.spending,0);
 await call('transfer_crowns',[luis,2000,crypto.randomUUID()]);assert.equal((await call('my_wallet')).balance,2000);
 await uid(luis);assert.equal((await call('my_wallet')).balance,3200);assert.equal((await call('my_wallet')).spending,30000);
 await db.exec('reset role');
 assert.equal((await db.query("select count(*)::int as n from ledger where kind='admin_credit'")).rows[0].n,1);
 assert.equal((await db.query("select count(*)::int as n from notifications where kind='admin_credit'")).rows[0].n,1);
});
test('invalid manual credits cannot change balances or audit history',async()=>{
 const code=(await db.query('select member_code from profiles where id=$1',[martin])).rows[0].member_code;
 await uid(luis);
 for(const amount of [null,0,-1,20001])await rejected(()=>call('admin_credit_crowns',[code,amount,'Prueba del Club',crypto.randomUUID()]),/Indica entre/);
 for(const reason of [null,'    ','abcd','a'.repeat(201)])await rejected(()=>call('admin_credit_crowns',[code,5000,reason,crypto.randomUUID()]),/Indica entre/);
 await rejected(()=>call('admin_credit_crowns',[code,5000,'Prueba del Club',null]),/Indica entre/);
 await rejected(()=>call('admin_credit_crowns',['NOEXISTE1234',5000,'Prueba del Club',crypto.randomUUID()]),/no encontrado/);
 assert.equal((await call('admin_credit_history')).length,1);
 await uid(martin);assert.equal((await call('my_wallet')).balance,2000);
});
test('all five tiers report and earn the new rates at their consumption boundaries',async()=>{
 for(const [spending,tier,pct] of [[0,'Plebeyo',4],[49999,'Plebeyo',4],[50000,'Comerciante',6],[149999,'Comerciante',6],[150000,'Guardia Real',8],[349999,'Guardia Real',8],[350000,'Noble',10],[699999,'Noble',10],[700000,'Rey',12]]){
  await db.exec('begin');
  try{
   await uid(luis);await db.query('update ledger set spending=0 where user_id=$1',[luis]);
   await db.query("insert into ledger(user_id,amount,kind,note,spending) values($1,0,'admin_credit','Tier boundary fixture',$2)",[luis,spending]);
   const w=await call('my_wallet');assert.equal(w.tier,tier);assert.equal(w.pct,pct);
   const code=(await db.query('select member_code from profiles where id=$1',[luis])).rows[0].member_code;
   const receipt=await call('pos_record_sale',[local,'tier-boundary',10000,1,[code]]);
   assert.equal((await db.query("select amount from ledger where receipt_id=$1 and kind='purchase'",[receipt])).rows[0].amount,100*pct);
  }finally{await db.exec('rollback');}
 }
});
test('pilot setup is admin-only, credits 5000/3000 once and creates five fixed vouchers',async()=>{
 const codes=(await db.query('select id,member_code from profiles')).rows;const m=codes.find(c=>c.id===martin).member_code,l=codes.find(c=>c.id===luis).member_code;
 await uid(martin);await rejected(()=>call('admin_prepare_test_pilot',[m,l]),/No tienes acceso/);
 await uid(luis);await rejected(()=>call('admin_prepare_test_pilot',[m,m]),/dos códigos/);
 await db.exec('begin');
 try{
  const start=(await call('my_wallet')).balance;
  const p=await call('admin_prepare_test_pilot',[m,l]);assert.equal(p.vouchers.length,5);assert.equal(p.enabled,true);
  assert.equal((await call('my_wallet')).balance,start+3000);
  await call('admin_prepare_test_pilot',[m,l]);assert.equal((await call('my_wallet')).balance,start+3000);
  await uid(martin);assert.equal((await call('my_wallet')).balance,7000);
 }finally{await db.exec('rollback');}
});
test('standalone SQL credits existing Martín/Luis accounts once and later pilot setup does not duplicate them',async()=>{
 const sql=await readFile(new URL('../supabase/scripts/cargar-coronas-martin-luis.sql',import.meta.url),'utf8');
 await db.exec(sql);await db.exec(sql);
 await uid(martin);assert.equal((await call('my_wallet')).balance,7000);assert.equal((await call('my_wallet')).spending,0);
 await uid(luis);assert.equal((await call('my_wallet')).balance,6200);
 const codes=(await db.query('select id,member_code from profiles')).rows;
 const p=await call('admin_prepare_test_pilot',[codes.find(c=>c.id===martin).member_code,codes.find(c=>c.id===luis).member_code]);
 assert.equal(p.vouchers.length,5);assert.equal((await call('my_wallet')).balance,6200);
 await uid(martin);assert.equal((await call('my_wallet')).balance,7000);
});
test('test vouchers and virtual location are restricted to selected accounts',async()=>{
 const testLocation='70000000-0000-4000-8000-000000000001';
 await uid(stranger);await db.exec('set role authenticated');
 assert.equal((await call('my_test_pilot')).enabled,false);
 assert.equal((await db.query('select id from locations where id=$1',[testLocation])).rows.length,0);
 await rejected(()=>call('claim_test_receipt',['PRUEBA-60000']),/no participa/);
 await rejected(()=>call('activate_my_test_crowns'),/does not exist/);
 await rejected(()=>call('create_redemption',[testLocation,1000,crypto.randomUUID()]),/Local no disponible/);
 await rejected(()=>call('announce_location',[testLocation]),/Local no disponible/);
 await rejected(()=>db.query('select * from test_vouchers'),/permission denied/);
 await db.exec('set role anon');assert.equal((await db.query('select id from locations where id=$1',[testLocation])).rows.length,0);
 await rejected(()=>call('claim_test_receipt',['PRUEBA-60000']),/permission denied/);await db.exec('reset role');
});
test('60000 receipt earns 2400, validates a discount and waits 24 hours after redemption',async()=>{
 await uid(martin);const p=await call('my_test_pilot');assert.equal(p.participant,true);
 await rejected(()=>call('claim_test_receipt',['PRUEBA-NOEXISTE']),/no encontrado/);
 const ficha=await call('create_redemption',[p.location_id,1000,crypto.randomUUID()]);
 const result=await call('claim_test_receipt',['PRUEBA-60000',ficha.code]);assert.equal(result.earned,2400);assert.equal(result.already_claimed,false);
 assert.equal((await call('claim_test_receipt',['PRUEBA-60000',ficha.code])).already_claimed,true);
 const w=await call('my_wallet');assert.equal(w.balance,6000);assert.equal(w.pending,2400);assert.equal(w.tier,'Comerciante');assert.equal(w.pct,6);
 await uid(luis);await rejected(()=>call('claim_test_receipt',['PRUEBA-60000']),/otro socio/);
 await uid(martin);
 const member=(await db.query('select member_code from profiles where id=$1',[martin])).rows[0].member_code;
 await call('pos_record_sale',[local,'real-pending-control',10000,1,[member]]);
 const deadline=(await db.query("select extract(epoch from (available_at-created_at))::int as seconds from ledger where receipt_id=$1 and kind='purchase'",[result.receipt_id])).rows[0].seconds;
 assert.equal(deadline,86400);
 await rejected(()=>call('activate_my_test_crowns'),/does not exist/);
 // Advance only this fixture's deadline to exercise expiration without a production shortcut.
 await db.query("update ledger set available_at=now()-interval '1 second' where receipt_id=$1",[result.receipt_id]);
 assert.equal((await call('my_wallet')).balance,8400);assert.equal((await call('my_wallet')).balance,8400);
 const after=await call('my_wallet');assert.equal(after.balance,8400);assert.equal(after.pending,600);
 await call('transfer_crowns',[luis,1000,crypto.randomUUID()]);assert.equal((await call('my_wallet')).balance,7400);
});
test('remaining vouchers use the current rank and cap; cancellation reverses and restores the linked discount',async()=>{
 await uid(martin);assert.equal((await call('claim_test_receipt',['PRUEBA-15000'])).earned,900);
 await uid(luis);assert.equal((await call('claim_test_receipt',['PRUEBA-30000'])).earned,1200);
 assert.equal((await call('claim_test_receipt',['PRUEBA-90000'])).earned,5400);
 assert.equal((await call('claim_test_receipt',['PRUEBA-120000'])).earned,8000);
 assert.equal((await call('my_wallet')).pending,14600);
 await db.query("update ledger set available_at=now()-interval '1 second' where user_id=$1 and kind='purchase' and not settled",[luis]);
 assert.equal((await call('my_wallet')).pending,0);
 const p=await call('my_test_pilot');assert.equal(p.vouchers.filter(v=>v.claimed).length,5);
 await call('staff_cancel_sale',[p.location_id,'PRUEBA-60000']);await call('staff_cancel_sale',[p.location_id,'PRUEBA-60000']);
 await uid(martin);assert.equal((await call('my_wallet')).balance,6000);
 await rejected(()=>call('claim_test_receipt',['PRUEBA-60000']),/Boleta anulada/);
});
test('closing the pilot releases reservations and disables claims without silently deleting balances',async()=>{
 await uid(luis);const p=await call('my_test_pilot');const before=(await call('my_wallet')).balance;
 const ficha=await call('create_redemption',[p.location_id,1000,crypto.randomUUID()]);assert.equal((await call('my_wallet')).balance,before-1000);
 await call('admin_close_test_pilot');assert.equal((await call('my_wallet')).balance,before);
 assert.equal((await call('my_test_pilot')).enabled,false);
 await rejected(()=>call('claim_test_receipt',['PRUEBA-30000']),/no participa/);
 await rejected(()=>call('activate_my_test_crowns'),/does not exist/);
 assert.equal((await db.query('select status from redemptions where id=$1',[ficha.id])).rows[0].status,'expired');
 await db.exec('set role authenticated');assert.equal((await db.query('select id from locations where id=$1',[p.location_id])).rows.length,0);await db.exec('reset role');
});
