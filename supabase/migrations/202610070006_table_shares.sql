-- A checkout fixes the party size. Only trusted POS/cashier code supplies the paid total.
begin;
drop function if exists public.activate_my_test_crowns();
create table public.table_checkouts (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(id),
 code text not null unique default ('M'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,11))),
 people integer not null check(people between 1 and 20),
 receipt_id uuid unique references public.receipts(id),
 created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '24 hours'
);
create index table_checkouts_owner on public.table_checkouts(user_id,created_at desc);
create table public.receipt_tables (
 receipt_id uuid primary key references public.receipts(id),
 payer_id uuid not null references public.profiles(id),
 token text not null unique default replace(gen_random_uuid()::text,'-',''),
 expires_at timestamptz not null default now()+interval '7 days'
);
alter table public.table_checkouts enable row level security;
alter table public.receipt_tables enable row level security;
revoke all on public.table_checkouts, public.receipt_tables from anon,authenticated;

create function public.prepare_table(people_value integer,request_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare item public.table_checkouts;
begin
 if auth.uid() is null then raise exception 'Inicia sesión'; end if;
 if people_value is null or people_value not between 1 and 20 or request_id is null then raise exception 'Indica entre 1 y 20 personas'; end if;
 perform 1 from public.profiles where id=auth.uid() for update;
 select * into item from public.table_checkouts where id=request_id;
 if found then
  if item.user_id<>auth.uid() or item.people<>people_value then raise exception 'Solicitud ya utilizada'; end if;
  return to_jsonb(item);
 end if;
 if (select count(*) from public.table_checkouts where user_id=auth.uid() and created_at>now()-interval '1 hour')>=20 then raise exception 'Espera antes de preparar otra mesa'; end if;
 insert into public.table_checkouts(id,user_id,people) values(request_id,auth.uid(),people_value) returning * into item;
 return to_jsonb(item);
end $$;
create function public.my_table_checkouts() returns jsonb language sql security definer set search_path=public as $$
 select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc),'[]') from
 (select id,code,people,receipt_id,created_at,expires_at from public.table_checkouts
  where user_id=auth.uid() and receipt_id is null and expires_at>now() order by created_at desc limit 20) t;
$$;
create function public.my_receipt_tables() returns jsonb language sql security definer set search_path=public as $$
 select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc),'[]') from (
 select rt.token,rt.expires_at,r.folio,r.amount,r.people,r.amount/r.people as part,r.created_at,r.cancelled_at,
  (select count(*) from public.ledger where receipt_id=r.id and kind='purchase') as claimed,
  l.name as location_name
 from public.receipt_tables rt join public.receipts r on r.id=rt.receipt_id join public.locations l on l.id=r.location_id
 where rt.payer_id=auth.uid() order by r.created_at desc limit 30) t;
$$;

-- Keep the existing split-at-POS path, including integrations that already send all member codes.
alter function public.pos_record_sale(uuid,text,bigint,integer,text[],text) rename to pos_record_sale_direct;
revoke execute on function public.pos_record_sale_direct(uuid,text,bigint,integer,text[],text) from public,anon,authenticated,service_role;
create function public.pos_record_sale(location_value uuid,folio_value text,amount_value bigint,people_value integer,codes text[],redemption_code text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare checkout public.table_checkouts; receipt public.receipts; member_code_value text; receipt_value uuid; linked_code text;
begin
 select * into checkout from public.table_checkouts where code=any(codes) for update;
 if checkout.id is null then
  return public.pos_record_sale_direct(location_value,folio_value,amount_value,people_value,codes,redemption_code);
 end if;
 if cardinality(codes)<>1 then raise exception 'Usa solo el código de mesa; los invitados reclaman por enlace'; end if;
 if people_value is distinct from checkout.people then raise exception 'La cantidad de personas debe coincidir con el código de mesa'; end if;
 if checkout.receipt_id is not null then
  select * into receipt from public.receipts where id=checkout.receipt_id for update;
  if receipt.location_id is distinct from location_value or receipt.folio is distinct from folio_value or receipt.amount is distinct from amount_value then raise exception 'Código de mesa ya usado en otra boleta'; end if;
  if receipt.cancelled_at is not null then raise exception 'Boleta anulada'; end if;
  if redemption_code is not null then
   select code into linked_code from public.redemptions where id=receipt.redemption_id;
   if linked_code is distinct from upper(redemption_code) then raise exception 'Folio vinculado a otra ficha'; end if;
  end if;
  return receipt.id;
 end if;
 if checkout.expires_at<=now() then raise exception 'Código de mesa vencido; prepara uno nuevo'; end if;
 select member_code into member_code_value from public.profiles where id=checkout.user_id;
 receipt_value:=public.pos_record_sale_direct(location_value,folio_value,amount_value,people_value,array[member_code_value],redemption_code);
 insert into public.receipt_tables(receipt_id,payer_id) values(receipt_value,checkout.user_id);
 update public.table_checkouts set receipt_id=receipt_value where id=checkout.id;
 return receipt_value;
end $$;
revoke execute on function public.pos_record_sale(uuid,text,bigint,integer,text[],text) from public,anon,authenticated;
grant execute on function public.pos_record_sale(uuid,text,bigint,integer,text[],text) to service_role;

-- Checkout lookup returns the same member data plus the party size; staff wrappers retain their checks.
alter function public.pos_member(text) rename to pos_member_direct;
revoke execute on function public.pos_member_direct(text) from public,anon,authenticated,service_role;
create function public.pos_member(code_value text) returns jsonb language plpgsql security definer set search_path=public as $$
declare checkout public.table_checkouts; member_code_value text;
begin
 select * into checkout from public.table_checkouts where code=upper(trim(code_value));
 if checkout.id is null then return public.pos_member_direct(code_value); end if;
 if checkout.receipt_id is not null then raise exception 'Código de mesa ya usado'; end if;
 if checkout.expires_at<=now() then raise exception 'Código de mesa vencido'; end if;
 select member_code into member_code_value from public.profiles where id=checkout.user_id;
 return public.pos_member_direct(member_code_value)||jsonb_build_object('table_code',checkout.code,'people',checkout.people);
end $$;
revoke execute on function public.pos_member(text) from public,anon,authenticated;
grant execute on function public.pos_member(text) to service_role;

-- Public bearer-link preview exposes only the meal and remaining capacity, never member identities.
create function public.table_share_info(token_value text) returns jsonb language plpgsql security definer set search_path=public as $$
declare t public.receipt_tables; r public.receipts; used_count integer; own_claim public.ledger;
begin
 select * into t from public.receipt_tables where token=token_value;
 if t.receipt_id is null then raise exception 'Enlace de mesa no encontrado'; end if;
 select * into r from public.receipts where id=t.receipt_id;
 select count(*) into used_count from public.ledger where receipt_id=r.id and kind='purchase';
 select * into own_claim from public.ledger where receipt_id=r.id and kind='purchase' and user_id=auth.uid();
 return jsonb_build_object('amount',r.amount,'people',r.people,'part',r.amount/r.people,
  'remaining',greatest(0,r.people-used_count),'expires_at',t.expires_at,
  'cancelled',r.cancelled_at is not null,'expired',t.expires_at<=now(),
  'location_name',(select name from public.locations where id=r.location_id),
  'claimed',own_claim.id is not null,'earned',own_claim.amount,'available_at',own_claim.available_at);
end $$;
create function public.claim_table_share(token_value text) returns jsonb language plpgsql security definer set search_path=public as $$
declare t public.receipt_tables; r public.receipts; previous public.ledger; part bigint; spent bigint; pct integer; earned bigint;
begin
 if auth.uid() is null then raise exception 'Inicia sesión para recibir tus coronas'; end if;
 select * into t from public.receipt_tables where token=token_value;
 if t.receipt_id is null then raise exception 'Enlace de mesa no encontrado'; end if;
 -- Claims and cancellations serialize on the same receipt, before taking wallet locks.
 select * into r from public.receipts where id=t.receipt_id for update;
 if r.cancelled_at is not null then raise exception 'Boleta anulada'; end if;
 select * into previous from public.ledger where receipt_id=r.id and user_id=auth.uid() and kind='purchase';
 if found then return jsonb_build_object('earned',previous.amount,'part',previous.spending,'available_at',previous.available_at,'already_claimed',true); end if;
 if t.expires_at<=now() then raise exception 'El enlace de esta mesa venció'; end if;
 if (select count(*) from public.ledger where receipt_id=r.id and kind='purchase')>=r.people then raise exception 'Ya se reclamaron todos los cupos de esta mesa'; end if;
 perform 1 from public.wallets where user_id=auth.uid() for update;
 select coalesce(sum(spending),0) into spent from public.ledger where user_id=auth.uid() and spending_at>=now()-interval '12 months';
 pct:=case when spent>=700000 then 12 when spent>=350000 then 10 when spent>=150000 then 8 when spent>=50000 then 6 else 4 end;
 part:=r.amount/r.people;earned:=least(8000,part*pct/100);
 insert into public.ledger(user_id,amount,kind,available_at,settled,spending,spending_at,receipt_id,note)
 values(auth.uid(),earned,'purchase',now()+interval '24 hours',false,part,r.created_at,r.id,'Mi parte de la mesa · boleta '||r.folio)
 returning * into previous;
 insert into public.notifications(user_id,kind,message) values(auth.uid(),'purchase','Tu parte de la mesa sumó '||earned||' coronas. Se activan en 24 horas 👑');
 return jsonb_build_object('earned',earned,'part',part,'pct',pct,'available_at',previous.available_at,'already_claimed',false);
end $$;

-- Test receipts use the same party checkout and POS accounting as a real cashier.
drop function public.claim_test_receipt(text,text);
create function public.claim_test_receipt(code_value text,redemption_code text default null,table_code text default null) returns jsonb
language plpgsql security definer set search_path=public as $$
declare p public.test_pilot; v public.test_vouchers; checkout public.table_checkouts; member_code_value text; receipt uuid; earned bigint; receipt_row public.receipts;
begin
 select * into p from public.test_pilot where active for share;
 if p.id is null or auth.uid() is null or auth.uid() not in(p.martin_id,p.luis_id) then raise exception 'Tu cuenta no participa en la prueba activa'; end if;
 select * into v from public.test_vouchers where code=upper(trim(code_value)) for update;
 if v.code is null then raise exception 'Código de boleta de prueba no encontrado'; end if;
 if v.claimed_by is not null then
  if v.claimed_by<>auth.uid() then raise exception 'Esta boleta ya fue canjeada por otro socio'; end if;
  select * into receipt_row from public.receipts where id=v.receipt_id;
  if receipt_row.cancelled_at is not null then raise exception 'Boleta anulada'; end if;
  if table_code is not null and not exists(select 1 from public.table_checkouts where receipt_id=v.receipt_id and code=upper(trim(table_code))) then raise exception 'Boleta ya vinculada a otra mesa'; end if;
  if nullif(trim(redemption_code),'') is not null and not exists(select 1 from public.redemptions where id=receipt_row.redemption_id and code=upper(trim(redemption_code))) then raise exception 'Folio vinculado a otra ficha'; end if;
  select amount into earned from public.ledger where receipt_id=v.receipt_id and user_id=auth.uid() and kind='purchase';
  return jsonb_build_object('receipt_id',v.receipt_id,'amount',v.amount,'earned',earned,'already_claimed',true);
 end if;
 select member_code into member_code_value from public.profiles where id=auth.uid();
 if table_code is not null then
  select * into checkout from public.table_checkouts where code=upper(trim(table_code)) and user_id=auth.uid();
  if checkout.id is null then raise exception 'El código de mesa no pertenece a tu cuenta'; end if;
  receipt:=public.pos_record_sale(p.location_id,v.code,v.amount,checkout.people,array[checkout.code],nullif(trim(redemption_code),''));
 else
  receipt:=public.pos_record_sale(p.location_id,v.code,v.amount,1,array[member_code_value],nullif(trim(redemption_code),''));
 end if;
 update public.test_vouchers set claimed_by=auth.uid(),receipt_id=receipt,claimed_at=now() where code=v.code;
 select amount into earned from public.ledger where receipt_id=receipt and user_id=auth.uid() and kind='purchase';
 return jsonb_build_object('receipt_id',receipt,'amount',v.amount,'earned',earned,'already_claimed',false);
end $$;
revoke execute on function public.prepare_table(integer,uuid),public.my_table_checkouts(),public.my_receipt_tables(),public.table_share_info(text),public.claim_table_share(text),public.claim_test_receipt(text,text,text) from public,anon,authenticated;
grant execute on function public.prepare_table(integer,uuid),public.my_table_checkouts(),public.my_receipt_tables(),public.claim_table_share(text),public.claim_test_receipt(text,text,text) to authenticated;
grant execute on function public.table_share_info(text) to anon,authenticated;
create or replace function public.admin_close_test_pilot() returns void language plpgsql security definer set search_path=public as $$
declare p public.test_pilot; item record;
begin
 perform public.require_staff(null,true);
 select * into p from public.test_pilot for update;
 if p.id is null or not p.active then return; end if;
 -- Release unused reservations before hiding the test location. Preserve the audit trail.
 for item in select distinct user_id from public.redemptions where location_id=p.location_id and status='reserved' order by user_id loop
  perform 1 from public.wallets where user_id=item.user_id for update;
  update public.redemptions set expires_at=now() where user_id=item.user_id and location_id=p.location_id and status='reserved';
  perform public.wallet_settle(item.user_id);
 end loop;
 update public.receipt_tables set expires_at=least(expires_at,now()) where receipt_id in(select id from public.receipts where location_id=p.location_id);
 update public.test_pilot set active=false;
 update public.locations set active=false where id=p.location_id;
end $$;

commit;
