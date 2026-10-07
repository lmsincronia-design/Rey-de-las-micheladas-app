-- New rates apply to future purchases; previous ledger entries retain their amounts.
begin;

create or replace function public.my_wallet() returns jsonb language plpgsql security definer set search_path=public as $$
declare owner_id uuid:=auth.uid(); w public.wallets; spending_value bigint; pending_value bigint; tier text; pct int;
begin
 if owner_id is null then raise exception 'Inicia sesión'; end if;
 select * into w from public.wallets where user_id=owner_id for update;
 perform public.wallet_settle(owner_id);
 select * into w from public.wallets where user_id=owner_id;
 select coalesce(sum(spending),0) into spending_value from public.ledger where user_id=owner_id and spending_at>=now()-interval '12 months';
 select coalesce(sum(amount),0) into pending_value from public.ledger where user_id=owner_id and not settled;
 tier:=case when spending_value>=700000 then 'Rey' when spending_value>=350000 then 'Noble' when spending_value>=150000 then 'Guardia Real' when spending_value>=50000 then 'Comerciante' else 'Plebeyo' end;
 pct:=case tier when 'Rey' then 12 when 'Noble' then 10 when 'Guardia Real' then 8 when 'Comerciante' then 6 else 4 end;
 return jsonb_build_object('balance',w.balance,'pending',pending_value,'debt',w.debt,'spending',spending_value,'tier',tier,'pct',pct);
end $$;

create or replace function public.pos_record_sale(location_value uuid,folio_value text,amount_value bigint,people_value integer,codes text[],redemption_code text default null) returns uuid language plpgsql security definer set search_path=public as $$
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
 pct:=case when spending_value>=700000 then 12 when spending_value>=350000 then 10 when spending_value>=150000 then 8 when spending_value>=50000 then 6 else 4 end;
 earned:=least(8000,part*pct/100);
 insert into public.ledger(user_id,amount,kind,available_at,settled,spending,receipt_id,note) values(owner_id,earned,'purchase',now()+interval '24 hours',false,part,receipt.id,'Coronas por boleta '||folio_value);
 insert into public.notifications(user_id,kind,message) values(owner_id,'purchase','Ganaste '||earned||' coronas. Se activan en 24 horas 👑');
 end loop;
 return receipt.id;
end $$;

commit;
