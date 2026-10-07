-- Club del Rey: Supabase Auth + PostgreSQL. All money is integer CLP (1 corona = $1).
create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 first_name text not null check(length(first_name) between 2 and 60),
 last_name text not null check(length(last_name) between 2 and 80),
 rut text not null unique, phone text not null, birthday date not null,
 member_code text not null unique default upper(substr(replace(gen_random_uuid()::text,'-',''),1,12)),
 share_activity boolean not null default false, terms_at timestamptz not null default now(),
 created_at timestamptz not null default now()
);
create table public.locations (
 id uuid primary key default gen_random_uuid(), name text not null, address text not null,
 commune text not null, menu_url text not null check(menu_url ~ '^https://'),
 latitude double precision check(latitude between -90 and 90), longitude double precision check(longitude between -180 and 180),
 active boolean not null default true, verified boolean not null default false
);
create table public.wallets (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 balance bigint not null default 0 check(balance >= 0), debt bigint not null default 0 check(debt >= 0)
);
create table public.friendships (
 id uuid primary key default gen_random_uuid(), user_a uuid not null references public.profiles(id) on delete cascade,
 user_b uuid not null references public.profiles(id) on delete cascade,
 requested_by uuid not null references public.profiles(id) on delete cascade,
 mute_a boolean not null default false, mute_b boolean not null default false,
 status text not null default 'pending' check(status in ('pending','accepted')),
 created_at timestamptz not null default now(), unique(user_a,user_b), check(user_a < user_b), check(requested_by in (user_a,user_b))
);
create table public.notifications (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
 actor_id uuid references public.profiles(id) on delete set null, kind text not null,
 message text not null, read_at timestamptz, created_at timestamptz not null default now()
);
create table public.activity (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
 location_id uuid not null references public.locations(id), created_at timestamptz not null default now()
);
create table public.transfers (
 id uuid primary key, sender uuid not null references public.profiles(id), recipient uuid not null references public.profiles(id),
 amount bigint not null check(amount between 1 and 20000), created_at timestamptz not null default now(), check(sender <> recipient)
);
create table public.receipts (
 id uuid primary key default gen_random_uuid(), location_id uuid not null references public.locations(id),
 folio text not null check(length(folio) between 1 and 80), amount bigint not null check(amount between 1 and 10000000),
 people integer not null check(people between 1 and 20), cancelled_at timestamptz,
 created_at timestamptz not null default now(), unique(location_id,folio)
);
create table public.ledger (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id),
 amount bigint not null, kind text not null check(kind in ('purchase','transfer_in','transfer_out','redemption','release','reversal')),
 available_at timestamptz not null default now(), settled boolean not null default true,
 spending bigint not null default 0, spending_at timestamptz not null default now(), reference uuid, receipt_id uuid references public.receipts(id),
 note text not null, created_at timestamptz not null default now()
);
create unique index receipt_one_credit on public.ledger(receipt_id,user_id) where kind='purchase';
create index ledger_owner on public.ledger(user_id,created_at desc);
create index notifications_owner on public.notifications(user_id,created_at desc);
create index activity_owner on public.activity(user_id,created_at desc);
create table public.redemptions (
 id uuid primary key, user_id uuid not null references public.profiles(id), location_id uuid not null references public.locations(id),
 code text not null unique default upper(substr(replace(gen_random_uuid()::text,'-',''),1,12)),
 amount bigint not null check(amount between 1000 and 20000 and amount % 500=0),
 status text not null default 'reserved' check(status in ('reserved','used','cancelled','expired')),
 created_at timestamptz not null default now(), expires_at timestamptz not null default (now()+interval '10 minutes')
);

alter table public.receipts add column redemption_id uuid unique references public.redemptions(id);

create function public.valid_rut(value text) returns boolean language plpgsql immutable set search_path = public as $$
declare clean text:=upper(regexp_replace(value,'[^0-9kK]','','g')); total int:=0; factor int:=2; i int; digit text;
begin
 if clean !~ '^[0-9]{7,8}[0-9K]$' then return false; end if;
 for i in reverse length(clean)-1..1 loop
 total:=total+substr(clean,i,1)::int*factor; factor:=case when factor=7 then 2 else factor+1 end;
 end loop;
 digit:=case 11-total%11 when 11 then '0' when 10 then 'K' else (11-total%11)::text end;
 return right(clean,1)=digit;
end $$;
create function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
declare m jsonb:=new.raw_user_meta_data; birthday_value date; rut_value text;
begin
 birthday_value:=(m->>'birthday')::date;
 rut_value:=upper(regexp_replace(m->>'rut','[^0-9kK]','','g'));
 if not coalesce(public.valid_rut(rut_value),false) then raise exception 'RUT inválido'; end if;
 if birthday_value is null or birthday_value > ((now() at time zone 'America/Santiago')::date-interval '18 years')::date or birthday_value < ((now() at time zone 'America/Santiago')::date-interval '110 years')::date then raise exception 'Debes ser mayor de 18 años'; end if;
 if coalesce(m->>'phone','') !~ '^\+569[0-9]{8}$' then raise exception 'Celular chileno inválido'; end if;
 if coalesce(m->>'terms','false') <> 'true' then raise exception 'Debes aceptar los términos'; end if;
 insert into public.profiles(id,first_name,last_name,rut,phone,birthday,share_activity)
 values(new.id,trim(m->>'first_name'),trim(m->>'last_name'),rut_value,m->>'phone',birthday_value,coalesce((m->>'share_activity')::boolean,false));
 insert into public.wallets(user_id) values(new.id);
 return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Internal wallet helpers: caller MUST hold the wallet row lock. Never callable by clients.
create function public.wallet_credit(owner_id uuid, amount_value bigint) returns void language plpgsql security definer set search_path=public as $$
begin
 update public.wallets set balance=balance+greatest(0,amount_value-debt), debt=greatest(0,debt-amount_value) where user_id=owner_id;
end $$;
create function public.wallet_settle(owner_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare total bigint; item record;
begin
 select coalesce(sum(amount),0) into total from public.ledger where user_id=owner_id and not settled and available_at<=now();
 update public.ledger set settled=true where user_id=owner_id and not settled and available_at<=now();
 perform public.wallet_credit(owner_id,total);
 for item in select * from public.redemptions where user_id=owner_id and status='reserved' and expires_at<=now() for update loop
  update public.redemptions set status='expired' where id=item.id;
  perform public.wallet_credit(owner_id,item.amount);
  insert into public.ledger(user_id,amount,kind,reference,note) values(owner_id,item.amount,'release',item.id,'Canje vencido: coronas devueltas');
 end loop;
end $$;
create function public.my_wallet() returns jsonb language plpgsql security definer set search_path=public as $$
declare owner_id uuid:=auth.uid(); w public.wallets; spending_value bigint; pending_value bigint; tier text; pct int;
begin
 if owner_id is null then raise exception 'Inicia sesión'; end if;
 select * into w from public.wallets where user_id=owner_id for update;
 perform public.wallet_settle(owner_id);
 select * into w from public.wallets where user_id=owner_id;
 select coalesce(sum(spending),0) into spending_value from public.ledger where user_id=owner_id and spending_at>=now()-interval '12 months';
 select coalesce(sum(amount),0) into pending_value from public.ledger where user_id=owner_id and not settled;
 tier:=case when spending_value>=700000 then 'Rey' when spending_value>=350000 then 'Noble' when spending_value>=150000 then 'Guardia' when spending_value>=50000 then 'Comerciante' else 'Plebeyo' end;
 pct:=case tier when 'Rey' then 16 when 'Noble' then 14 when 'Guardia' then 12 when 'Comerciante' then 10 else 8 end;
 return jsonb_build_object('balance',w.balance,'pending',pending_value,'debt',w.debt,'spending',spending_value,'tier',tier,'pct',pct);
end $$;
create function public.request_friend(code_value text) returns void language plpgsql security definer set search_path=public as $$
declare me uuid:=auth.uid(); other_id uuid; my_name text; recent_count int;
begin
 if me is null then raise exception 'Inicia sesión'; end if;
 perform 1 from public.profiles where id=me for update;
 select count(*) into recent_count from public.friendships where requested_by=me and created_at>now()-interval '1 hour';
 if recent_count>=20 then raise exception 'Espera antes de enviar más solicitudes'; end if;
 select id into other_id from public.profiles where member_code=upper(regexp_replace(code_value,'[^A-Za-z0-9]','','g'));
 if other_id is null then raise exception 'Código no encontrado'; end if;
 if other_id=me then raise exception 'Ese es tu código'; end if;
 if exists(select 1 from public.friendships where user_a=least(me,other_id) and user_b=greatest(me,other_id)) then raise exception 'Ya existe una amistad o solicitud pendiente'; end if;
 insert into public.friendships(user_a,user_b,requested_by) values(least(me,other_id),greatest(me,other_id),me);
 select first_name into my_name from public.profiles where id=me;
 insert into public.notifications(user_id,actor_id,kind,message) values(other_id,me,'friend_request',my_name||' quiere ser tu amigo 👑');
end $$;
create function public.respond_friend(friendship_id uuid, accept_value boolean) returns void language plpgsql security definer set search_path=public as $$
declare f public.friendships; me uuid:=auth.uid();
begin
 select * into f from public.friendships where id=friendship_id for update;
 if me is null or me not in(f.user_a,f.user_b) or f.requested_by=me or f.status<>'pending' then raise exception 'Solicitud no disponible'; end if;
 if accept_value then
 update public.friendships set status='accepted' where id=f.id;
 insert into public.notifications(user_id,actor_id,kind,message) values(f.requested_by,me,'friend_accepted','Tu solicitud de amistad fue aceptada 👑');
 else delete from public.friendships where id=f.id; end if;
end $$;
create function public.remove_friend(friendship_id uuid) returns void language plpgsql security definer set search_path=public as $$
begin
 delete from public.friendships where id=friendship_id and auth.uid() in(user_a,user_b);
 if not found then raise exception 'Amistad no disponible'; end if;
end $$;
create function public.my_friends() returns table(id uuid,other_id uuid,first_name text,last_name text,member_code text,status text,incoming boolean,muted boolean)
language sql security definer set search_path=public as $$
 select f.id,p.id,p.first_name,left(p.last_name,1)||'.',p.member_code,f.status,f.requested_by<>auth.uid(),case when f.user_a=auth.uid() then f.mute_a else f.mute_b end
 from public.friendships f join public.profiles p on p.id=case when f.user_a=auth.uid() then f.user_b else f.user_a end
 where auth.uid() in(f.user_a,f.user_b) order by f.created_at desc;
$$;
create function public.transfer_crowns(recipient_id uuid, amount_value bigint, request_id uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare me uuid:=auth.uid(); previous public.transfers; available_value bigint; sender_name text; daily bigint;
begin
 if me is null then raise exception 'Inicia sesión'; end if;
 if request_id is null or recipient_id=me or amount_value is null or amount_value<1 or amount_value>20000 then raise exception 'Monto inválido: entre 1 y 20.000 coronas'; end if;
 -- Consistent lock ordering prevents deadlocks for simultaneous opposite transfers.
 perform 1 from public.wallets where user_id in(me,recipient_id) order by user_id for update;
 select * into previous from public.transfers where id=request_id;
 if found then
 if previous.sender<>me or previous.recipient<>recipient_id or previous.amount<>amount_value then raise exception 'Solicitud ya utilizada'; end if;
 return previous.id;
 end if;
 if not exists(select 1 from public.friendships where user_a=least(me,recipient_id) and user_b=greatest(me,recipient_id) and status='accepted') then raise exception 'Primero deben aceptar la amistad'; end if;
 perform public.wallet_settle(me); perform public.wallet_settle(recipient_id);
 select coalesce(sum(amount),0) into daily from public.transfers where sender=me and (created_at at time zone 'America/Santiago')::date=(now() at time zone 'America/Santiago')::date;
 if daily+amount_value>50000 then raise exception 'Tope diario de envíos: 50.000 coronas'; end if;
 select balance into available_value from public.wallets where user_id=me;
 if available_value<amount_value then raise exception 'No tienes suficientes coronas disponibles'; end if;
 insert into public.transfers(id,sender,recipient,amount) values(request_id,me,recipient_id,amount_value);
 update public.wallets set balance=balance-amount_value where user_id=me;
 perform public.wallet_credit(recipient_id,amount_value);
 insert into public.ledger(user_id,amount,kind,reference,note) values(me,-amount_value,'transfer_out',request_id,'Coronas enviadas a un amigo'),(recipient_id,amount_value,'transfer_in',request_id,'Coronas recibidas de un amigo');
 select first_name into sender_name from public.profiles where id=me;
 insert into public.notifications(user_id,actor_id,kind,message) values(recipient_id,me,'transfer',sender_name||' te envió '||amount_value||' coronas 👑');
 return request_id;
end $$;
create function public.announce_location(location_value uuid) returns boolean language plpgsql security definer set search_path=public as $$
declare me uuid:=auth.uid(); sharing boolean; my_name text; local_name text;
begin
 select share_activity,first_name into sharing,my_name from public.profiles where id=me for update;
 if me is null then raise exception 'Inicia sesión'; end if;
 if not sharing then return false; end if;
 select name into local_name from public.locations where id=location_value and active and verified;
 if local_name is null then raise exception 'Local no disponible'; end if;
 if exists(select 1 from public.activity where user_id=me and (created_at>now()-interval '15 minutes' or (location_id=location_value and created_at>now()-interval '2 hours'))) then return false; end if;
 insert into public.activity(user_id,location_id) values(me,location_value);
 insert into public.notifications(user_id,actor_id,kind,message)
 select case when user_a=me then user_b else user_a end,me,'outing','Parece que se va a poner buenoo: '||my_name||' está mirando la carta de '||local_name||' 🍺'
 from public.friendships where me in(user_a,user_b) and status='accepted' and not(case when user_a=me then mute_b else mute_a end);
 return true;
end $$;
create function public.mute_friend(friendship_id uuid, muted_value boolean) returns void language plpgsql security definer set search_path=public as $$
begin
 update public.friendships set mute_a=case when user_a=auth.uid() then muted_value else mute_a end,
 mute_b=case when user_b=auth.uid() then muted_value else mute_b end
 where id=friendship_id and auth.uid() in(user_a,user_b) and status='accepted';
 if not found then raise exception 'Amistad no disponible'; end if;
end $$;
create function public.set_activity_sharing(enabled boolean) returns void language plpgsql security definer set search_path=public as $$
begin
 update public.profiles set share_activity=enabled where id=auth.uid();
 if not found then raise exception 'Inicia sesión'; end if;
end $$;
create function public.mark_notifications_read() returns void language sql security definer set search_path=public as $$
 update public.notifications set read_at=now() where user_id=auth.uid() and read_at is null;
$$;
create function public.create_redemption(location_value uuid,amount_value bigint,request_id uuid) returns public.redemptions language plpgsql security definer set search_path=public as $$
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
 if not exists(select 1 from public.locations where id=location_value and active and verified) then raise exception 'Local no disponible'; end if;
 if exists(select 1 from public.redemptions where user_id=me and status in('reserved','used') and (created_at at time zone 'America/Santiago')::date=(now() at time zone 'America/Santiago')::date) then raise exception 'Solo un canje al día'; end if;
 select balance into funds from public.wallets where user_id=me;
 if funds<amount_value then raise exception 'Saldo insuficiente'; end if;
 insert into public.redemptions(id,user_id,location_id,amount) values(request_id,me,location_value,amount_value) returning * into item;
 update public.wallets set balance=balance-amount_value where user_id=me;
 insert into public.ledger(user_id,amount,kind,reference,note) values(me,-amount_value,'redemption',item.id,'Coronas reservadas para descuento');
 return item;
end $$;
create function public.cancel_redemption(redemption_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare me uuid:=auth.uid(); item public.redemptions;
begin
 if me is null then raise exception 'Inicia sesión'; end if;
 perform 1 from public.wallets where user_id=me for update;
 select * into item from public.redemptions where id=redemption_id and user_id=me for update;
 if item.id is null or item.status<>'reserved' then raise exception 'Canje no disponible'; end if;
 update public.redemptions set status='cancelled' where id=item.id;
 perform public.wallet_credit(me,item.amount);
 insert into public.ledger(user_id,amount,kind,reference,note) values(me,item.amount,'release',item.id,'Canje cancelado');
end $$;

-- POS functions: ONLY service_role, never the browser key. Credentials belong to each local.
create function public.pos_confirm_redemption(location_value uuid,code_value text) returns jsonb language plpgsql security definer set search_path=public as $$
declare item public.redemptions;
begin
 select * into item from public.redemptions where code=upper(code_value) and location_id=location_value;
 if item.id is null then raise exception 'Ficha no encontrada'; end if;
 perform 1 from public.wallets where user_id=item.user_id for update;
 perform public.wallet_settle(item.user_id);
 select * into item from public.redemptions where id=item.id for update;
 if item.status='used' then return jsonb_build_object('id',item.id,'amount',item.amount,'already_used',true); end if;
 if item.status<>'reserved' or item.expires_at<=now() then raise exception 'Ficha vencida o cancelada'; end if;
 update public.redemptions set status='used' where id=item.id;
 return jsonb_build_object('id',item.id,'amount',item.amount,'already_used',false);
end $$;
create function public.pos_record_sale(location_value uuid,folio_value text,amount_value bigint,people_value integer,codes text[],redemption_code text default null) returns uuid language plpgsql security definer set search_path=public as $$
declare receipt public.receipts; owner_id uuid; owners uuid[]; part bigint; spending_value bigint; pct int; earned bigint; redemption public.redemptions;
begin
 if not exists(select 1 from public.locations where id=location_value and active and verified) then raise exception 'Local no disponible'; end if;
 if cardinality(codes) is null or cardinality(codes) not between 1 and 8 or cardinality(codes)>people_value then raise exception 'Envía entre 1 y 8 códigos válidos'; end if;
 select array_agg(id order by id) into owners from public.profiles where member_code=any(codes);
 if cardinality(owners) is distinct from cardinality(codes) then raise exception 'Código inexistente o repetido'; end if;
 insert into public.receipts(location_id,folio,amount,people) values(location_value,folio_value,amount_value,people_value) on conflict(location_id,folio) do nothing;
 select * into receipt from public.receipts where location_id=location_value and folio=folio_value for update;
 if receipt.amount<>amount_value or receipt.people<>people_value then raise exception 'Folio con datos distintos'; end if;
 if receipt.cancelled_at is not null then raise exception 'Boleta anulada'; end if;
 if redemption_code is not null then
 select * into redemption from public.redemptions where code=upper(redemption_code) and location_id=location_value;
 if redemption.id is null or not(redemption.user_id=any(owners)) then raise exception 'La ficha no pertenece a un socio de esta boleta'; end if;
 if receipt.redemption_id is not null and receipt.redemption_id<>redemption.id then raise exception 'Folio vinculado a otra ficha'; end if;
 if exists(select 1 from public.receipts where redemption_id=redemption.id and id<>receipt.id) then raise exception 'Ficha vinculada a otra boleta'; end if;
 end if;
 if exists(select 1 from public.ledger where receipt_id=receipt.id) then
 if redemption_code is not null and receipt.redemption_id is distinct from redemption.id then raise exception 'Folio ya registrado sin esta ficha'; end if;
 if (select array_agg(user_id order by user_id) from public.ledger where receipt_id=receipt.id and kind='purchase') is distinct from owners then raise exception 'Folio ya acreditado a otros socios'; end if;
 return receipt.id;
 end if;
 perform 1 from public.wallets where user_id=any(owners) order by user_id for update;
 if redemption_code is not null then
 perform public.pos_confirm_redemption(location_value,redemption_code);
 update public.receipts set redemption_id=redemption.id where id=receipt.id;
 end if;
 part:=amount_value/people_value;
 foreach owner_id in array owners loop
 select coalesce(sum(spending),0) into spending_value from public.ledger where user_id=owner_id and spending_at>=now()-interval '12 months';
 pct:=case when spending_value>=700000 then 16 when spending_value>=350000 then 14 when spending_value>=150000 then 12 when spending_value>=50000 then 10 else 8 end;
 earned:=least(8000,part*pct/100);
 insert into public.ledger(user_id,amount,kind,available_at,settled,spending,receipt_id,note) values(owner_id,earned,'purchase',now()+interval '24 hours',false,part,receipt.id,'Coronas por boleta '||folio_value);
 insert into public.notifications(user_id,kind,message) values(owner_id,'purchase','Ganaste '||earned||' coronas. Se activan en 24 horas 👑');
 end loop;
 return receipt.id;
end $$;
create function public.pos_cancel_sale(location_value uuid,folio_value text) returns void language plpgsql security definer set search_path=public as $$
declare receipt public.receipts; item record; funds bigint; redemption public.redemptions;
begin
 select * into receipt from public.receipts where location_id=location_value and folio=folio_value for update;
 if receipt.id is null then raise exception 'Boleta no encontrada'; end if;
 if receipt.cancelled_at is not null then return; end if;
 perform 1 from public.wallets where user_id in(select user_id from public.ledger where receipt_id=receipt.id) order by user_id for update;
 for item in select * from public.ledger where receipt_id=receipt.id and kind='purchase' loop
 if item.settled then
 select balance into funds from public.wallets where user_id=item.user_id;
 update public.wallets set balance=greatest(0,balance-item.amount),debt=debt+greatest(0,item.amount-funds) where user_id=item.user_id;
 else update public.ledger set settled=true where id=item.id; end if;
 insert into public.ledger(user_id,amount,kind,spending,spending_at,receipt_id,note) values(item.user_id,-item.amount,'reversal',-item.spending,item.spending_at,receipt.id,'Boleta anulada: '||folio_value);
 end loop;
 if receipt.redemption_id is not null then
 select * into redemption from public.redemptions where id=receipt.redemption_id for update;
 if redemption.status='used' then
 update public.redemptions set status='cancelled' where id=redemption.id;
 perform public.wallet_credit(redemption.user_id,redemption.amount);
 insert into public.ledger(user_id,amount,kind,reference,note) values(redemption.user_id,redemption.amount,'release',redemption.id,'Descuento devuelto por boleta anulada');
 end if;
 end if;
 update public.receipts set cancelled_at=now() where id=receipt.id;
end $$;

create function public.pos_member(code_value text) returns jsonb language plpgsql security definer set search_path=public as $$
declare p public.profiles; w public.wallets; spending_value bigint; pending_value bigint;
begin
 select * into p from public.profiles where member_code=upper(regexp_replace(code_value,'[^A-Za-z0-9]','','g'));
 if p.id is null then raise exception 'Socio no encontrado'; end if;
 perform 1 from public.wallets where user_id=p.id for update;
 perform public.wallet_settle(p.id);
 select * into w from public.wallets where user_id=p.id;
 select coalesce(sum(spending),0) into spending_value from public.ledger where user_id=p.id and spending_at>=now()-interval '12 months';
 select coalesce(sum(amount),0) into pending_value from public.ledger where user_id=p.id and not settled;
 return jsonb_build_object('code',p.member_code,'name',p.first_name||' '||left(p.last_name,1)||'.','balance',w.balance,'pending',pending_value,'spending',spending_value);
end $$;

create table public.staff (
 user_id uuid primary key references public.profiles(id),
 role text not null check(role in ('admin','cashier')), location_id uuid references public.locations(id),
 check(role='admin' or location_id is not null)
);
alter table public.staff enable row level security;
revoke all on public.staff from anon,authenticated;
create function public.my_staff_role() returns jsonb language sql security definer set search_path=public as $$
 select coalesce((select jsonb_build_object('role',role,'location_id',location_id) from public.staff where user_id=auth.uid()),'null'::jsonb);
$$;
create function public.require_staff(location_value uuid,admin_only boolean default false) returns void language plpgsql security definer set search_path=public as $$
begin
 if not exists(select 1 from public.staff where user_id=auth.uid() and (role='admin' or (not admin_only and role='cashier' and location_id=location_value))) then raise exception 'No tienes acceso a esta operación'; end if;
end $$;
create function public.staff_member(location_value uuid,code_value text) returns jsonb language plpgsql security definer set search_path=public as $$
begin perform public.require_staff(location_value); return public.pos_member(code_value); end $$;
create function public.staff_sale(location_value uuid,folio_value text,amount_value bigint,people_value integer,codes text[],redemption_code text default null) returns uuid language plpgsql security definer set search_path=public as $$
begin perform public.require_staff(location_value);return public.pos_record_sale(location_value,folio_value,amount_value,people_value,codes,redemption_code);end $$;
create function public.staff_confirm_redemption(location_value uuid,code_value text) returns jsonb language plpgsql security definer set search_path=public as $$
begin perform public.require_staff(location_value);return public.pos_confirm_redemption(location_value,code_value);end $$;
create function public.staff_cancel_sale(location_value uuid,folio_value text) returns void language plpgsql security definer set search_path=public as $$
begin perform public.require_staff(location_value);perform public.pos_cancel_sale(location_value,folio_value);end $$;
create function public.admin_summary() returns jsonb language plpgsql security definer set search_path=public as $$
begin
 perform public.require_staff(null,true);
 return jsonb_build_object('members',(select count(*) from public.profiles),'friends',(select count(*) from public.friendships where status='accepted'),'balance',(select coalesce(sum(balance),0) from public.wallets),'pending',(select coalesce(sum(amount),0) from public.ledger where not settled),'receipts',(select count(*) from public.receipts where cancelled_at is null),'locations',(select count(*) from public.locations where active and verified));
end $$;
create function public.admin_locations() returns setof public.locations language plpgsql security definer set search_path=public as $$
begin perform public.require_staff(null,true);return query select * from public.locations order by name;end $$;
create function public.admin_upsert_location(id_value uuid,name_value text,address_value text,commune_value text,menu_value text,latitude_value double precision,longitude_value double precision,active_value boolean) returns uuid language plpgsql security definer set search_path=public as $$
declare result uuid:=coalesce(id_value,gen_random_uuid());
begin
 perform public.require_staff(null,true);
 if length(trim(name_value))<3 or length(trim(address_value))<3 or length(trim(commune_value))<2 or menu_value !~ '^https://[^/@ ]+([/:?#]|$)' then raise exception 'Completa el nombre, dirección, comuna y enlace HTTPS de la carta'; end if;
 insert into public.locations(id,name,address,commune,menu_url,latitude,longitude,active,verified)
 values(result,trim(name_value),trim(address_value),trim(commune_value),menu_value,latitude_value,longitude_value,active_value,true)
 on conflict(id) do update set name=excluded.name,address=excluded.address,commune=excluded.commune,menu_url=excluded.menu_url,latitude=excluded.latitude,longitude=excluded.longitude,active=excluded.active,verified=true;
 return result;
end $$;
create function public.admin_members() returns table(id uuid,first_name text,last_name text,member_code text,balance bigint,created_at timestamptz)
language plpgsql security definer set search_path=public as $$
begin
 perform public.require_staff(null,true);
 return query select p.id,p.first_name,left(p.last_name,1)||'.',p.member_code,w.balance,p.created_at from public.profiles p join public.wallets w on w.user_id=p.id order by p.created_at desc limit 100;
end $$;

alter table public.profiles enable row level security;
alter table public.locations enable row level security;
alter table public.wallets enable row level security;
alter table public.friendships enable row level security;
alter table public.notifications enable row level security;
alter table public.activity enable row level security;
alter table public.transfers enable row level security;
alter table public.receipts enable row level security;
alter table public.ledger enable row level security;
alter table public.redemptions enable row level security;
create policy own_profile on public.profiles for select to authenticated using(id=auth.uid());
create policy public_locations on public.locations for select to anon,authenticated using(active and verified);
create policy own_wallet on public.wallets for select to authenticated using(user_id=auth.uid());
create policy own_friendship on public.friendships for select to authenticated using(auth.uid() in(user_a,user_b));
create policy own_notifications on public.notifications for select to authenticated using(user_id=auth.uid());
create policy own_transfers on public.transfers for select to authenticated using(auth.uid() in(sender,recipient));
create policy own_ledger on public.ledger for select to authenticated using(user_id=auth.uid());
create policy own_redemptions on public.redemptions for select to authenticated using(user_id=auth.uid());
-- No client writes, including profiles and balances. All changes go through narrow RPCs.
revoke all on public.profiles,public.locations,public.wallets,public.friendships,public.notifications,public.activity,public.transfers,public.receipts,public.ledger,public.redemptions from anon,authenticated;
grant select on public.locations to anon,authenticated;
grant select on public.profiles,public.wallets,public.friendships,public.notifications,public.transfers,public.ledger,public.redemptions to authenticated;
revoke create on schema public from public,anon,authenticated;
do $$ declare fn record; begin
 for fn in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname=any(array[
 'valid_rut','handle_new_user','wallet_credit','wallet_settle','my_wallet','request_friend','respond_friend','remove_friend','my_friends','transfer_crowns','announce_location','mute_friend','set_activity_sharing','mark_notifications_read','create_redemption','cancel_redemption','pos_confirm_redemption','pos_record_sale','pos_cancel_sale','pos_member','my_staff_role','require_staff','staff_member','staff_sale','staff_confirm_redemption','staff_cancel_sale','admin_summary','admin_locations','admin_upsert_location','admin_members'])
 loop execute format('revoke execute on function %s from public,anon,authenticated',fn.signature); end loop;
end $$;
grant execute on function public.my_staff_role(),public.staff_member(uuid,text),public.staff_sale(uuid,text,bigint,integer,text[],text),public.staff_confirm_redemption(uuid,text),public.staff_cancel_sale(uuid,text),public.admin_summary(),public.admin_locations(),public.admin_upsert_location(uuid,text,text,text,text,double precision,double precision,boolean),public.admin_members(),public.mute_friend(uuid,boolean),public.my_wallet(),public.request_friend(text),public.respond_friend(uuid,boolean),public.remove_friend(uuid),public.my_friends(),public.transfer_crowns(uuid,bigint,uuid),public.announce_location(uuid),public.set_activity_sharing(boolean),public.mark_notifications_read(),public.create_redemption(uuid,bigint,uuid),public.cancel_redemption(uuid) to authenticated;
grant execute on function public.pos_member(text),public.pos_record_sale(uuid,text,bigint,integer,text[],text),public.pos_cancel_sale(uuid,text),public.pos_confirm_redemption(uuid,text) to service_role;
-- Supabase projects include supabase_realtime; the UI also polls as a fallback.
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
 execute 'alter publication supabase_realtime add table public.notifications';
 end if;
end $$;
