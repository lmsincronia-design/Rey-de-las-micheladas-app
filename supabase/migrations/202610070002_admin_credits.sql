-- Manual credits for pilots/promotions. Only administrators may issue them.
-- These are spendable crowns in this database, never a separate demo wallet.
begin;

alter table public.ledger drop constraint ledger_kind_check;
alter table public.ledger add constraint ledger_kind_check
  check (kind in ('purchase','transfer_in','transfer_out','redemption','release','reversal','admin_credit'));

create table public.admin_credits (
  id uuid primary key,
  user_id uuid not null references public.profiles(id),
  admin_id uuid not null references public.profiles(id),
  amount bigint not null check (amount between 1 and 20000),
  reason text not null check (length(trim(reason)) between 5 and 200),
  created_at timestamptz not null default now()
);
create index admin_credits_created on public.admin_credits(created_at desc);
alter table public.admin_credits enable row level security;
revoke all on public.admin_credits from anon, authenticated;

create function public.admin_credit_crowns(
  code_value text, amount_value bigint, reason_value text, request_id uuid
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  recipient public.profiles;
  previous public.admin_credits;
  clean_reason text := trim(reason_value);
  current_balance bigint;
begin
  perform public.require_staff(null, true);
  if request_id is null or amount_value is null or amount_value not between 1 and 20000
    or clean_reason is null or length(clean_reason) not between 5 and 200 then
    raise exception 'Indica entre 1 y 20.000 coronas y un motivo de 5 a 200 caracteres';
  end if;
  select * into recipient from public.profiles
    where member_code = upper(regexp_replace(code_value, '[^A-Za-z0-9]', '', 'g'));
  if recipient.id is null then raise exception 'Código de socio no encontrado'; end if;

  -- Serialize balance changes and idempotent retries for this recipient.
  perform 1 from public.wallets where user_id = recipient.id for update;
  select * into previous from public.admin_credits where id = request_id;
  if found then
    if previous.admin_id <> me or previous.user_id <> recipient.id
      or previous.amount <> amount_value or previous.reason <> clean_reason then
      raise exception 'Solicitud ya utilizada con otros datos';
    end if;
    return jsonb_build_object('id', previous.id, 'amount', previous.amount, 'already_applied', true);
  end if;

  perform public.wallet_settle(recipient.id);
  insert into public.admin_credits(id, user_id, admin_id, amount, reason)
    values(request_id, recipient.id, me, amount_value, clean_reason);
  perform public.wallet_credit(recipient.id, amount_value);
  insert into public.ledger(user_id, amount, kind, reference, note)
    values(recipient.id, amount_value, 'admin_credit', request_id, 'Acreditación del Club: ' || clean_reason);
  insert into public.notifications(user_id, actor_id, kind, message)
    values(recipient.id, me, 'admin_credit', 'El Club te acreditó ' || amount_value || ' coronas 👑');
  select balance into current_balance from public.wallets where user_id = recipient.id;
  return jsonb_build_object('id', request_id, 'amount', amount_value,
    'balance', current_balance, 'already_applied', false);
end $$;

create function public.admin_credit_history() returns jsonb
language plpgsql security definer set search_path = public as $$
declare result jsonb;
begin
  perform public.require_staff(null, true);
  select coalesce(jsonb_agg(row_to_json(item) order by item.created_at desc), '[]'::jsonb)
    into result from (
      select c.id, p.member_code, p.first_name || ' ' || left(p.last_name, 1) || '.' as member_name,
        c.amount, c.reason, a.first_name || ' ' || left(a.last_name, 1) || '.' as admin_name, c.created_at
      from public.admin_credits c
      join public.profiles p on p.id = c.user_id
      join public.profiles a on a.id = c.admin_id
      order by c.created_at desc limit 50
    ) item;
  return result;
end $$;

revoke execute on function public.admin_credit_crowns(text,bigint,text,uuid), public.admin_credit_history()
  from public, anon, authenticated;
grant execute on function public.admin_credit_crowns(text,bigint,text,uuid), public.admin_credit_history()
  to authenticated;

commit;
