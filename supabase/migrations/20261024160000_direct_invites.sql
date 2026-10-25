-- =====================================================================
-- Convite direto pelo e-mail: aparece no sininho de quem foi convidado,
-- que aceita ou recusa. Sem QR nem mensagem.
--
-- O dono acha a chave pública da pessoa pelo e-mail e embrulha a chave da
-- gaveta para ela (o mesmo embrulho de um membro). O servidor guarda só o
-- pedido e o embrulho: continua sem conseguir abrir a gaveta.
-- Tabela fechada: tudo passa pelas funções abaixo, que conferem cada papel.
-- =====================================================================

create table public.direct_invites (
  id          uuid primary key default gen_random_uuid(),
  vault_id    uuid not null references public.vaults (id) on delete cascade,
  invitee_id  uuid not null references auth.users (id) on delete cascade,
  role        text not null check (role in ('editor', 'payer', 'viewer')),
  wrapped_key text not null check (length(wrapped_key) between 40 and 400),
  key_version int  not null,
  created_by  uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '7 days',
  answer      text check (answer in ('accepted', 'declined', 'revoked')),
  answered_at timestamptz
);
-- Um pedido em aberto por pessoa e gaveta (convidar de novo substitui o anterior)
create unique index direct_invites_pending_idx on public.direct_invites (vault_id, invitee_id) where answer is null;
create index direct_invites_invitee_idx on public.direct_invites (invitee_id) where answer is null;
create index direct_invites_created_by_idx on public.direct_invites (created_by);

alter table public.direct_invites enable row level security;
revoke all on public.direct_invites from public, anon, authenticated;

-- Quem tem conta no Control com este e-mail (e a chave pública dela, para embrulhar a chave da gaveta)
create function public.find_user_by_email(p_email text)
returns table (user_id uuid, public_key text, name text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'SEM_ACESSO' using errcode = '42501'; end if;
  return query
    select u.id, k.public_key, public.member_label(u.id)
    from auth.users u
    join public.user_keys k on k.user_id = u.id
    where lower(u.email) = lower(trim(p_email))
    limit 1;
end $$;

-- Dono convida: o embrulho precisa ser da versão atual da chave
create function public.create_direct_invite(
  p_vault uuid, p_invitee uuid, p_role text, p_wrapped_key text, p_key_version int
)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare
  v public.vaults;
  expires timestamptz;
begin
  select * into v from public.vaults where id = p_vault;
  if not found or v.owner_id is distinct from auth.uid() then raise exception 'SEM_ACESSO' using errcode = '42501'; end if;
  if p_invitee = auth.uid() then raise exception 'CONVITE_PARA_SI' using errcode = '22023'; end if;
  if p_key_version is distinct from v.key_version then raise exception 'VERSAO_DA_CHAVE' using errcode = '22023'; end if;
  if exists (select 1 from public.vault_members m where m.vault_id = p_vault and m.user_id = p_invitee) then
    raise exception 'JA_E_MEMBRO' using errcode = '28000';
  end if;
  update public.direct_invites set answer = 'revoked', answered_at = now()
  where vault_id = p_vault and invitee_id = p_invitee and answer is null;
  insert into public.direct_invites (vault_id, invitee_id, role, wrapped_key, key_version, created_by)
  values (p_vault, p_invitee, p_role, p_wrapped_key, p_key_version, auth.uid())
  returning expires_at into expires;
  insert into public.audit_log (vault_id, actor_id, action, target_user, note)
  values (p_vault, auth.uid(), 'invite_create', p_invitee, p_role);
  return expires;
end $$;

-- Sininho: convites em aberto para mim, com o nome cifrado da gaveta e quem convidou
create function public.my_direct_invites()
returns table (
  id uuid, vault_id uuid, role text, wrapped_key text, key_version int,
  expires_at timestamptz, encrypted_meta text, inviter_name text
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'SEM_ACESSO' using errcode = '42501'; end if;
  return query
    select d.id, d.vault_id, d.role, d.wrapped_key, d.key_version, d.expires_at,
           v.encrypted_meta, public.member_label(d.created_by)
    from public.direct_invites d
    join public.vaults v on v.id = d.vault_id
    where d.invitee_id = auth.uid() and d.answer is null and d.expires_at > now()
      and d.key_version = v.key_version
    order by d.created_at desc;
end $$;

-- Aceitar entra na gaveta com o embrulho que o dono preparou; recusar só fecha o pedido
create function public.answer_direct_invite(p_invite uuid, p_accept boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  d public.direct_invites;
  current_version int;
begin
  select * into d from public.direct_invites where id = p_invite for update;
  if not found or d.invitee_id is distinct from auth.uid() then raise exception 'CONVITE_INVALIDO' using errcode = '28000'; end if;
  if d.answer = 'revoked' then raise exception 'CONVITE_CANCELADO' using errcode = '28000'; end if;
  if d.answer is not null then raise exception 'CONVITE_JA_USADO' using errcode = '28000'; end if;
  if d.expires_at <= now() then raise exception 'CONVITE_EXPIRADO' using errcode = '28000'; end if;

  if not p_accept then
    update public.direct_invites set answer = 'declined', answered_at = now() where id = d.id;
    insert into public.audit_log (vault_id, actor_id, action, target_user, note)
    values (d.vault_id, auth.uid(), 'invite_decline', auth.uid(), d.role);
    return d.vault_id;
  end if;

  select v.key_version into current_version from public.vaults v where v.id = d.vault_id;
  if current_version is distinct from d.key_version then raise exception 'CONVITE_EXPIRADO' using errcode = '28000'; end if;
  if exists (select 1 from public.vault_members m where m.vault_id = d.vault_id and m.user_id = auth.uid()) then
    raise exception 'JA_E_MEMBRO' using errcode = '28000';
  end if;
  update public.direct_invites set answer = 'accepted', answered_at = now() where id = d.id;
  insert into public.vault_members (vault_id, user_id, role, wrapped_key, key_version, invited_by)
  values (d.vault_id, auth.uid(), d.role, d.wrapped_key, d.key_version, d.created_by);
  return d.vault_id;
end $$;

-- Dono: pedidos em aberto da gaveta, com nome e e-mail de quem foi convidado
create function public.vault_direct_invites(p_vault uuid)
returns table (id uuid, invitee_id uuid, name text, email text, role text, expires_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.vaults v where v.id = p_vault and v.owner_id = auth.uid()) then
    raise exception 'SEM_ACESSO' using errcode = '42501';
  end if;
  return query
    select d.id, d.invitee_id, public.member_label(d.invitee_id), u.email::text, d.role, d.expires_at
    from public.direct_invites d
    join auth.users u on u.id = d.invitee_id
    where d.vault_id = p_vault and d.answer is null and d.expires_at > now()
    order by d.created_at desc;
end $$;

create function public.revoke_direct_invite(p_invite uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  d public.direct_invites;
begin
  select * into d from public.direct_invites where id = p_invite for update;
  if not found or not exists (select 1 from public.vaults v where v.id = d.vault_id and v.owner_id = auth.uid()) then
    raise exception 'SEM_ACESSO' using errcode = '42501';
  end if;
  if d.answer is not null then return; end if;
  update public.direct_invites set answer = 'revoked', answered_at = now() where id = d.id;
  insert into public.audit_log (vault_id, actor_id, action, target_user, note)
  values (d.vault_id, auth.uid(), 'invite_revoke', d.invitee_id, d.role);
end $$;

-- Trocar a chave (ao remover alguém) também cancela os convites diretos: o embrulho era da chave antiga
create or replace function public.remove_member_rotate(
  p_vault uuid, p_user uuid, p_key_version int, p_keyring text, p_meta text, p_wraps jsonb
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v public.vaults;
  remaining int;
  matched int;
begin
  select * into v from public.vaults where id = p_vault for update;
  if not found or v.owner_id is distinct from auth.uid() then
    raise exception 'SEM_ACESSO' using errcode = '42501';
  end if;
  if p_user = v.owner_id then raise exception 'DONO_NAO_SAI' using errcode = '22023'; end if;
  if p_key_version is distinct from v.key_version + 1 then
    raise exception 'VERSAO_DA_CHAVE' using errcode = '22023';
  end if;
  if p_keyring is null or p_meta is null or jsonb_typeof(p_wraps) is distinct from 'array' then
    raise exception 'DADOS_INCOMPLETOS' using errcode = '22023';
  end if;

  delete from public.vault_members where vault_id = p_vault and user_id = p_user;
  if not found then raise exception 'NAO_E_MEMBRO' using errcode = '22023'; end if;

  select count(*) into remaining from public.vault_members where vault_id = p_vault;
  select count(distinct w.user_id) into matched
  from jsonb_to_recordset(p_wraps) as w(user_id uuid, wrapped_key text)
  join public.vault_members m on m.vault_id = p_vault and m.user_id = w.user_id
  where coalesce(w.wrapped_key, '') <> '';
  if matched <> remaining or jsonb_array_length(p_wraps) <> remaining then
    raise exception 'MEMBROS_MUDARAM' using errcode = '40001';
  end if;

  update public.vault_members m
  set wrapped_key = w.wrapped_key, key_version = p_key_version
  from jsonb_to_recordset(p_wraps) as w(user_id uuid, wrapped_key text)
  where m.vault_id = p_vault and m.user_id = w.user_id;

  update public.vaults
  set key_version = p_key_version, keyring = p_keyring, encrypted_meta = p_meta
  where id = p_vault;

  update public.invites set revoked_at = now()
  where vault_id = p_vault and used_at is null and revoked_at is null;
  update public.direct_invites set answer = 'revoked', answered_at = now()
  where vault_id = p_vault and answer is null;
end $$;

revoke all on function
  public.find_user_by_email(text),
  public.create_direct_invite(uuid, uuid, text, text, int),
  public.my_direct_invites(),
  public.answer_direct_invite(uuid, boolean),
  public.vault_direct_invites(uuid),
  public.revoke_direct_invite(uuid)
from public, anon;
grant execute on function
  public.find_user_by_email(text),
  public.create_direct_invite(uuid, uuid, text, text, int),
  public.my_direct_invites(),
  public.answer_direct_invite(uuid, boolean),
  public.vault_direct_invites(uuid),
  public.revoke_direct_invite(uuid)
to authenticated;
