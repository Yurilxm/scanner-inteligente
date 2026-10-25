-- Testa a exclusão de uma gaveta pelo dono (migração 20261024190000) SEM deixar rastro.
-- Rodar: npx supabase db query --project-ref <ref> -f supabase/tests/delete_vault_test.sql

do $test$
declare
  dono  uuid := '00000000-0000-4000-8000-00000000003a';
  maria uuid := '00000000-0000-4000-8000-00000000003b';
  cofre uuid := '00000000-0000-4000-8000-0000000003f1';
  n int;
begin
  create function public.__dv_as_user(p_uid uuid) returns void language plpgsql as $f$
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
  end $f$;
  create function public.__dv_check(ok boolean, what text) returns void language plpgsql as $f$
  begin
    if not coalesce(ok, false) then raise exception 'FALHOU: %', what; end if;
  end $f$;

  insert into auth.users (id, email, aud, role) values
    (dono, 'teste-dv-dono@example.invalid', 'authenticated', 'authenticated'),
    (maria, 'teste-dv-maria@example.invalid', 'authenticated', 'authenticated');

  perform public.__dv_as_user(dono);
  insert into public.vaults (id) values (cofre);
  insert into public.vault_members (vault_id, user_id, role, wrapped_key, key_version) values
    (cofre, dono, 'owner', 'k', 1), (cofre, maria, 'payer', 'k', 1);
  insert into public.records (vault_id, kind, id, ciphertext, key_version) values (cofre, 'document', 'd1', 'x', 1);

  -- Quem não é dono não apaga
  perform public.__dv_as_user(maria);
  delete from public.vaults where id = cofre;
  get diagnostics n = row_count;
  perform public.__dv_check(n = 0, 'membro apagou o cofre');

  -- Maria sair continua registrado no histórico
  delete from public.vault_members where vault_id = cofre and user_id = maria;
  perform public.__dv_as_user(dono);
  select count(*) into n from public.audit_log where vault_id = cofre and action = 'member_remove';
  perform public.__dv_check(n = 1, 'saída da Maria não registrada');

  -- Dono apaga: vai tudo junto, sem erro do histórico
  delete from public.vaults where id = cofre;
  get diagnostics n = row_count;
  perform public.__dv_check(n = 1, 'dono não conseguiu apagar o cofre');
  select (select count(*) from public.vault_members where vault_id = cofre)
       + (select count(*) from public.records where vault_id = cofre)
       + (select count(*) from public.audit_log where vault_id = cofre) into n;
  perform public.__dv_check(n = 0, 'sobrou coisa do cofre apagado');

  raise exception 'TODOS_OS_TESTES_PASSARAM';
end
$test$;
