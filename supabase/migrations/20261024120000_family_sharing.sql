-- =====================================================================
-- Gaveta da família (fase 5): nomes dos membros, histórico legível,
-- prévia do convite e troca de chave ao remover alguém.
-- =====================================================================

-- Chaves antigas do cofre, cifradas com a chave atual (null enquanto a chave nunca foi trocada).
-- Quem continua no cofre abre o chaveiro e lê registros antigos; quem saiu não recebe a chave nova.
alter table public.vaults add column keyring text;

-- Nome para mostrar: o do Google ou o começo do e-mail. O servidor já conhece esses dados pelo
-- login; as funções abaixo só os mostram a quem divide o mesmo cofre.
create function public.member_label(p_user uuid)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce(
    nullif(trim(u.raw_user_meta_data->>'full_name'), ''),
    nullif(trim(u.raw_user_meta_data->>'name'), ''),
    split_part(u.email, '@', 1),
    'Alguém'
  )
  from auth.users u where u.id = p_user
$$;
revoke all on function public.member_label(uuid) from public, anon, authenticated;

-- Membros do cofre, com nome e e-mail (só para membros)
create function public.vault_member_list(p_vault uuid)
returns table (user_id uuid, role text, name text, email text, joined_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_vault_member(p_vault) then raise exception 'SEM_ACESSO' using errcode = '42501'; end if;
  return query
    select m.user_id, m.role, public.member_label(m.user_id), u.email::text, m.created_at
    from public.vault_members m
    join auth.users u on u.id = m.user_id
    where m.vault_id = p_vault
    order by case m.role when 'owner' then 0 when 'editor' then 1 when 'payer' then 2 else 3 end, m.created_at;
end $$;

-- Histórico com o nome de quem fez e de quem foi afetado (paginado do mais novo para o mais antigo)
create function public.vault_history(p_vault uuid, p_before bigint default null, p_limit int default 50)
returns table (
  id bigint, at timestamptz, action text, record_kind text, record_id text, note text,
  actor_id uuid, actor_name text, target_id uuid, target_name text
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_vault_member(p_vault) then raise exception 'SEM_ACESSO' using errcode = '42501'; end if;
  return query
    select a.id, a.at, a.action, a.record_kind, a.record_id, a.note,
           a.actor_id, public.member_label(a.actor_id), a.target_user, public.member_label(a.target_user)
    from public.audit_log a
    where a.vault_id = p_vault and (p_before is null or a.id < p_before)
    order by a.id desc
    limit least(greatest(coalesce(p_limit, 50), 1), 200);
end $$;

-- Prévia do convite: além da chave, o nome cifrado da gaveta e quem convidou
drop function public.peek_invite(uuid, text);
create function public.peek_invite(p_invite uuid, p_token text)
returns table (
  vault_id uuid, role text, wrapped_vault_key text, key_version int, expires_at timestamptz,
  encrypted_meta text, inviter_name text
)
language plpgsql stable security definer set search_path = '' as $$
declare
  inv public.invites := public.valid_invite(p_invite, p_token);
begin
  return query
    select inv.vault_id, inv.role, inv.wrapped_vault_key, inv.key_version, inv.expires_at,
           v.encrypted_meta, public.member_label(inv.created_by)
    from public.vaults v where v.id = inv.vault_id;
end $$;

-- Remove um membro e troca a chave do cofre numa única transação.
-- O app do dono gera a chave nova, embrulha para cada membro que fica e manda tudo aqui.
-- Se alguém entrou ou saiu no meio tempo, falha com MEMBROS_MUDARAM e o app tenta de novo.
create function public.remove_member_rotate(
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

  -- A chave nova precisa ir para todos que ficaram, e só para eles
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

  -- Convites pendentes levam a chave antiga: cancela
  update public.invites set revoked_at = now()
  where vault_id = p_vault and used_at is null and revoked_at is null;
end $$;

revoke all on function
  public.vault_member_list(uuid),
  public.vault_history(uuid, bigint, int),
  public.peek_invite(uuid, text),
  public.remove_member_rotate(uuid, uuid, int, text, text, jsonb)
from public, anon;
grant execute on function
  public.vault_member_list(uuid),
  public.vault_history(uuid, bigint, int),
  public.peek_invite(uuid, text),
  public.remove_member_rotate(uuid, uuid, int, text, text, jsonb)
to authenticated;
