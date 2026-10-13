// Ranking del Club (migración 202610130001): posiciones, privacidad y exclusión de locales de prueba.
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

let db;
const ids=Object.fromEntries(['ana','beto','carla','diego','eli','fede'].map((n,i)=>[n,`00000000-0000-4000-8000-0000000001${String(i).padStart(2,'0')}`]));
const realLocal='20000000-0000-4000-8000-000000000001',testLocal='20000000-0000-4000-8000-000000000002';
const ruts={ana:'123456785',beto:'111111111',carla:'222222222',diego:'333333333',eli:'444444444',fede:'555555555'};
async function uid(id){await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);}
async function ranking(who,top=10){await uid(ids[who]);return (await db.query('select public.club_ranking($1) as r',[top])).rows[0].r;}
async function spend(who,amount,{daysAgo=0,local=realLocal}={}){
 const code=(await db.query('select member_code from public.profiles where id=$1',[ids[who]])).rows[0].member_code;
 const folio=`f-${who}-${amount}-${daysAgo}-${local.slice(-1)}`;
 await db.query('select public.pos_record_sale($1,$2,$3,1,$4)',[local,folio,amount,[code]]);
 if(daysAgo)await db.query("update public.ledger set spending_at=now()-($1||' days')::interval where receipt_id=(select id from public.receipts where folio=$2)",[String(daysAgo),folio]);
}

before(async()=>{
 db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb);
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;`);
 for(const filename of (await readdir(new URL('../supabase/migrations/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort())
  await db.exec(await readFile(new URL('../supabase/migrations/'+filename,import.meta.url),'utf8'));
 const names={ana:'Ana',beto:'Beto',carla:'Carla',diego:'Diego',eli:'Eli',fede:'Fede'};
 for(const k of Object.keys(ids)){
  await db.query('insert into auth.users values($1,$2)',[ids[k],JSON.stringify({first_name:names[k],last_name:'Pérez',rut:ruts[k],phone:'+56912345678',birthday:'1995-05-05',terms:true})]);
  await new Promise(r=>setTimeout(r,5)); // created_at distinto para el desempate
 }
 await db.query('insert into public.locations(id,name,address,commune,menu_url,verified,active,is_test) values($1,$2,$3,$4,$5,true,true,false),($6,$7,$8,$9,$5,true,true,true)',
  [realLocal,'Rey real','Dirección real','Santiago','https://qrfy.io/p/oOBx-dlqTy',testLocal,'Rey de pruebas','Dirección de pruebas','Pruebas']);
 // Consumo de 12 meses: Ana 800.000 (Rey) · Beto 400.000 (Noble) · Carla 200.000 (Guardia) · Diego 60.000 (Comerciante) · Eli 10.000 (Plebeyo)
 await spend('ana',800000);await spend('beto',400000);await spend('carla',200000);await spend('diego',60000);await spend('eli',10000);
 await spend('fede',900000,{local:testLocal}); // solo local de prueba: no debe clasificar
});
after(async()=>{await db.close();});

test('requiere sesión y el rol anónimo no puede consultar el ranking',async()=>{
 await uid('');await assert.rejects(()=>db.query('select public.club_ranking(10)'),/Inicia sesión/);
 await db.exec('set role anon');await assert.rejects(()=>db.query('select public.club_ranking(10)'),/permission denied/);await db.exec('reset role');
 await db.exec('set role authenticated');await uid(ids.ana);await assert.doesNotReject(()=>db.query('select public.club_ranking(10)'));await db.exec('reset role');
});

test('ordena por consumo de 12 meses y calcula la posición, el total y la brecha de quien consulta',async()=>{
 const r=await ranking('eli');
 assert.equal(r.total,5);
 assert.deepEqual(r.top.map(x=>x.position),[1,2,3,4,5]);
 assert.deepEqual(r.top.map(x=>x.tier),['Rey','Noble','Guardia Real','Comerciante','Plebeyo']);
 assert.equal(r.me.position,5);assert.equal(r.me.tier,'Plebeyo');
 assert.equal(r.me.gap,50000);       // 60.000 (puesto 4) − 10.000
 assert.equal(r.me.gap_top,0);       // ya está dentro del Top 10
});

test('el límite recorta el podio y calcula cuánto falta para entrar al Top N',async()=>{
 const r=await ranking('eli',3);
 assert.equal(r.top.length,3);assert.equal(r.limit,3);
 assert.equal(r.me.position,5);
 assert.equal(r.me.gap_top,190000); // 200.000 (puesto 3) − 10.000
 assert.equal((await ranking('eli',999)).limit,25,'el tope máximo es 25');
});

test('nadie aparece con nombre si no lo activó, y el nombre público es nombre + inicial',async()=>{
 let r=await ranking('eli');
 assert.ok(r.top.every(x=>x.name===null),'por defecto todos son anónimos');
 await uid(ids.beto);await db.query('select public.set_ranking_visibility(true)');
 await uid(ids.diego);await db.query('select public.set_ranking_visibility(true)');
 r=await ranking('eli');
 assert.deepEqual(r.top.map(x=>x.name),[null,'Beto P.',null,'Diego P.',null]);
 await uid(ids.beto);await db.query('select public.set_ranking_visibility(false)');
 assert.equal((await ranking('eli')).top[1].name,null,'apagarlo vuelve a ocultar el nombre');
});

test('la respuesta no filtra datos personales ni montos ajenos',async()=>{
 const text=JSON.stringify(await ranking('eli'));
 for(const secret of [...Object.values(ruts),'+56912345678','Pérez','member_code','1995-05-05','800000','400000','200000','60000'])
  assert.ok(!text.includes(secret),'no debe exponer '+secret);
});

test('el consumo en locales de prueba y fuera de 12 meses no cuenta',async()=>{
 const r=await ranking('fede');
 assert.equal(r.me,null,'quien solo consumió en un local de prueba no clasifica');
 assert.equal(r.total,5);
 await spend('fede',5000,{daysAgo:400});
 assert.equal((await ranking('fede')).me,null,'consumo de hace más de 12 meses no cuenta');
});

test('en un empate gana el socio más antiguo',async()=>{
 await spend('carla',10000);await spend('eli',200000); // ambos quedan en 210.000
 assert.equal((await ranking('carla')).me.position,3);
 assert.equal((await ranking('eli')).me.position,4);
 const r=await ranking('diego');
 assert.equal(r.me.position,5);
 assert.equal(r.top.filter(x=>x.me).length,1,'el listado marca solo a quien consulta');
});

test('set_ranking_visibility exige sesión',async()=>{
 await uid('');await assert.rejects(()=>db.query('select public.set_ranking_visibility(true)'),/Inicia sesión/);
});
