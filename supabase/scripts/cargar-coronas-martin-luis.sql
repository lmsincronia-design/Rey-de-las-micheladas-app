-- Ejecutar completo en Supabase > SQL Editor. Compatible con la migración inicial 001.
-- Busca nombres exactos: Martín/Martin y Luis. Falla si faltan o están duplicados.
-- Agrega coronas; no reemplaza el saldo existente ni aumenta el rango.
begin;
do $$
declare
 martin uuid; luis uuid; socio record; anterior public.ledger;
begin
 select id into strict martin from public.profiles where lower(trim(first_name)) in ('martín','martin');
 select id into strict luis from public.profiles where lower(trim(first_name))='luis';
 perform 1 from public.wallets where user_id in(martin,luis) order by user_id for update;
 for socio in select * from (values
  (martin,5000::bigint,'70000000-0000-4000-8000-000000000002'::uuid,'PRUEBA: saldo inicial Martín'),
  (luis,3000::bigint,'70000000-0000-4000-8000-000000000003'::uuid,'PRUEBA: saldo inicial Luis')
 ) as cargas(user_id,amount,reference,note)
 loop
  select * into anterior from public.ledger where reference=socio.reference;
  if found then
   if anterior.user_id<>socio.user_id or anterior.amount<>socio.amount then
    raise exception 'Esta carga de prueba ya se usó con otros datos';
   end if;
  else
   perform public.wallet_settle(socio.user_id);
   perform public.wallet_credit(socio.user_id,socio.amount);
   insert into public.ledger(user_id,amount,kind,reference,note,settled,spending)
    values(socio.user_id,socio.amount,'purchase',socio.reference,socio.note,true,0);
   insert into public.notifications(user_id,kind,message)
    values(socio.user_id,'admin_credit','PRUEBA: recibiste '||socio.amount||' coronas 👑');
  end if;
 end loop;
exception
 when no_data_found then raise exception 'Falta una cuenta con nombre exacto Martín/Martin o Luis. Revisa public.profiles.';
 when too_many_rows then raise exception 'Hay nombres repetidos. Identifica las cuentas por su código antes de cargar.';
end $$;
select p.first_name,p.last_name,p.member_code,w.balance as coronas_disponibles,w.debt as ajuste_pendiente
from public.profiles p join public.wallets w on w.user_id=p.id
where lower(trim(p.first_name)) in ('martín','martin','luis');
commit;
