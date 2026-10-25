-- =====================================================================
-- Control: sincronização com criptografia ponta a ponta
--
-- O servidor guarda só texto cifrado. Ele enxerga apenas o necessário para
-- funcionar: quem é membro de qual cofre, o papel de cada um e os horários.
-- As permissões (ver / pagar / editar / gerenciar) são garantidas aqui, pelas
-- regras de acesso (RLS), e não só pelo app.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Chave pública de cada usuário (a privada nunca sai do celular)
-- ---------------------------------------------------------------------
create table public.user_keys (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  public_key text not null check (length(public_key) between 40 and 64), -- X25519 em base64
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Cofres: cada perfil sincronizado ou lista compartilhada é um cofre
-- ---------------------------------------------------------------------
create table public.vaults (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  key_version    int  not null default 1 check (key_version >= 1), -- muda ao remover um membro
  encrypted_meta text,                                            -- nome, cor e ícone, cifrados
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table public.vault_members (
  vault_id    uuid not null references public.vaults (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        text not null check (role in ('owner', 'editor', 'payer', 'viewer')),
  wrapped_key text not null,  -- chave do cofre embrulhada para este membro
  key_version int  not null,
  invited_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  primary key (vault_id, user_id)
);
create index vault_members_user_idx on public.vault_members (user_id);

-- ---------------------------------------------------------------------
-- Registros cifrados. Conteúdo da conta ('document') e pagamento ('payment')
-- são separados: o pagador só grava 'payment', e pagar não sobrescreve edição.
-- ---------------------------------------------------------------------
create table public.records (
  vault_id    uuid not null references public.vaults (id) on delete cascade,
  kind        text not null check (kind in ('document', 'payment', 'learned')),
  id          text not null check (length(id) between 1 and 100),
  ciphertext  text,                               -- null quando excluído
  key_version int  not null,
  deleted     boolean not null default false,
  audit_note  text,                               -- resumo cifrado da alteração, copiado para o histórico
  updated_at  timestamptz not null default now(), -- relógio do servidor (base da sincronização)
  updated_by  uuid references auth.users (id) on delete set null,
  primary key (vault_id, kind, id),
  check (deleted or ciphertext is not null)
);
create index records_pull_idx on public.records (vault_id, updated_at);

-- ---------------------------------------------------------------------
-- Histórico: escrito só pelos gatilhos do banco; ninguém altera nem apaga
-- ---------------------------------------------------------------------
create table public.audit_log (
  id          bigint generated always as identity primary key,
  vault_id    uuid not null references public.vaults (id) on delete cascade,
  actor_id    uuid references auth.users (id) on delete set null,
  action      text not null,
  record_kind text,
  record_id   text,
  target_user uuid,
  note        text, -- cifrado com a chave do cofre (ex.: "Marcou ENEL R$ 181,31 como paga")
  at          timestamptz not null default now()
);
create index audit_log_vault_idx on public.audit_log (vault_id, at desc);

-- =====================================================================
-- Funções auxiliares das regras (security definer: consultam membros sem
-- cair em recursão nas próprias regras de vault_members)
-- =====================================================================
create function public.vault_role(p_vault uuid)
returns text language sql stable security definer set search_path = '' as $$
  select m.role from public.vault_members m
  where m.vault_id = p_vault and m.user_id = auth.uid()
$$;

create function public.is_vault_member(p_vault uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.vault_members m where m.vault_id = p_vault and m.user_id = auth.uid())
$$;

create function public.shares_vault_with(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.vault_members a
    join public.vault_members b on b.vault_id = a.vault_id
    where a.user_id = auth.uid() and b.user_id = p_user
  )
$$;

-- =====================================================================
-- Gatilhos
-- =====================================================================

-- Registros: horário e autor sempre do servidor (o app não consegue forjar)
create function public.records_stamp()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  if new.deleted then new.ciphertext := null; end if;
  return new;
end $$;

create trigger records_stamp before insert or update on public.records
for each row execute function public.records_stamp();

-- Histórico de registros
create function public.records_audit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_log (vault_id, actor_id, action, record_kind, record_id, note)
  values (
    new.vault_id, auth.uid(),
    case
      when new.deleted then 'delete'
      when tg_op = 'INSERT' then 'create'
      when new.kind = 'payment' then 'payment'
      else 'update'
    end,
    new.kind, new.id, new.audit_note
  );
  return null;
end $$;

create trigger records_audit after insert or update on public.records
for each row execute function public.records_audit();

-- Histórico de membros
create function public.members_audit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.audit_log (vault_id, actor_id, action, target_user, note)
    values (new.vault_id, auth.uid(), 'member_add', new.user_id, new.role);
  elsif tg_op = 'UPDATE' and new.role is distinct from old.role then
    insert into public.audit_log (vault_id, actor_id, action, target_user, note)
    values (new.vault_id, auth.uid(), 'member_role', new.user_id, old.role || ' -> ' || new.role);
  elsif tg_op = 'DELETE' then
    insert into public.audit_log (vault_id, actor_id, action, target_user, note)
    values (old.vault_id, auth.uid(), 'member_remove', old.user_id, old.role);
  end if;
  return null;
end $$;

create trigger members_audit after insert or update or delete on public.vault_members
for each row execute function public.members_audit();

-- Troca de chave do cofre (após remover alguém) também fica registrada
create function public.vaults_audit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.key_version is distinct from old.key_version then
    insert into public.audit_log (vault_id, actor_id, action, note)
    values (new.id, auth.uid(), 'key_rotate', old.key_version || ' -> ' || new.key_version);
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger vaults_audit before update on public.vaults
for each row execute function public.vaults_audit();

-- =====================================================================
-- Regras de acesso (RLS)
-- =====================================================================
alter table public.user_keys     enable row level security;
alter table public.vaults        enable row level security;
alter table public.vault_members enable row level security;
alter table public.records       enable row level security;
alter table public.audit_log     enable row level security;

-- Chaves públicas: a própria, e a de quem divide um cofre comigo
create policy "ver chaves de quem divide cofre" on public.user_keys for select to authenticated
  using (user_id = auth.uid() or public.shares_vault_with(user_id));
create policy "cadastrar a própria chave" on public.user_keys for insert to authenticated
  with check (user_id = auth.uid());
create policy "atualizar a própria chave" on public.user_keys for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Cofres
create policy "membros veem o cofre" on public.vaults for select to authenticated
  using (owner_id = auth.uid() or public.is_vault_member(id));
create policy "criar cofre próprio" on public.vaults for insert to authenticated
  with check (owner_id = auth.uid());
create policy "dono altera o cofre" on public.vaults for update to authenticated
  using (public.vault_role(id) = 'owner') with check (owner_id = auth.uid());
create policy "dono exclui o cofre" on public.vaults for delete to authenticated
  using (owner_id = auth.uid());

-- Membros: o dono convida e gerencia; cada membro pode sair. Só o criador é 'owner'.
create policy "membros veem os membros" on public.vault_members for select to authenticated
  using (public.is_vault_member(vault_id));
create policy "dono adiciona membros" on public.vault_members for insert to authenticated
  with check (
    exists (select 1 from public.vaults v where v.id = vault_id and v.owner_id = auth.uid())
    and (role <> 'owner' or user_id = auth.uid())
  );
create policy "dono muda papéis e chaves" on public.vault_members for update to authenticated
  using (exists (select 1 from public.vaults v where v.id = vault_id and v.owner_id = auth.uid()))
  with check (role <> 'owner' or user_id = auth.uid());
create policy "dono remove; membro sai" on public.vault_members for delete to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from public.vaults v where v.id = vault_id and v.owner_id = auth.uid())
  );

-- Registros: membros leem; dono/editor gravam contas e aprendizado; pagador grava só pagamento.
-- Não há DELETE: exclusão é marca (deleted = true), para chegar aos outros aparelhos.
create policy "membros leem registros" on public.records for select to authenticated
  using (public.is_vault_member(vault_id));
create policy "gravar conforme o papel (novo)" on public.records for insert to authenticated
  with check (
    case kind
      when 'payment' then public.vault_role(vault_id) in ('owner', 'editor', 'payer')
      else public.vault_role(vault_id) in ('owner', 'editor')
    end
  );
create policy "gravar conforme o papel (alteração)" on public.records for update to authenticated
  using (
    case kind
      when 'payment' then public.vault_role(vault_id) in ('owner', 'editor', 'payer')
      else public.vault_role(vault_id) in ('owner', 'editor')
    end
  )
  with check (
    case kind
      when 'payment' then public.vault_role(vault_id) in ('owner', 'editor', 'payer')
      else public.vault_role(vault_id) in ('owner', 'editor')
    end
  );

-- Histórico: só leitura, para membros
create policy "membros leem o histórico" on public.audit_log for select to authenticated
  using (public.is_vault_member(vault_id));

-- Permissões de tabela (projetos novos podem vir sem os grants padrão). O RLS acima é quem decide.
grant select, insert, update on public.user_keys to authenticated;
grant select, insert, update, delete on public.vaults to authenticated;
grant select, insert, update, delete on public.vault_members to authenticated;
grant select, insert, update on public.records to authenticated;
grant select on public.audit_log to authenticated;
revoke all on public.user_keys, public.vaults, public.vault_members, public.records, public.audit_log from anon;

revoke all on function public.vault_role(uuid), public.is_vault_member(uuid), public.shares_vault_with(uuid) from public, anon;
grant execute on function public.vault_role(uuid), public.is_vault_member(uuid), public.shares_vault_with(uuid) to authenticated;

-- =====================================================================
-- Convite por QR code / link
--
-- O QR leva o id do convite e um segredo aleatório. Do segredo o app deriva:
--   - um token de autorização (o servidor guarda só o SHA-256 dele);
--   - uma chave que cifra a chave do cofre (o servidor nunca a vê).
-- Assim o servidor libera o convite sem conseguir abrir o cofre.
-- Vale uma vez, expira (24 h por padrão, máx. 7 dias) e o dono pode cancelar.
-- =====================================================================
create table public.invites (
  id                uuid primary key default gen_random_uuid(),
  vault_id          uuid not null references public.vaults (id) on delete cascade,
  role              text not null check (role in ('editor', 'payer', 'viewer')),
  token_hash        text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  wrapped_vault_key text not null,
  key_version       int  not null,
  created_by        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at        timestamptz not null default now(),
  expires_at        timestamptz not null default now() + interval '24 hours',
  used_by           uuid references auth.users (id) on delete set null,
  used_at           timestamptz,
  revoked_at        timestamptz,
  check (expires_at > created_at and expires_at <= created_at + interval '7 days')
);
create index invites_vault_idx on public.invites (vault_id);

alter table public.invites enable row level security;

-- Só o dono do cofre cria, vê e cancela convites (quem convida não lê a tabela: usa as funções abaixo)
create policy "dono vê convites" on public.invites for select to authenticated
  using (exists (select 1 from public.vaults v where v.id = vault_id and v.owner_id = auth.uid()));
create policy "dono cria convites" on public.invites for insert to authenticated
  with check (
    created_by = auth.uid()
    and used_by is null and used_at is null and revoked_at is null
    and exists (select 1 from public.vaults v where v.id = vault_id and v.owner_id = auth.uid())
  );
create policy "dono cancela convites" on public.invites for update to authenticated
  using (exists (select 1 from public.vaults v where v.id = vault_id and v.owner_id = auth.uid()))
  with check (used_by is null and used_at is null);

grant select, insert, update on public.invites to authenticated;
revoke all on public.invites from anon;

create function public.invites_audit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.audit_log (vault_id, actor_id, action, note) values (new.vault_id, auth.uid(), 'invite_create', new.role);
  elsif new.revoked_at is not null and old.revoked_at is null then
    insert into public.audit_log (vault_id, actor_id, action, note) values (new.vault_id, auth.uid(), 'invite_revoke', new.role);
  end if;
  return null;
end $$;

create trigger invites_audit after insert or update on public.invites
for each row execute function public.invites_audit();

-- Convite válido para este token (ou erro). Usado pelas duas funções abaixo.
create function public.valid_invite(p_invite uuid, p_token text)
returns public.invites language plpgsql stable security definer set search_path = '' as $$
declare
  inv public.invites;
begin
  if auth.uid() is null then raise exception 'CONVITE_INVALIDO' using errcode = '28000'; end if;
  select * into inv from public.invites i
  where i.id = p_invite
    and i.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  if not found then raise exception 'CONVITE_INVALIDO' using errcode = '28000'; end if;
  if inv.revoked_at is not null then raise exception 'CONVITE_CANCELADO' using errcode = '28000'; end if;
  if inv.used_at is not null then raise exception 'CONVITE_JA_USADO' using errcode = '28000'; end if;
  if inv.expires_at <= now() then raise exception 'CONVITE_EXPIRADO' using errcode = '28000'; end if;
  if inv.key_version <> (select v.key_version from public.vaults v where v.id = inv.vault_id) then
    raise exception 'CONVITE_EXPIRADO' using errcode = '28000'; -- a chave do cofre mudou depois do convite
  end if;
  if exists (select 1 from public.vault_members m where m.vault_id = inv.vault_id and m.user_id = auth.uid()) then
    raise exception 'JA_E_MEMBRO' using errcode = '28000';
  end if;
  return inv;
end $$;

-- 1º passo de quem escaneou: recebe a chave do cofre cifrada com a chave do QR
create function public.peek_invite(p_invite uuid, p_token text)
returns table (vault_id uuid, role text, wrapped_vault_key text, key_version int, expires_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare
  inv public.invites := public.valid_invite(p_invite, p_token);
begin
  return query select inv.vault_id, inv.role, inv.wrapped_vault_key, inv.key_version, inv.expires_at;
end $$;

-- 2º passo: entra no cofre, guardando a chave do cofre embrulhada para a própria chave pública
create function public.accept_invite(p_invite uuid, p_token text, p_wrapped_key text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  inv public.invites := public.valid_invite(p_invite, p_token);
begin
  -- Marca como usado só se ninguém usou no meio tempo (dois aparelhos escaneando juntos)
  update public.invites set used_by = auth.uid(), used_at = now()
  where id = inv.id and used_at is null;
  if not found then raise exception 'CONVITE_JA_USADO' using errcode = '28000'; end if;

  insert into public.vault_members (vault_id, user_id, role, wrapped_key, key_version, invited_by)
  values (inv.vault_id, auth.uid(), inv.role, p_wrapped_key, inv.key_version, inv.created_by);
  return inv.vault_id;
end $$;

revoke all on function public.valid_invite(uuid, text), public.peek_invite(uuid, text), public.accept_invite(uuid, text, text) from public, anon;
grant execute on function public.peek_invite(uuid, text), public.accept_invite(uuid, text, text) to authenticated;

-- =====================================================================
-- Fotos cifradas: bucket privado, caminho "<vault_id>/<registro>.bin"
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit)
values ('photos', 'photos', false, 2097152)
on conflict (id) do nothing;

create function public.photo_vault(p_name text)
returns uuid language plpgsql immutable set search_path = '' as $$
begin
  return split_part(p_name, '/', 1)::uuid;
exception when others then
  return null;
end $$;

create policy "membros leem fotos" on storage.objects for select to authenticated
  using (bucket_id = 'photos' and public.is_vault_member(public.photo_vault(name)));
create policy "editores enviam fotos" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and public.vault_role(public.photo_vault(name)) in ('owner', 'editor'));
create policy "editores trocam fotos" on storage.objects for update to authenticated
  using (bucket_id = 'photos' and public.vault_role(public.photo_vault(name)) in ('owner', 'editor'));
create policy "editores apagam fotos" on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and public.vault_role(public.photo_vault(name)) in ('owner', 'editor'));

-- =====================================================================
-- Mantém o projeto gratuito ativo (chamado pelo GitHub Actions)
-- =====================================================================
create function public.keepalive()
returns text language sql stable set search_path = '' as $$ select 'ok' $$;
grant execute on function public.keepalive() to anon, authenticated;
