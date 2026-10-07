import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
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
 await db.exec(await readFile(new URL('../supabase/migrations/202610070001_club.sql',import.meta.url),'utf8'));
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
 await uid(martin);const wallet=await call('my_wallet');assert.equal(wallet.balance,0);assert.equal(wallet.pending,2400);assert.equal(wallet.spending,30000);
 await rejected(()=>call('transfer_crowns',[luis,1,crypto.randomUUID()]),/suficientes/);
 await rejected(()=>call('pos_record_sale',[local,'folio-1',60001,2,codes]),/datos distintos/);
});
test('activated crowns transfer atomically and retrying the same id does not double debit',async()=>{
 await db.exec("update ledger set available_at=now()-interval '1 minute' where kind='purchase'");
 await uid(martin);const id=crypto.randomUUID();await call('transfer_crowns',[luis,1000,id]);await call('transfer_crowns',[luis,1000,id]);
 assert.equal((await call('my_wallet')).balance,1400);await uid(luis);assert.equal((await call('my_wallet')).balance,3400);
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
 await uid(luis);const id=crypto.randomUUID();const redemption=await call('create_redemption',[local,1000,id]);assert.equal((await call('my_wallet')).balance,2400);
 assert.equal((await call('create_redemption',[local,1000,id])).id,id);
 await db.exec('set role authenticated');await rejected(()=>call('pos_confirm_redemption',[local,redemption.code]),/permission denied/);await db.exec('reset role');
 await db.query("update redemptions set expires_at=now()-interval '1 minute' where id=$1",[id]);assert.equal((await call('my_wallet')).balance,3400);assert.equal((await call('my_wallet')).balance,3400);
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
 await uid(luis);assert.equal((await call('my_wallet')).balance,2400);
 const item=await call('create_redemption',[local,1000,crypto.randomUUID()]);
 await call('pos_record_sale',[local,'folio-3',9000,1,[code],item.code]);assert.equal((await call('my_wallet')).balance,1400);
 await call('pos_cancel_sale',[local,'folio-3']);await call('pos_cancel_sale',[local,'folio-3']);assert.equal((await call('my_wallet')).balance,2400);assert.equal((await call('my_wallet')).pending,0);
});
test('reversing an old receipt does not reduce consumption in the current 12-month window',async()=>{
 const code=(await db.query('select member_code from profiles where id=$1',[luis])).rows[0].member_code;
 const receipt=await call('pos_record_sale',[local,'old-folio',20000,1,[code]]);
 await db.query("update ledger set spending_at=now()-interval '13 months' where receipt_id=$1",[receipt]);
 await uid(luis);const before=(await call('my_wallet')).spending;
 await call('pos_cancel_sale',[local,'old-folio']);assert.equal((await call('my_wallet')).spending,before);
});
