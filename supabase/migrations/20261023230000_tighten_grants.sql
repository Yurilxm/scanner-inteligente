-- Defesa em camadas: o Supabase concede ALL (inclusive DELETE e TRUNCATE) aos usuários logados
-- em toda tabela nova; as regras (RLS) já barravam, mas aqui o próprio privilégio deixa de existir.
-- Fica só o que cada tabela realmente precisa.
revoke all on public.user_keys, public.vaults, public.vault_members, public.records,
              public.audit_log, public.invites from authenticated, anon;

grant select, insert, update         on public.user_keys     to authenticated;
grant select, insert, update, delete on public.vaults        to authenticated;
grant select, insert, update, delete on public.vault_members to authenticated;
grant select, insert, update         on public.records       to authenticated; -- exclusão é marca, nunca DELETE
grant select                         on public.audit_log     to authenticated; -- escrito só pelos gatilhos
grant select, insert, update         on public.invites       to authenticated;
