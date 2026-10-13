-- Ranking del Club: posición de cada socio según su consumo de los últimos 12 meses
-- (la MISMA suma que define el rango: ledger.spending). No cambia coronas, rangos ni saldos.
--
-- Privacidad (Ley 21.719):
--  * Nadie aparece con nombre si no lo activó (ranking_visible, apagado por defecto).
--  * El nombre público es el mismo que ven los amigos: nombre + inicial del apellido.
--  * No se exponen montos ajenos, RUT, celular, correo ni código de socio.
--  * El consumo de locales de prueba (is_test) no cuenta.
begin;

alter table public.profiles add column ranking_visible boolean not null default false;

create function public.tier_for_spending(value bigint) returns text language sql immutable set search_path=public as $$
 select case when value>=700000 then 'Rey' when value>=350000 then 'Noble' when value>=150000 then 'Guardia Real' when value>=50000 then 'Comerciante' else 'Plebeyo' end
$$;

create function public.set_ranking_visibility(enabled boolean) returns void language plpgsql security definer set search_path=public as $$
begin
 update public.profiles set ranking_visible=enabled where id=auth.uid();
 if not found then raise exception 'Inicia sesión'; end if;
end $$;

-- Devuelve el Top N (por defecto 10), el total de socios clasificados y la posición de quien consulta.
-- Clasifican solo quienes tienen consumo > 0 en 12 meses. Desempate: el socio más antiguo.
create function public.club_ranking(top_n int default 10) returns jsonb language plpgsql security definer set search_path=public as $$
declare owner_id uuid:=auth.uid(); result jsonb; limit_n int:=least(greatest(coalesce(top_n,10),1),25);
begin
 if owner_id is null then raise exception 'Inicia sesión'; end if;
 with spend as (
  select p.id,p.first_name,p.last_name,p.ranking_visible,p.created_at,
   coalesce(sum(l.spending) filter (where l.spending_at>=now()-interval '12 months' and not coalesce(loc.is_test,false)),0)::bigint as total
  from public.profiles p
  left join public.ledger l on l.user_id=p.id and l.spending<>0
  left join public.receipts r on r.id=l.receipt_id
  left join public.locations loc on loc.id=r.location_id
  group by p.id
 ), ranked as (
  select s.*,
   row_number() over(order by s.total desc,s.created_at asc,s.id asc)::int as position,
   lag(s.total) over(order by s.total desc,s.created_at asc,s.id asc) as above_total
  from spend s where s.total>0
 )
 select jsonb_build_object(
  'total',(select count(*) from ranked),
  'limit',limit_n,
  'visible',(select ranking_visible from public.profiles where id=owner_id),
  'top',coalesce((select jsonb_agg(jsonb_build_object(
      'position',r.position,
      'name',case when r.ranking_visible then r.first_name||' '||left(r.last_name,1)||'.' else null end,
      'tier',public.tier_for_spending(r.total),
      'me',r.id=owner_id) order by r.position) from ranked r where r.position<=limit_n),'[]'::jsonb),
  'me',(select jsonb_build_object(
      'position',r.position,
      'tier',public.tier_for_spending(r.total),
      'gap',case when r.above_total is null then 0 else r.above_total-r.total end,
      'gap_top',case when r.position>limit_n then (select x.total from ranked x where x.position=limit_n)-r.total else 0 end)
    from ranked r where r.id=owner_id)
 ) into result;
 return result;
end $$;

revoke execute on function public.tier_for_spending(bigint),public.set_ranking_visibility(boolean),public.club_ranking(int) from public,anon,authenticated;
grant execute on function public.set_ranking_visibility(boolean),public.club_ranking(int) to authenticated;

commit;
