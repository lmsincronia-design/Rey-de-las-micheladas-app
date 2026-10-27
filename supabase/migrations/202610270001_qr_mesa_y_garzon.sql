-- Club del Rey · QR de la mesa y app del garzón (propuesta de oct-2026, con las correcciones de Martín).
--
-- Reglas:
--  * 1 corona = $1. Cada persona suma su parte de la cuenta × el % de SU rango (4/6/8/10/12), sin tramos.
--  * El garzón ingresa el monto y las personas de la mesa; la cuenta se divide en partes iguales y se genera
--    un QR que vence a los 10 minutos. Cada socio lo escanea una vez; las partes que nadie escanea se pierden.
--  * Mínimo $5.000 por persona. Tope de 8.000 coronas por persona y cuenta. Máximo 3 cuentas por socio al día.
--  * El canje es igual para todos los rangos: de $1.000 a $20.000 en tramos de $500, un canje al día. El socio
--    muestra un QR que se renueva cada 30 segundos; las coronas se descuentan solo cuando el garzón lo escanea.
--  * Ya no hay enlaces para repartir la mesa ni fichas reservadas.
--  * Cada local entra con su clave; cada garzón con su PIN. Todo queda registrado en local_audit.
begin;

-- ── Registro: sin RUT y con celular opcional ────────────────────────────────────────────────
alter table public.profiles alter column rut drop not null;
alter table public.profiles alter column phone drop not null;
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
declare m jsonb:=new.raw_user_meta_data; birthday_value date; rut_value text; phone_value text;
begin
 birthday_value:=(m->>'birthday')::date;
 rut_value:=nullif(upper(regexp_replace(coalesce(m->>'rut',''),'[^0-9kK]','','g')),'');
 if rut_value is not null and not coalesce(public.valid_rut(rut_value),false) then raise exception 'RUT inválido'; end if;
 if birthday_value is null or birthday_value > ((now() at time zone 'America/Santiago')::date-interval '18 years')::date or birthday_value < ((now() at time zone 'America/Santiago')::date-interval '110 years')::date then raise exception 'Debes ser mayor de 18 años'; end if;
 phone_value:=nullif(trim(coalesce(m->>'phone','')),'');
 if phone_value is not null and phone_value !~ '^\+569[0-9]{8}$' then raise exception 'Celular chileno inválido'; end if;
 if coalesce(m->>'terms','false') <> 'true' then raise exception 'Debes aceptar los términos'; end if;
 insert into public.profiles(id,first_name,last_name,rut,phone,birthday,share_activity)
 values(new.id,trim(m->>'first_name'),trim(m->>'last_name'),rut_value,phone_value,birthday_value,coalesce((m->>'share_activity')::boolean,false));
 insert into public.wallets(user_id) values(new.id);
 return new;
end $$;

-- ── Utilidades internas ─────────────────────────────────────────────────────────────────────
create function public.secret_hash(salt text,secret text) returns text language sql immutable set search_path=public as $$
 select encode(sha256(convert_to(salt||':'||secret,'UTF8')),'hex')
$$;
create function public.new_token() returns text language sql volatile set search_path=public as $$
 select replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','')
$$;
-- Código corto legible (sin 0/O/1/I/L), para escribirlo a mano si la cámara falla.
create function public.short_code(len integer default 8) returns text language plpgsql volatile set search_path=public as $$
declare alphabet text:='23456789ABCDEFGHJKMNPQRSTUVWXYZ'; h text:=md5(gen_random_uuid()::text||clock_timestamp()::text); r text:=''; i integer;
begin
 for i in 0..len-1 loop r:=r||substr(alphabet,(('x'||substr(h,i*2+1,2))::bit(8)::integer % length(alphabet))+1,1); end loop;
 return r;
end $$;
create function public.clean_code(value text) returns text language sql immutable set search_path=public as $$
 select upper(regexp_replace(coalesce(value,''),'[^A-Za-z0-9]','','g'))
$$;
create function public.tier_pct(spending_value bigint) returns integer language sql immutable set search_path=public as $$
 select case when spending_value>=700000 then 12 when spending_value>=350000 then 10 when spending_value>=150000 then 8 when spending_value>=50000 then 6 else 4 end
$$;
create function public.santiago_today() returns date language sql stable set search_path=public as $$
 select (now() at time zone 'America/Santiago')::date
$$;

-- ── Cuentas de local y garzones ─────────────────────────────────────────────────────────────
create table public.local_access (
 location_id uuid primary key references public.locations(id) on delete cascade,
 salt text not null, password_hash text not null,
 failed integer not null default 0, locked_until timestamptz,
 updated_at timestamptz not null default now()
);
create table public.waiters (
 id uuid primary key default gen_random_uuid(),
 location_id uuid not null references public.locations(id) on delete cascade,
 name text not null check(length(trim(name)) between 2 and 40),
 role text not null default 'waiter' check(role in ('waiter','manager')),
 salt text not null, pin_hash text not null,
 active boolean not null default true,
 failed integer not null default 0, locked_until timestamptz,
 created_at timestamptz not null default now()
);
create unique index waiters_name_per_local on public.waiters(location_id,lower(name)) where active;
create table public.local_sessions (
 id uuid primary key default gen_random_uuid(),
 location_id uuid not null references public.locations(id) on delete cascade,
 token_hash text not null unique,
 waiter_id uuid references public.waiters(id),
 waiter_token_hash text unique, waiter_expires_at timestamptz,
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '30 days',
 revoked_at timestamptz, last_seen_at timestamptz not null default now()
);
create index local_sessions_location on public.local_sessions(location_id);
create table public.local_audit (
 id uuid primary key default gen_random_uuid(),
 location_id uuid not null references public.locations(id) on delete cascade,
 waiter_id uuid references public.waiters(id),
 action text not null, reference uuid, detail jsonb not null default '{}',
 created_at timestamptz not null default now()
);
create index local_audit_location on public.local_audit(location_id,created_at desc);

-- ── QR de la mesa ───────────────────────────────────────────────────────────────────────────
create table public.table_qr (
 id uuid primary key,
 receipt_id uuid not null unique references public.receipts(id),
 location_id uuid not null references public.locations(id),
 waiter_id uuid not null references public.waiters(id),
 code text not null unique,
 people integer not null check(people between 1 and 20),
 table_label text check(table_label is null or length(table_label)<=20),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '10 minutes'
);
create index table_qr_location on public.table_qr(location_id,created_at desc);

-- ── QR del socio: canje y cumpleaños ────────────────────────────────────────────────────────
create table public.member_qr (
 code text primary key,
 user_id uuid not null references public.profiles(id) on delete cascade,
 purpose text not null check(purpose in ('redeem','birthday')),
 amount bigint,
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '30 seconds',
 used_at timestamptz, location_id uuid references public.locations(id), waiter_id uuid references public.waiters(id),
 redemption_id uuid,
 -- El garzón escaneó un QR de cumpleaños y revisa la cédula: sigue válido aunque el QR del socio cambie.
 held_until timestamptz
);
create index member_qr_owner on public.member_qr(user_id,created_at desc);
alter table public.redemptions add column waiter_id uuid references public.waiters(id);
alter table public.redemptions add column voided_at timestamptz;
alter table public.redemptions add column void_reason text;
create table public.birthday_rewards (
 user_id uuid not null references public.profiles(id) on delete cascade,
 year integer not null,
 location_id uuid not null references public.locations(id),
 waiter_id uuid not null references public.waiters(id),
 created_at timestamptz not null default now(),
 primary key(user_id,year)
);

alter table public.local_access enable row level security;
alter table public.waiters enable row level security;
alter table public.local_sessions enable row level security;
alter table public.local_audit enable row level security;
alter table public.table_qr enable row level security;
alter table public.member_qr enable row level security;
alter table public.birthday_rewards enable row level security;
revoke all on public.local_access,public.waiters,public.local_sessions,public.local_audit,public.table_qr,public.member_qr,public.birthday_rewards from anon,authenticated;

-- ── Sesión del local y del garzón (internas) ────────────────────────────────────────────────
create function public.local_session(device_token text) returns public.local_sessions language plpgsql security definer set search_path=public as $$
declare s public.local_sessions;
begin
 select * into s from public.local_sessions where token_hash=public.secret_hash('device',coalesce(device_token,''));
 if s.id is null or s.revoked_at is not null or s.expires_at<=now() then raise exception 'La sesión del local terminó. Ingresa de nuevo con la clave del local.'; end if;
 if not exists(select 1 from public.locations where id=s.location_id and active and verified) then raise exception 'Este local no está activo en el Club'; end if;
 if s.last_seen_at<now()-interval '5 minutes' then update public.local_sessions set last_seen_at=now() where id=s.id; end if;
 return s;
end $$;
create function public.local_waiter(device_token text,waiter_token text,manager_only boolean default false) returns public.waiters language plpgsql security definer set search_path=public as $$
declare s public.local_sessions; w public.waiters;
begin
 s:=public.local_session(device_token);
 if s.waiter_id is null or s.waiter_token_hash is distinct from public.secret_hash('waiter',coalesce(waiter_token,'')) or s.waiter_expires_at<=now() then raise exception 'Ingresa con tu PIN para continuar.'; end if;
 select * into w from public.waiters where id=s.waiter_id;
 if w.id is null or not w.active or w.location_id<>s.location_id then raise exception 'Ingresa con tu PIN para continuar.'; end if;
 if manager_only and w.role<>'manager' then raise exception 'Solo el encargado del local puede hacer esto.'; end if;
 return w;
end $$;

create function public.garzon_locations() returns jsonb language sql security definer set search_path=public as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'name',l.name,'commune',l.commune,'is_test',coalesce(l.is_test,false)) order by coalesce(l.is_test,false) desc,l.name),'[]')
 from public.locations l join public.local_access a on a.location_id=l.id where l.active and l.verified
$$;
create function public.garzon_login(location_value uuid,password_value text) returns jsonb language plpgsql security definer set search_path=public as $$
declare a public.local_access; token text:=public.new_token(); l public.locations;
begin
 select * into a from public.local_access where location_id=location_value for update;
 select * into l from public.locations where id=location_value and active and verified;
 if a.location_id is null or l.id is null then raise exception 'Local o clave incorrectos.'; end if;
 if a.locked_until>now() then raise exception 'Demasiados intentos. Espera 15 minutos o pide ayuda al encargado.'; end if;
 if a.password_hash<>public.secret_hash(a.salt,coalesce(password_value,'')) then
  update public.local_access set failed=failed+1,locked_until=case when failed+1>=5 then now()+interval '15 minutes' else null end where location_id=a.location_id;
  insert into public.local_audit(location_id,action,detail) values(a.location_id,'login_failed','{}');
  return jsonb_build_object('error','Local o clave incorrectos.');
 end if;
 update public.local_access set failed=0,locked_until=null where location_id=a.location_id;
 insert into public.local_sessions(location_id,token_hash) values(a.location_id,public.secret_hash('device',token));
 insert into public.local_audit(location_id,action) values(a.location_id,'device_login');
 return jsonb_build_object('device_token',token,'location',jsonb_build_object('id',l.id,'name',l.name,'is_test',coalesce(l.is_test,false)));
end $$;
create function public.garzon_waiters(device_token text) returns jsonb language plpgsql security definer set search_path=public as $$
declare s public.local_sessions;
begin
 s:=public.local_session(device_token);
 return jsonb_build_object('location',(select jsonb_build_object('id',id,'name',name,'is_test',coalesce(is_test,false)) from public.locations where id=s.location_id),
  'waiters',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'role',role,'locked',coalesce(locked_until>now(),false)) order by (role='manager') desc,lower(name)) from public.waiters where location_id=s.location_id and active),'[]'));
end $$;
create function public.garzon_pin(device_token text,waiter_value uuid,pin_value text) returns jsonb language plpgsql security definer set search_path=public as $$
declare s public.local_sessions; w public.waiters; token text:=public.new_token();
begin
 s:=public.local_session(device_token);
 select * into w from public.waiters where id=waiter_value and location_id=s.location_id and active for update;
 if w.id is null then raise exception 'Garzón no encontrado en este local.'; end if;
 if w.locked_until>now() then raise exception 'PIN bloqueado por 10 minutos. Pide ayuda al encargado.'; end if;
 if w.pin_hash<>public.secret_hash(w.salt,coalesce(pin_value,'')) then
  update public.waiters set failed=failed+1,locked_until=case when failed+1>=5 then now()+interval '10 minutes' else null end where id=w.id;
  insert into public.local_audit(location_id,waiter_id,action) values(w.location_id,w.id,'pin_failed');
  return jsonb_build_object('error',case when w.failed+1>=5 then 'PIN bloqueado por 10 minutos.' else 'PIN incorrecto.' end);
 end if;
 update public.waiters set failed=0,locked_until=null where id=w.id;
 update public.local_sessions set waiter_id=w.id,waiter_token_hash=public.secret_hash('waiter',token),waiter_expires_at=now()+interval '12 hours' where id=s.id;
 insert into public.local_audit(location_id,waiter_id,action) values(w.location_id,w.id,'pin_login');
 return jsonb_build_object('waiter_token',token,'waiter',jsonb_build_object('id',w.id,'name',w.name,'role',w.role),'expires_at',now()+interval '12 hours');
end $$;
create function public.garzon_logout(device_token text,full_logout boolean default false) returns void language plpgsql security definer set search_path=public as $$
declare s public.local_sessions;
begin
 select * into s from public.local_sessions where token_hash=public.secret_hash('device',coalesce(device_token,''));
 if s.id is null then return; end if;
 if full_logout then update public.local_sessions set revoked_at=now(),waiter_id=null,waiter_token_hash=null where id=s.id;
 else update public.local_sessions set waiter_id=null,waiter_token_hash=null,waiter_expires_at=null where id=s.id; end if;
end $$;

-- ── Mesa: el garzón genera el QR ────────────────────────────────────────────────────────────
create function public.table_qr_json(t public.table_qr) returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object('id',t.id,'code',t.code,'amount',r.amount,'people',t.people,'part',r.amount/t.people,
  'table_label',t.table_label,'created_at',t.created_at,'expires_at',t.expires_at,'expired',t.expires_at<=now(),
  'cancelled',r.cancelled_at is not null,'claimed',(select count(*) from public.ledger where receipt_id=r.id and kind='purchase'),
  'waiter',(select name from public.waiters where id=t.waiter_id))
 from public.receipts r where r.id=t.receipt_id
$$;
create function public.garzon_open_table(device_token text,waiter_token text,amount_value bigint,people_value integer,table_label_value text,request_id uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare w public.waiters; t public.table_qr; receipt_value uuid; code_value text; label text:=nullif(trim(coalesce(table_label_value,'')),'');
begin
 w:=public.local_waiter(device_token,waiter_token);
 if request_id is null then raise exception 'Solicitud inválida'; end if;
 select * into t from public.table_qr where id=request_id;
 if found then
  if t.waiter_id<>w.id or t.people<>people_value or (select amount from public.receipts where id=t.receipt_id)<>amount_value then raise exception 'Solicitud ya utilizada'; end if;
  return public.table_qr_json(t);
 end if;
 if amount_value is null or amount_value<5000 or amount_value>2000000 then raise exception 'Ingresa el total de la cuenta: entre $5.000 y $2.000.000.'; end if;
 if people_value is null or people_value not between 1 and 20 then raise exception 'Indica entre 1 y 20 personas.'; end if;
 if amount_value/people_value<5000 then raise exception 'Cada parte debe ser de al menos $5.000. Con % personas cada una quedaría en $%.',people_value,amount_value/people_value; end if;
 if length(label)>20 then raise exception 'El número o nombre de la mesa puede tener hasta 20 caracteres.'; end if;
 if (select count(*) from public.table_qr where waiter_id=w.id and created_at>now()-interval '1 hour')>=60 then raise exception 'Demasiadas mesas en una hora. Avisa al encargado.'; end if;
 loop code_value:=public.short_code(8); exit when not exists(select 1 from public.table_qr where code=code_value); end loop;
 insert into public.receipts(location_id,folio,amount,people) values(w.location_id,'QR-'||code_value,amount_value,people_value) returning id into receipt_value;
 insert into public.table_qr(id,receipt_id,location_id,waiter_id,code,people,table_label) values(request_id,receipt_value,w.location_id,w.id,code_value,people_value,label) returning * into t;
 insert into public.local_audit(location_id,waiter_id,action,reference,detail) values(w.location_id,w.id,'table_open',t.id,jsonb_build_object('amount',amount_value,'people',people_value,'table',label));
 return public.table_qr_json(t);
end $$;
create function public.garzon_table(device_token text,waiter_token text,table_value uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare w public.waiters; t public.table_qr;
begin
 w:=public.local_waiter(device_token,waiter_token);
 select * into t from public.table_qr where id=table_value and location_id=w.location_id;
 if t.id is null then raise exception 'Mesa no encontrada'; end if;
 return public.table_qr_json(t);
end $$;
-- Vuelve a abrir el QR 10 minutos más (por ejemplo, si alguien se estaba registrando). Cambia el código.
create function public.garzon_renew_table(device_token text,waiter_token text,table_value uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare w public.waiters; t public.table_qr; r public.receipts; code_value text;
begin
 w:=public.local_waiter(device_token,waiter_token);
 select * into t from public.table_qr where id=table_value and location_id=w.location_id for update;
 if t.id is null then raise exception 'Mesa no encontrada'; end if;
 select * into r from public.receipts where id=t.receipt_id;
 if r.cancelled_at is not null then raise exception 'Esta cuenta fue anulada.'; end if;
 if r.created_at<now()-interval '3 hours' then raise exception 'Esta cuenta ya cerró: solo se puede renovar durante las primeras 3 horas.'; end if;
 if (select count(*) from public.ledger where receipt_id=r.id and kind='purchase')>=t.people then raise exception 'Todas las personas de la mesa ya sumaron sus coronas.'; end if;
 loop code_value:=public.short_code(8); exit when not exists(select 1 from public.table_qr where code=code_value); end loop;
 update public.table_qr set code=code_value,expires_at=now()+interval '10 minutes' where id=t.id returning * into t;
 insert into public.local_audit(location_id,waiter_id,action,reference) values(w.location_id,w.id,'table_renew',t.id);
 return public.table_qr_json(t);
end $$;

-- ── Socio: ve su parte y suma sus coronas ───────────────────────────────────────────────────
create function public.table_qr_info(code_value text) returns jsonb language plpgsql security definer set search_path=public as $$
declare t public.table_qr; r public.receipts; claimed integer; own public.ledger;
begin
 select * into t from public.table_qr where code=public.clean_code(code_value);
 if t.id is null then raise exception 'No encontramos esa mesa. Revisa el código o pide al garzón un QR nuevo.'; end if;
 select * into r from public.receipts where id=t.receipt_id;
 select count(*) into claimed from public.ledger where receipt_id=r.id and kind='purchase';
 if auth.uid() is not null then select * into own from public.ledger where receipt_id=r.id and kind='purchase' and user_id=auth.uid(); end if;
 return jsonb_build_object('code',t.code,'amount',r.amount,'people',t.people,'part',r.amount/t.people,'remaining',greatest(0,t.people-claimed),
  'expires_at',t.expires_at,'expired',t.expires_at<=now(),'cancelled',r.cancelled_at is not null,'table_label',t.table_label,
  'location_name',(select name from public.locations where id=t.location_id),
  'claimed',own.id is not null,'earned',own.amount,'available_at',own.available_at);
end $$;
create function public.claim_table_qr(code_value text) returns jsonb language plpgsql security definer set search_path=public as $$
declare me uuid:=auth.uid(); t public.table_qr; r public.receipts; previous public.ledger; part bigint; spent bigint; pct integer; earned bigint; local_name text;
begin
 if me is null then raise exception 'Inicia sesión para sumar tus coronas.'; end if;
 if not exists(select 1 from public.profiles where id=me) then raise exception 'Completa tu registro en el Club.'; end if;
 select * into t from public.table_qr where code=public.clean_code(code_value);
 if t.id is null then raise exception 'No encontramos esa mesa. Revisa el código o pide al garzón un QR nuevo.'; end if;
 -- Reclamos y anulaciones se ordenan sobre la misma cuenta antes de tocar billeteras.
 select * into r from public.receipts where id=t.receipt_id for update;
 if r.cancelled_at is not null then raise exception 'Esta cuenta fue anulada por el local.'; end if;
 select * into previous from public.ledger where receipt_id=r.id and user_id=me and kind='purchase';
 if found then return jsonb_build_object('earned',previous.amount,'part',previous.spending,'available_at',previous.available_at,'already_claimed',true); end if;
 if t.expires_at<=now() then raise exception 'El QR de esta mesa venció. Pide al garzón que lo renueve.'; end if;
 if (select count(*) from public.ledger where receipt_id=r.id and kind='purchase')>=t.people then raise exception 'Todas las partes de esta mesa ya fueron sumadas.'; end if;
 if (select count(*) from public.ledger l join public.table_qr q on q.receipt_id=l.receipt_id
     where l.user_id=me and l.kind='purchase' and (l.created_at at time zone 'America/Santiago')::date=public.santiago_today())>=3 then
  raise exception 'Ya sumaste 3 cuentas hoy, el máximo diario.'; end if;
 perform 1 from public.wallets where user_id=me for update;
 select coalesce(sum(spending),0) into spent from public.ledger where user_id=me and spending_at>=now()-interval '12 months';
 pct:=public.tier_pct(spent);
 part:=r.amount/t.people; earned:=least(8000,part*pct/100);
 select name into local_name from public.locations where id=t.location_id;
 insert into public.ledger(user_id,amount,kind,available_at,settled,spending,spending_at,receipt_id,note)
 values(me,earned,'purchase',now()+interval '24 hours',false,part,r.created_at,r.id,'Tu parte de la mesa · '||local_name)
 returning * into previous;
 insert into public.notifications(user_id,kind,message) values(me,'purchase','Tu parte de la mesa sumó '||earned||' coronas. Se activan en 24 horas 👑');
 return jsonb_build_object('earned',earned,'part',part,'pct',pct,'tier',public.tier_for_spending(spent),'available_at',previous.available_at,'already_claimed',false,'location_name',local_name);
end $$;

-- ── Socio: QR de canje (30 segundos, se descuenta al escanear) ──────────────────────────────
create function public.redeem_qr(amount_value bigint) returns jsonb language plpgsql security definer set search_path=public as $$
declare me uuid:=auth.uid(); funds bigint; item public.member_qr;
begin
 if me is null then raise exception 'Inicia sesión'; end if;
 if amount_value is null or amount_value not between 1000 and 20000 or amount_value%500<>0 then raise exception 'Elige un descuento entre $1.000 y $20.000, en tramos de $500.'; end if;
 perform 1 from public.wallets where user_id=me for update;
 perform public.wallet_settle(me);
 if exists(select 1 from public.redemptions where user_id=me and status='used' and (created_at at time zone 'America/Santiago')::date=public.santiago_today()) then raise exception 'Ya usaste tu canje de hoy. Mañana puedes volver a canjear.'; end if;
 select balance into funds from public.wallets where user_id=me;
 if funds<amount_value then raise exception 'No tienes suficientes coronas disponibles.'; end if;
 if (select count(*) from public.member_qr where user_id=me and created_at>now()-interval '1 hour')>=240 then raise exception 'Espera un momento antes de generar otro código.'; end if;
 update public.member_qr set expires_at=least(expires_at,now()) where user_id=me and purpose='redeem' and used_at is null and expires_at>now();
 loop
  begin insert into public.member_qr(code,user_id,purpose,amount) values('C'||public.short_code(9),me,'redeem',amount_value) returning * into item; exit;
  exception when unique_violation then null; end;
 end loop;
 return jsonb_build_object('code',item.code,'amount',item.amount,'expires_at',item.expires_at,'now',now());
end $$;
create function public.member_qr_status(code_value text) returns jsonb language plpgsql security definer set search_path=public as $$
declare item public.member_qr;
begin
 select * into item from public.member_qr where code=public.clean_code(code_value) and user_id=auth.uid();
 if item.code is null then raise exception 'Código no encontrado'; end if;
 return jsonb_build_object('used',item.used_at is not null,'expired',item.expires_at<=now(),'amount',item.amount,'purpose',item.purpose,
  'location_name',(select name from public.locations where id=item.location_id));
end $$;

-- ── Garzón: escanea el QR del socio (canje o cumpleaños) ────────────────────────────────────
create function public.garzon_scan_member(device_token text,waiter_token text,code_value text) returns jsonb language plpgsql security definer set search_path=public as $$
declare w public.waiters; item public.member_qr; p public.profiles;
begin
 w:=public.local_waiter(device_token,waiter_token);
 select * into item from public.member_qr where code=public.clean_code(code_value);
 if item.code is null then raise exception 'Código no válido. Pide al socio que muestre su QR de nuevo.'; end if;
 if item.used_at is not null then raise exception 'Este código ya se usó.'; end if;
 if item.expires_at<=now() then raise exception 'El código venció. El QR se renueva solo: escanéalo de nuevo.'; end if;
 select * into p from public.profiles where id=item.user_id;
 if item.purpose='birthday' then
  update public.member_qr set held_until=now()+interval '3 minutes' where code=item.code;
  return jsonb_build_object('purpose','birthday','code',item.code,'name',p.first_name||' '||p.last_name,'birthday',to_char(p.birthday,'DD/MM/YYYY'));
 end if;
 return jsonb_build_object('purpose','redeem','code',item.code,'amount',item.amount,'name',p.first_name||' '||left(p.last_name,1)||'.');
end $$;
create function public.garzon_redeem(device_token text,waiter_token text,code_value text) returns jsonb language plpgsql security definer set search_path=public as $$
declare w public.waiters; item public.member_qr; funds bigint; red public.redemptions; local_name text; member_name text;
begin
 w:=public.local_waiter(device_token,waiter_token);
 select * into item from public.member_qr where code=public.clean_code(code_value) and purpose='redeem';
 if item.code is null then raise exception 'Código de canje no válido.'; end if;
 perform 1 from public.wallets where user_id=item.user_id for update;
 select * into item from public.member_qr where code=item.code for update;
 if item.used_at is not null then
  if item.location_id=w.location_id then
   select * into red from public.redemptions where id=item.redemption_id;
   return jsonb_build_object('redemption_id',red.id,'amount',red.amount,'already_used',true);
  end if;
  raise exception 'Este código ya se usó.';
 end if;
 if item.expires_at<=now() then raise exception 'El código venció. El QR se renueva solo: escanéalo de nuevo.'; end if;
 perform public.wallet_settle(item.user_id);
 if exists(select 1 from public.redemptions where user_id=item.user_id and status='used' and (created_at at time zone 'America/Santiago')::date=public.santiago_today()) then raise exception 'Este socio ya usó su canje de hoy.'; end if;
 select balance into funds from public.wallets where user_id=item.user_id;
 if funds<item.amount then raise exception 'El socio no tiene coronas suficientes para este descuento.'; end if;
 select name into local_name from public.locations where id=w.location_id;
 insert into public.redemptions(id,user_id,location_id,amount,status,expires_at,waiter_id) values(gen_random_uuid(),item.user_id,w.location_id,item.amount,'used',now(),w.id) returning * into red;
 update public.wallets set balance=balance-item.amount where user_id=item.user_id;
 insert into public.ledger(user_id,amount,kind,reference,note) values(item.user_id,-item.amount,'redemption',red.id,'Descuento en '||local_name);
 update public.member_qr set used_at=now(),location_id=w.location_id,waiter_id=w.id,redemption_id=red.id where code=item.code;
 insert into public.notifications(user_id,kind,message) values(item.user_id,'redemption','Descuento aprobado: '||item.amount||' coronas en '||local_name||' 👑');
 insert into public.local_audit(location_id,waiter_id,action,reference,detail) values(w.location_id,w.id,'redeem',red.id,jsonb_build_object('amount',item.amount));
 select first_name||' '||left(last_name,1)||'.' into member_name from public.profiles where id=item.user_id;
 return jsonb_build_object('redemption_id',red.id,'amount',red.amount,'name',member_name,'already_used',false);
end $$;
create function public.garzon_birthday(device_token text,waiter_token text,code_value text,id_checked boolean) returns jsonb language plpgsql security definer set search_path=public as $$
declare w public.waiters; item public.member_qr; p public.profiles; y integer:=extract(year from public.santiago_today())::integer;
begin
 w:=public.local_waiter(device_token,waiter_token);
 if not coalesce(id_checked,false) then raise exception 'Primero revisa la cédula del socio.'; end if;
 select * into item from public.member_qr where code=public.clean_code(code_value) and purpose='birthday' for update;
 if item.code is null then raise exception 'Código de cumpleaños no válido.'; end if;
 if item.used_at is not null then raise exception 'Este código ya se usó.'; end if;
 if item.expires_at<=now() and coalesce(item.held_until<=now(),true) then raise exception 'El código venció. El QR se renueva solo: escanéalo de nuevo.'; end if;
 select * into p from public.profiles where id=item.user_id;
 if not public.is_birthday(p.birthday) then raise exception 'Hoy no es el cumpleaños de este socio.'; end if;
 insert into public.birthday_rewards(user_id,year,location_id,waiter_id) values(item.user_id,y,w.location_id,w.id) on conflict do nothing;
 if not found then raise exception 'Este socio ya recibió su regalo de cumpleaños este año.'; end if;
 update public.member_qr set used_at=now(),location_id=w.location_id,waiter_id=w.id where code=item.code;
 insert into public.notifications(user_id,kind,message) values(item.user_id,'birthday','¡Feliz cumpleaños! Disfruta tu michelada de regalo 🎂');
 insert into public.local_audit(location_id,waiter_id,action,detail) values(w.location_id,w.id,'birthday',jsonb_build_object('member',p.first_name||' '||left(p.last_name,1)||'.'));
 return jsonb_build_object('name',p.first_name,'ok',true);
end $$;

-- ── Socio: cumpleaños ───────────────────────────────────────────────────────────────────────
create function public.is_birthday(birthday_value date) returns boolean language sql stable set search_path=public as $$
 select to_char(birthday_value,'MM-DD')=to_char(public.santiago_today(),'MM-DD')
  or (to_char(birthday_value,'MM-DD')='02-29' and to_char(public.santiago_today(),'MM-DD')='02-28'
      and not (extract(year from public.santiago_today())::integer % 4=0 and (extract(year from public.santiago_today())::integer % 100<>0 or extract(year from public.santiago_today())::integer % 400=0)))
$$;
create function public.my_birthday() returns jsonb language plpgsql security definer set search_path=public as $$
declare p public.profiles;
begin
 select * into p from public.profiles where id=auth.uid();
 if p.id is null then raise exception 'Inicia sesión'; end if;
 return jsonb_build_object('today',public.is_birthday(p.birthday),
  'claimed',exists(select 1 from public.birthday_rewards where user_id=p.id and year=extract(year from public.santiago_today())::integer));
end $$;
create function public.birthday_qr() returns jsonb language plpgsql security definer set search_path=public as $$
declare me uuid:=auth.uid(); p public.profiles; item public.member_qr;
begin
 select * into p from public.profiles where id=me;
 if p.id is null then raise exception 'Inicia sesión'; end if;
 if not public.is_birthday(p.birthday) then raise exception 'Tu regalo se activa el día de tu cumpleaños.'; end if;
 if exists(select 1 from public.birthday_rewards where user_id=me and year=extract(year from public.santiago_today())::integer) then raise exception 'Ya recibiste tu regalo de cumpleaños este año.'; end if;
 if (select count(*) from public.member_qr where user_id=me and created_at>now()-interval '1 hour')>=240 then raise exception 'Espera un momento antes de generar otro código.'; end if;
 update public.member_qr set expires_at=least(expires_at,now()) where user_id=me and purpose='birthday' and used_at is null and expires_at>now() and coalesce(held_until<=now(),true);
 loop
  begin insert into public.member_qr(code,user_id,purpose) values('B'||public.short_code(9),me,'birthday') returning * into item; exit;
  exception when unique_violation then null; end;
 end loop;
 return jsonb_build_object('code',item.code,'expires_at',item.expires_at,'now',now());
end $$;

-- ── Garzón: el día del local (cuadratura) y anulaciones del encargado ───────────────────────
create function public.garzon_day(device_token text,waiter_token text) returns jsonb language plpgsql security definer set search_path=public as $$
declare w public.waiters; since timestamptz:=(public.santiago_today()::timestamp at time zone 'America/Santiago');
begin
 w:=public.local_waiter(device_token,waiter_token);
 return jsonb_build_object(
  'waiter',jsonb_build_object('id',w.id,'name',w.name,'role',w.role),
  'tables',coalesce((select jsonb_agg(public.table_qr_json(t) order by t.created_at desc) from public.table_qr t where t.location_id=w.location_id and t.created_at>=since),'[]'),
  'redemptions',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'amount',r.amount,'created_at',r.created_at,'status',r.status,'voided_at',r.voided_at,
     'member',p.first_name||' '||left(p.last_name,1)||'.','waiter',(select name from public.waiters where id=r.waiter_id),
     'can_void',r.status='used' and r.created_at>now()-interval '2 hours') order by r.created_at desc)
   from public.redemptions r join public.profiles p on p.id=r.user_id where r.location_id=w.location_id and r.waiter_id is not null and r.created_at>=since),'[]'),
  'birthdays',(select count(*) from public.birthday_rewards where location_id=w.location_id and created_at>=since));
end $$;
create function public.garzon_void_table(device_token text,waiter_token text,table_value uuid,reason_value text) returns jsonb language plpgsql security definer set search_path=public as $$
declare w public.waiters; t public.table_qr; r public.receipts;
begin
 w:=public.local_waiter(device_token,waiter_token,true);
 if length(trim(coalesce(reason_value,'')))<3 then raise exception 'Escribe el motivo de la anulación.'; end if;
 select * into t from public.table_qr where id=table_value and location_id=w.location_id;
 if t.id is null then raise exception 'Mesa no encontrada'; end if;
 select * into r from public.receipts where id=t.receipt_id;
 if r.cancelled_at is not null then return public.table_qr_json(t); end if;
 if r.created_at<now()-interval '24 hours' then raise exception 'Solo se puede anular dentro de las 24 horas. Escribe a soporte.'; end if;
 perform public.pos_cancel_sale(w.location_id,r.folio);
 update public.table_qr set expires_at=least(expires_at,now()) where id=t.id;
 insert into public.local_audit(location_id,waiter_id,action,reference,detail) values(w.location_id,w.id,'table_void',t.id,jsonb_build_object('reason',trim(reason_value),'amount',r.amount));
 return public.table_qr_json(t);
end $$;
create function public.garzon_void_redemption(device_token text,waiter_token text,redemption_value uuid,reason_value text) returns jsonb language plpgsql security definer set search_path=public as $$
declare w public.waiters; red public.redemptions;
begin
 w:=public.local_waiter(device_token,waiter_token,true);
 if length(trim(coalesce(reason_value,'')))<3 then raise exception 'Escribe el motivo de la anulación.'; end if;
 select * into red from public.redemptions where id=redemption_value and location_id=w.location_id and waiter_id is not null;
 if red.id is null then raise exception 'Canje no encontrado'; end if;
 perform 1 from public.wallets where user_id=red.user_id for update;
 select * into red from public.redemptions where id=red.id for update;
 if red.status='cancelled' then return jsonb_build_object('id',red.id,'already_voided',true); end if;
 if red.created_at<now()-interval '2 hours' then raise exception 'Pasaron más de 2 horas: el socio debe pedir la devolución a soporte.'; end if;
 update public.redemptions set status='cancelled',voided_at=now(),void_reason=trim(reason_value) where id=red.id;
 perform public.wallet_credit(red.user_id,red.amount);
 insert into public.ledger(user_id,amount,kind,reference,note) values(red.user_id,red.amount,'release',red.id,'Canje anulado por el local: coronas devueltas');
 insert into public.notifications(user_id,kind,message) values(red.user_id,'redemption','El local anuló tu canje y te devolvió '||red.amount||' coronas.');
 insert into public.local_audit(location_id,waiter_id,action,reference,detail) values(w.location_id,w.id,'redeem_void',red.id,jsonb_build_object('reason',trim(reason_value),'amount',red.amount));
 return jsonb_build_object('id',red.id,'already_voided',false);
end $$;

-- ── Equipo del local ────────────────────────────────────────────────────────────────────────
create function public.save_waiter(location_value uuid,id_value uuid,name_value text,role_value text,pin_value text,active_value boolean) returns uuid language plpgsql security definer set search_path=public as $$
declare w public.waiters; salt_value text:=public.new_token(); result uuid;
begin
 if length(trim(coalesce(name_value,''))) not between 2 and 40 then raise exception 'Escribe el nombre del garzón (2 a 40 letras).'; end if;
 if coalesce(role_value,'') not in ('waiter','manager') then raise exception 'Rol inválido'; end if;
 if pin_value is not null and pin_value !~ '^[0-9]{4,6}$' then raise exception 'El PIN debe tener de 4 a 6 números.'; end if;
 if id_value is null then
  if pin_value is null then raise exception 'Define un PIN de 4 a 6 números.'; end if;
  if exists(select 1 from public.waiters where location_id=location_value and active and lower(name)=lower(trim(name_value))) then raise exception 'Ya hay alguien con ese nombre en el local.'; end if;
  insert into public.waiters(location_id,name,role,salt,pin_hash,active) values(location_value,trim(name_value),role_value,salt_value,public.secret_hash(salt_value,pin_value),coalesce(active_value,true)) returning id into result;
  return result;
 end if;
 select * into w from public.waiters where id=id_value and location_id=location_value for update;
 if w.id is null then raise exception 'Garzón no encontrado'; end if;
 update public.waiters set name=trim(name_value),role=role_value,active=coalesce(active_value,true),
  salt=case when pin_value is null then salt else salt_value end,
  pin_hash=case when pin_value is null then pin_hash else public.secret_hash(salt_value,pin_value) end,
  failed=case when pin_value is null then failed else 0 end,locked_until=case when pin_value is null then locked_until else null end
 where id=w.id;
 if not coalesce(active_value,true) then update public.local_sessions set waiter_id=null,waiter_token_hash=null where waiter_id=w.id; end if;
 return w.id;
end $$;
create function public.garzon_team(device_token text,waiter_token text) returns jsonb language plpgsql security definer set search_path=public as $$
declare w public.waiters;
begin
 w:=public.local_waiter(device_token,waiter_token,true);
 return coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'role',role,'active',active,'locked',coalesce(locked_until>now(),false)) order by active desc,(role='manager') desc,lower(name)) from public.waiters where location_id=w.location_id),'[]');
end $$;
create function public.garzon_save_waiter(device_token text,waiter_token text,id_value uuid,name_value text,pin_value text,active_value boolean) returns uuid language plpgsql security definer set search_path=public as $$
declare w public.waiters; target public.waiters; result uuid;
begin
 w:=public.local_waiter(device_token,waiter_token,true);
 if id_value is not null then
  select * into target from public.waiters where id=id_value and location_id=w.location_id;
  if target.id is null then raise exception 'Garzón no encontrado'; end if;
  if target.role='manager' and target.id<>w.id then raise exception 'Los encargados los administra LM Sincronía.'; end if;
  if target.id=w.id and not coalesce(active_value,true) then raise exception 'No puedes desactivarte a ti mismo.'; end if;
 end if;
 -- El encargado crea y edita garzones; los encargados nuevos los crea el administrador.
 result:=public.save_waiter(w.location_id,id_value,name_value,coalesce(target.role,'waiter'),nullif(trim(coalesce(pin_value,'')),''),active_value);
 insert into public.local_audit(location_id,waiter_id,action,reference,detail) values(w.location_id,w.id,'team_save',result,jsonb_build_object('name',trim(name_value),'active',coalesce(active_value,true),'pin_changed',nullif(trim(coalesce(pin_value,'')),'') is not null));
 return result;
end $$;

-- ── Administración (LM Sincronía) ───────────────────────────────────────────────────────────
create function public.admin_local_access() returns jsonb language plpgsql security definer set search_path=public as $$
begin
 perform public.require_staff(null,true);
 return coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'name',l.name,'is_test',coalesce(l.is_test,false),'active',l.active,
   'has_access',a.location_id is not null,'locked',coalesce(a.locked_until>now(),false),
   'devices',(select count(*) from public.local_sessions s where s.location_id=l.id and s.revoked_at is null and s.expires_at>now()),
   'waiters',coalesce((select jsonb_agg(jsonb_build_object('id',w.id,'name',w.name,'role',w.role,'active',w.active) order by w.active desc,(w.role='manager') desc,lower(w.name)) from public.waiters w where w.location_id=l.id),'[]'))
  order by coalesce(l.is_test,false) desc,l.name) from public.locations l left join public.local_access a on a.location_id=l.id),'[]');
end $$;
create function public.admin_set_local_password(location_value uuid,password_value text) returns void language plpgsql security definer set search_path=public as $$
declare salt_value text:=public.new_token();
begin
 perform public.require_staff(null,true);
 if length(coalesce(password_value,''))<8 then raise exception 'La clave del local debe tener al menos 8 caracteres.'; end if;
 if not exists(select 1 from public.locations where id=location_value) then raise exception 'Local no encontrado'; end if;
 insert into public.local_access(location_id,salt,password_hash) values(location_value,salt_value,public.secret_hash(salt_value,password_value))
 on conflict(location_id) do update set salt=excluded.salt,password_hash=excluded.password_hash,failed=0,locked_until=null,updated_at=now();
 -- Cambiar la clave cierra las sesiones abiertas en los teléfonos del local.
 update public.local_sessions set revoked_at=now() where location_id=location_value and revoked_at is null;
end $$;
create function public.admin_save_waiter(location_value uuid,id_value uuid,name_value text,role_value text,pin_value text,active_value boolean) returns uuid language plpgsql security definer set search_path=public as $$
begin
 perform public.require_staff(null,true);
 return public.save_waiter(location_value,id_value,name_value,role_value,nullif(trim(coalesce(pin_value,'')),''),active_value);
end $$;
create function public.admin_revoke_local_sessions(location_value uuid) returns void language plpgsql security definer set search_path=public as $$
begin
 perform public.require_staff(null,true);
 update public.local_sessions set revoked_at=now() where location_id=location_value and revoked_at is null;
end $$;

-- ── Permisos ────────────────────────────────────────────────────────────────────────────────
do $$ declare fn record; begin
 for fn in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname=any(array['secret_hash','new_token','short_code','clean_code','tier_pct','santiago_today','local_session','local_waiter',
  'garzon_locations','garzon_login','garzon_waiters','garzon_pin','garzon_logout','table_qr_json','garzon_open_table','garzon_table','garzon_renew_table',
  'table_qr_info','claim_table_qr','redeem_qr','member_qr_status','garzon_scan_member','garzon_redeem','garzon_birthday','is_birthday','my_birthday','birthday_qr',
  'garzon_day','garzon_void_table','garzon_void_redemption','save_waiter','garzon_team','garzon_save_waiter',
  'admin_local_access','admin_set_local_password','admin_save_waiter','admin_revoke_local_sessions'])
 loop execute format('revoke execute on function %s from public,anon,authenticated',fn.signature); end loop;
end $$;
-- La app del garzón no usa cuentas del Club: entra con la clave del local (anon) y cada llamada lleva sus tokens.
grant execute on function public.garzon_locations(),public.garzon_login(uuid,text),public.garzon_waiters(text),public.garzon_pin(text,uuid,text),public.garzon_logout(text,boolean),
 public.garzon_open_table(text,text,bigint,integer,text,uuid),public.garzon_table(text,text,uuid),public.garzon_renew_table(text,text,uuid),
 public.garzon_scan_member(text,text,text),public.garzon_redeem(text,text,text),public.garzon_birthday(text,text,text,boolean),
 public.garzon_day(text,text),public.garzon_void_table(text,text,uuid,text),public.garzon_void_redemption(text,text,uuid,text),
 public.garzon_team(text,text),public.garzon_save_waiter(text,text,uuid,text,text,boolean) to anon,authenticated;
grant execute on function public.table_qr_info(text) to anon,authenticated;
grant execute on function public.claim_table_qr(text),public.redeem_qr(bigint),public.member_qr_status(text),public.my_birthday(),public.birthday_qr(),
 public.admin_local_access(),public.admin_set_local_password(uuid,text),public.admin_save_waiter(uuid,uuid,text,text,text,boolean),public.admin_revoke_local_sessions(uuid) to authenticated;

-- Ya no hay enlaces para repartir la mesa ni fichas reservadas desde la app del socio.
revoke execute on function public.prepare_table(integer,uuid),public.claim_table_share(text),public.my_table_checkouts(),public.my_receipt_tables() from authenticated;
revoke execute on function public.table_share_info(text) from anon,authenticated;
revoke execute on function public.create_redemption(uuid,bigint,uuid) from authenticated;

commit;
