-- =====================================================================
-- Excluir uma gaveta (cofre) pelo dono.
--
-- Ao apagar o cofre, os membros saem em cascata e o gatilho de histórico tentava
-- registrar cada saída num cofre que já não existe (erro de chave estrangeira).
-- Agora, se o cofre está sendo apagado, a saída não é registrada: o histórico
-- vai junto com o cofre.
-- =====================================================================

create or replace function public.members_audit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.audit_log (vault_id, actor_id, action, target_user, note)
    values (new.vault_id, auth.uid(), 'member_add', new.user_id, new.role);
  elsif tg_op = 'UPDATE' and new.role is distinct from old.role then
    insert into public.audit_log (vault_id, actor_id, action, target_user, note)
    values (new.vault_id, auth.uid(), 'member_role', new.user_id, old.role || ' -> ' || new.role);
  elsif tg_op = 'DELETE' then
    if not exists (select 1 from public.vaults v where v.id = old.vault_id) then
      return null; -- o cofre inteiro está sendo apagado
    end if;
    insert into public.audit_log (vault_id, actor_id, action, target_user, note)
    values (old.vault_id, auth.uid(), 'member_remove', old.user_id, old.role);
  end if;
  return null;
end $$;

-- Continua fora da API (como na migração de endurecimento)
revoke execute on function public.members_audit() from public, anon, authenticated;
