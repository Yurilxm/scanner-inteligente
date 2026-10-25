-- Apontamentos do verificador de segurança/desempenho do Supabase (db advisors).

-- 1) Funções de gatilho e a auxiliar valid_invite não precisam ser chamáveis pela API.
--    (O Supabase concede EXECUTE diretamente a anon/authenticated, não só via PUBLIC.)
--    Gatilhos continuam disparando: a permissão é conferida ao criar o gatilho, não ao disparar.
revoke execute on function
  public.records_stamp(), public.records_audit(), public.members_audit(),
  public.vaults_audit(), public.invites_audit(),
  public.valid_invite(uuid, text)
from public, anon, authenticated;

-- vault_role / is_vault_member / shares_vault_with continuam executáveis por authenticated:
-- as regras de acesso as chamam em nome do usuário, e elas só revelam o papel dele mesmo.

-- 2) Regras com (select auth.uid()): calculado uma vez por consulta, não a cada linha
drop policy "ver chaves de quem divide cofre" on public.user_keys;
drop policy "cadastrar a própria chave" on public.user_keys;
drop policy "atualizar a própria chave" on public.user_keys;
create policy "ver chaves de quem divide cofre" on public.user_keys for select to authenticated
  using (user_id = (select auth.uid()) or public.shares_vault_with(user_id));
create policy "cadastrar a própria chave" on public.user_keys for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "atualizar a própria chave" on public.user_keys for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy "membros veem o cofre" on public.vaults;
drop policy "criar cofre próprio" on public.vaults;
drop policy "dono altera o cofre" on public.vaults;
drop policy "dono exclui o cofre" on public.vaults;
create policy "membros veem o cofre" on public.vaults for select to authenticated
  using (owner_id = (select auth.uid()) or public.is_vault_member(id));
create policy "criar cofre próprio" on public.vaults for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy "dono altera o cofre" on public.vaults for update to authenticated
  using (public.vault_role(id) = 'owner') with check (owner_id = (select auth.uid()));
create policy "dono exclui o cofre" on public.vaults for delete to authenticated
  using (owner_id = (select auth.uid()));

drop policy "dono adiciona membros" on public.vault_members;
drop policy "dono muda papéis e chaves" on public.vault_members;
drop policy "dono remove; membro sai" on public.vault_members;
create policy "dono adiciona membros" on public.vault_members for insert to authenticated
  with check (
    exists (select 1 from public.vaults v where v.id = vault_id and v.owner_id = (select auth.uid()))
    and (role <> 'owner' or user_id = (select auth.uid()))
  );
create policy "dono muda papéis e chaves" on public.vault_members for update to authenticated
  using (exists (select 1 from public.vaults v where v.id = vault_id and v.owner_id = (select auth.uid())))
  with check (role <> 'owner' or user_id = (select auth.uid()));
create policy "dono remove; membro sai" on public.vault_members for delete to authenticated
  using (
    user_id = (select auth.uid())
    or exists (select 1 from public.vaults v where v.id = vault_id and v.owner_id = (select auth.uid()))
  );

drop policy "dono vê convites" on public.invites;
drop policy "dono cria convites" on public.invites;
drop policy "dono cancela convites" on public.invites;
create policy "dono vê convites" on public.invites for select to authenticated
  using (exists (select 1 from public.vaults v where v.id = vault_id and v.owner_id = (select auth.uid())));
create policy "dono cria convites" on public.invites for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and used_by is null and used_at is null and revoked_at is null
    and exists (select 1 from public.vaults v where v.id = vault_id and v.owner_id = (select auth.uid()))
  );
create policy "dono cancela convites" on public.invites for update to authenticated
  using (exists (select 1 from public.vaults v where v.id = vault_id and v.owner_id = (select auth.uid())))
  with check (used_by is null and used_at is null);

-- 3) Índices nas chaves estrangeiras (regras e exclusão de usuário)
create index vaults_owner_idx on public.vaults (owner_id);
create index audit_log_actor_idx on public.audit_log (actor_id);
create index invites_created_by_idx on public.invites (created_by);
create index invites_used_by_idx on public.invites (used_by);
create index records_updated_by_idx on public.records (updated_by);
create index vault_members_invited_by_idx on public.vault_members (invited_by);
