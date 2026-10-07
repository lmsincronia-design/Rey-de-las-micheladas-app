-- Explicit, admin-enabled pilot for two existing accounts. No Auth users are fabricated.
begin;
alter table public.locations add column is_test boolean not null default false;
create table public.test_pilot (
 id boolean primary key default true check(id),
 martin_id uuid not null references public.profiles(id),
 luis_id uuid not null references public.profiles(id),
 location_id uuid not null references public.locations(id),
 created_by uuid not null references public.profiles(id),
 active boolean not null default true,
 created_at timestamptz not null default now(), check(martin_id<>luis_id)
);
create table public.test_vouchers (
 code text primary key, amount bigint not null check(amount>0),
 claimed_by uuid references public.profiles(id), receipt_id uuid unique references public.receipts(id),
 claimed_at timestamptz,
 check((claimed_by is null and receipt_id is null and claimed_at is null) or
       (claimed_by is not null and receipt_id is not null and claimed_at is not null))
);
alter table public.test_pilot enable row level security;
alter table public.test_vouchers enable row level security;
revoke all on public.test_pilot,public.test_vouchers from anon,authenticated;

create function public.test_pilot_access() returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.test_pilot where active and auth.uid() in(martin_id,luis_id));
$$;
revoke execute on function public.test_pilot_access() from public;
grant execute on function public.test_pilot_access() to anon,authenticated;
drop policy public_locations on public.locations;
create policy public_locations on public.locations for select to anon,authenticated
 using(active and verified and (not is_test or public.test_pilot_access()));

create function public.my_test_pilot() returns jsonb language plpgsql security definer set search_path=public as $$
declare p public.test_pilot; tickets jsonb; is_admin boolean;
begin
 if auth.uid() is null then raise exception 'Inicia sesión'; end if;
 select exists(select 1 from public.staff where user_id=auth.uid() and role='admin') into is_admin;
 select * into p from public.test_pilot;
 if p.id is null then return jsonb_build_object('enabled',false,'is_admin',is_admin); end if;
 if not is_admin and auth.uid() not in(p.martin_id,p.luis_id) then
  return jsonb_build_object('enabled',false,'is_admin',false);
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('code',v.code,'amount',v.amount,'claimed',v.claimed_by is not null,
  'claimed_by_me',v.claimed_by=auth.uid(),'member_name',pr.first_name,'cancelled',r.cancelled_at is not null) order by v.amount),'[]')
 into tickets from public.test_vouchers v left join public.profiles pr on pr.id=v.claimed_by
 left join public.receipts r on r.id=v.receipt_id;
 return jsonb_build_object('enabled',p.active,'configured',true,'is_admin',is_admin,
  'participant',auth.uid() in(p.martin_id,p.luis_id),'location_id',p.location_id,'vouchers',tickets,
  'martin_code',(select member_code from public.profiles where id=p.martin_id),
  'luis_code',(select member_code from public.profiles where id=p.luis_id));
end $$;

create function public.admin_prepare_test_pilot(martin_code text,luis_code text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare m uuid; l uuid; p public.test_pilot; credit record; previous public.ledger;
 test_location constant uuid:='70000000-0000-4000-8000-000000000001';
begin
 perform public.require_staff(null,true);
 select id into m from public.profiles where member_code=upper(trim(martin_code));
 select id into l from public.profiles where member_code=upper(trim(luis_code));
 if m is null or l is null or m=l then raise exception 'Selecciona dos códigos de socio distintos y existentes'; end if;
 -- Serialize setup, including concurrent first requests; deterministic credit IDs prevent duplicates.
 lock table public.test_pilot in exclusive mode;
 select * into p from public.test_pilot;
 if found then
  if p.martin_id<>m or p.luis_id<>l then raise exception 'La prueba ya tiene otros participantes'; end if;
  return public.my_test_pilot();
 end if;
 insert into public.locations(id,name,address,commune,menu_url,verified,is_test)
 values(test_location,'Rey de pruebas · NO ES UN LOCAL REAL','Local virtual para probar el Club','Pruebas',
 'https://rey-de-las-micheladas-app.vercel.app/carta-prueba',true,true);
 insert into public.test_pilot(martin_id,luis_id,location_id,created_by) values(m,l,test_location,auth.uid());
 perform 1 from public.wallets where user_id in(m,l) order by user_id for update;
 for credit in select * from (values
  (m,martin_code,5000::bigint,'70000000-0000-4000-8000-000000000002'::uuid,'PRUEBA: saldo inicial Martín'),
  (l,luis_code,3000::bigint,'70000000-0000-4000-8000-000000000003'::uuid,'PRUEBA: saldo inicial Luis')
 ) as c(user_id,code,amount,reference,reason) loop
  select * into previous from public.ledger where reference=credit.reference;
  if found then
   if previous.user_id<>credit.user_id or previous.amount<>credit.amount then raise exception 'La carga inicial ya corresponde a otra cuenta'; end if;
  else
   perform public.admin_credit_crowns(credit.code,credit.amount,credit.reason,credit.reference);
  end if;
 end loop;
 insert into public.test_vouchers(code,amount) values
 ('PRUEBA-15000',15000),('PRUEBA-30000',30000),('PRUEBA-60000',60000),('PRUEBA-90000',90000),('PRUEBA-120000',120000);
 return public.my_test_pilot();
end $$;

create function public.claim_test_receipt(code_value text,redemption_code text default null) returns jsonb
language plpgsql security definer set search_path=public as $$
declare p public.test_pilot; v public.test_vouchers; member_code_value text; receipt uuid; earned bigint;
begin
 select * into p from public.test_pilot where active for share;
 if p.id is null or auth.uid() is null or auth.uid() not in(p.martin_id,p.luis_id) then raise exception 'Tu cuenta no participa en la prueba activa'; end if;
 select * into v from public.test_vouchers where code=upper(trim(code_value)) for update;
 if v.code is null then raise exception 'Código de boleta de prueba no encontrado'; end if;
 if v.claimed_by is not null and v.claimed_by<>auth.uid() then raise exception 'Esta boleta ya fue canjeada por otro socio'; end if;
 select member_code into member_code_value from public.profiles where id=auth.uid();
 -- POS owns amount, earning rate, tier, receipt idempotency and redemption validation.
 receipt:=public.pos_record_sale(p.location_id,v.code,v.amount,1,array[member_code_value],nullif(trim(redemption_code),''));
 update public.test_vouchers set claimed_by=auth.uid(),receipt_id=receipt,claimed_at=coalesce(claimed_at,now()) where code=v.code;
 select amount into earned from public.ledger where receipt_id=receipt and kind='purchase';
 return jsonb_build_object('receipt_id',receipt,'amount',v.amount,'earned',earned,'already_claimed',v.claimed_by is not null);
end $$;

create function public.activate_my_test_crowns() returns jsonb language plpgsql security definer set search_path=public as $$
declare p public.test_pilot; total bigint;
begin
 select * into p from public.test_pilot where active for share;
 if p.id is null or auth.uid() is null or auth.uid() not in(p.martin_id,p.luis_id) then raise exception 'Tu cuenta no participa en la prueba activa'; end if;
 perform 1 from public.wallets where user_id=auth.uid() for update;
 select coalesce(sum(amount),0) into total from public.ledger where user_id=auth.uid() and not settled
  and kind='purchase' and receipt_id in(select receipt_id from public.test_vouchers where claimed_by=auth.uid());
 update public.ledger set available_at=now() where user_id=auth.uid() and not settled and kind='purchase'
  and receipt_id in(select receipt_id from public.test_vouchers where claimed_by=auth.uid());
 perform public.wallet_settle(auth.uid());
 if total>0 then insert into public.notifications(user_id,kind,message) values(auth.uid(),'purchase','PRUEBA: activaste '||total||' coronas sin esperar 24 horas 👑'); end if;
 return jsonb_build_object('activated',total);
end $$;

create function public.admin_close_test_pilot() returns void language plpgsql security definer set search_path=public as $$
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
 update public.test_pilot set active=false;
 update public.locations set active=false where id=p.location_id;
end $$;

revoke execute on function public.my_test_pilot(),public.admin_prepare_test_pilot(text,text),
 public.claim_test_receipt(text,text),public.activate_my_test_crowns(),public.admin_close_test_pilot() from public,anon,authenticated;
grant execute on function public.my_test_pilot(),public.admin_prepare_test_pilot(text,text),
 public.claim_test_receipt(text,text),public.activate_my_test_crowns(),public.admin_close_test_pilot() to authenticated;

create or replace function public.create_redemption(location_value uuid,amount_value bigint,request_id uuid) returns public.redemptions language plpgsql security definer set search_path=public as $$
declare me uuid:=auth.uid(); item public.redemptions; funds bigint;
begin
 if me is null then raise exception 'Inicia sesión'; end if;
 perform 1 from public.wallets where user_id=me for update;
 perform public.wallet_settle(me);
 select * into item from public.redemptions where id=request_id;
 if found then
 if item.user_id<>me or item.amount<>amount_value or item.location_id<>location_value then raise exception 'Solicitud ya utilizada'; end if;
 return item;
 end if;
 if request_id is null or amount_value is null or amount_value not between 1000 and 20000 or amount_value%500<>0 then raise exception 'Canje entre 1.000 y 20.000, en múltiplos de 500'; end if;
 if not exists(select 1 from public.locations where id=location_value and active and verified and (not is_test or public.test_pilot_access())) then raise exception 'Local no disponible'; end if;
 if exists(select 1 from public.redemptions where user_id=me and status in('reserved','used') and (created_at at time zone 'America/Santiago')::date=(now() at time zone 'America/Santiago')::date) then raise exception 'Solo un canje al día'; end if;
 select balance into funds from public.wallets where user_id=me;
 if funds<amount_value then raise exception 'Saldo insuficiente'; end if;
 insert into public.redemptions(id,user_id,location_id,amount) values(request_id,me,location_value,amount_value) returning * into item;
 update public.wallets set balance=balance-amount_value where user_id=me;
 insert into public.ledger(user_id,amount,kind,reference,note) values(me,-amount_value,'redemption',item.id,'Coronas reservadas para descuento');
 return item;
end $$;

create or replace function public.announce_location(location_value uuid) returns boolean language plpgsql security definer set search_path=public as $$
declare me uuid:=auth.uid(); sharing boolean; my_name text; local_name text;
begin
 select share_activity,first_name into sharing,my_name from public.profiles where id=me for update;
 if me is null then raise exception 'Inicia sesión'; end if;
 if not sharing then return false; end if;
 select name into local_name from public.locations where id=location_value and active and verified and (not is_test or public.test_pilot_access());
 if local_name is null then raise exception 'Local no disponible'; end if;
 if exists(select 1 from public.activity where user_id=me and (created_at>now()-interval '15 minutes' or (location_id=location_value and created_at>now()-interval '2 hours'))) then return false; end if;
 insert into public.activity(user_id,location_id) values(me,location_value);
 insert into public.notifications(user_id,actor_id,kind,message)
 select case when user_a=me then user_b else user_a end,me,'outing','Parece que se va a poner buenoo: '||my_name||' está mirando la carta de '||local_name||' 🍺'
 from public.friendships where me in(user_a,user_b) and status='accepted' and not(case when user_a=me then mute_b else mute_a end);
 return true;
end $$;

commit;
