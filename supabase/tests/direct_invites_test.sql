-- Testa o convite direto pelo e-mail (migração 20261024160000) SEM deixar rastro: o bloco termina
-- com 'TODOS_OS_TESTES_PASSARAM', que desfaz tudo. Falhas terminam com 'FALHOU: ...'.
--
-- Rodar: npx supabase db query --project-ref <ref> -f supabase/tests/direct_invites_test.sql

do $test$
declare
  dono   uuid := '00000000-0000-4000-8000-00000000002a';
  maria  uuid := '00000000-0000-4000-8000-00000000002b';
  joao   uuid := '00000000-0000-4000-8000-00000000002c';
  semapp uuid := '00000000-0000-4000-8000-00000000002d';
  cofre  uuid := '00000000-0000-4000-8000-0000000002f1';
  key44  text := repeat('A', 43) || '=';
  wrap   text := repeat('W', 60);
  conv   uuid;
  n int;
  t text;
  r record;
begin
  create function public.__di_as_user(p_uid uuid) returns void language plpgsql as $f$
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    if current_user <> 'authenticated' or auth.uid() is distinct from p_uid then
      raise exception 'FALHOU: troca de usuário no teste não funcionou';
    end if;
  end $f$;
  create function public.__di_check(ok boolean, what text) returns void language plpgsql as $f$
  begin
    if not coalesce(ok, false) then raise exception 'FALHOU: %', what; end if;
  end $f$;

  insert into auth.users (id, email, aud, role, raw_user_meta_data) values
    (dono,   'teste-di-dono@example.invalid',  'authenticated', 'authenticated', '{"full_name":"Dona DI"}'),
    (maria,  'Teste-DI-Maria@example.invalid', 'authenticated', 'authenticated', '{"full_name":"Maria DI"}'),
    (joao,   'teste-di-joao@example.invalid',  'authenticated', 'authenticated', '{}'),
    (semapp, 'teste-di-semapp@example.invalid','authenticated', 'authenticated', '{}');
  perform public.__di_as_user(dono);  insert into public.user_keys values (dono, key44);
  perform public.__di_as_user(maria); insert into public.user_keys values (maria, key44);
  perform public.__di_as_user(joao);  insert into public.user_keys values (joao, key44);

  perform public.__di_as_user(dono);
  insert into public.vaults (id, encrypted_meta) values (cofre, 'meta-casa');
  insert into public.vault_members (vault_id, user_id, role, wrapped_key, key_version) values (cofre, dono, 'owner', 'k', 1);

  -- Achar pela conta Google (sem diferenciar maiúsculas); quem não tem chave no Control não aparece
  select * into strict r from public.find_user_by_email('  teste-di-maria@EXAMPLE.invalid ');
  perform public.__di_check(r.user_id = maria and r.public_key = key44 and r.name = 'Maria DI', 'busca por e-mail');
  select count(*) into n from public.find_user_by_email('teste-di-semapp@example.invalid');
  perform public.__di_check(n = 0, 'achou quem não tem chave no Control');

  -- Só o dono convida, e só com a versão atual da chave
  perform public.__di_as_user(joao);
  begin
    perform public.create_direct_invite(cofre, maria, 'payer', wrap, 1);
    raise exception 'FALHOU: quem não é dono convidou';
  exception when insufficient_privilege then null; end;
  perform public.__di_as_user(dono);
  begin
    perform public.create_direct_invite(cofre, maria, 'payer', wrap, 2);
    raise exception 'FALHOU: convite com versão de chave errada';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.create_direct_invite(cofre, dono, 'payer', wrap, 1);
    raise exception 'FALHOU: dono convidou a si mesmo';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.create_direct_invite(cofre, maria, 'owner', wrap, 1);
    raise exception 'FALHOU: convidou como dono';
  exception when check_violation then null; end;

  perform public.create_direct_invite(cofre, maria, 'viewer', wrap, 1);
  perform public.create_direct_invite(cofre, maria, 'payer', wrap, 1); -- substitui o anterior
  perform public.create_direct_invite(cofre, joao, 'editor', wrap, 1);
  select string_agg(name || ':' || role, ',' order by name) into t from public.vault_direct_invites(cofre);
  perform public.__di_check(t = 'Maria DI:payer,teste-di-joao:editor', 'pendentes do dono: ' || coalesce(t, '<vazio>'));

  -- Ninguém lê a tabela direto
  begin
    perform count(*) from public.direct_invites;
    raise exception 'FALHOU: tabela de convites diretos aberta';
  exception when insufficient_privilege then null; end;

  -- Sininho da Maria: um convite, com o nome cifrado da gaveta e quem convidou
  perform public.__di_as_user(maria);
  select count(*) into n from public.my_direct_invites();
  perform public.__di_check(n = 1, 'sininho deveria ter 1 convite, tem ' || n);
  select * into strict r from public.my_direct_invites();
  perform public.__di_check(r.encrypted_meta = 'meta-casa' and r.inviter_name = 'Dona DI' and r.role = 'payer', 'dados do convite');
  conv := r.id;
  begin
    perform * from public.vault_direct_invites(cofre);
    raise exception 'FALHOU: convidada viu os pendentes do dono';
  exception when insufficient_privilege then null; end;

  -- João não aceita o convite da Maria
  perform public.__di_as_user(joao);
  begin
    perform public.answer_direct_invite(conv, true);
    raise exception 'FALHOU: aceitou convite de outra pessoa';
  exception when invalid_authorization_specification then null; end;

  -- Maria aceita: vira pagadora com o embrulho preparado pelo dono
  perform public.__di_as_user(maria);
  perform public.__di_check(public.answer_direct_invite(conv, true) = cofre, 'aceitar devolve a gaveta');
  select role || ':' || wrapped_key into strict t from public.vault_members where vault_id = cofre and user_id = maria;
  perform public.__di_check(t = 'payer:' || wrap, 'membro criado errado: ' || t);
  select count(*) into n from public.my_direct_invites();
  perform public.__di_check(n = 0, 'sininho não esvaziou');
  begin
    perform public.answer_direct_invite(conv, true);
    raise exception 'FALHOU: aceitou duas vezes';
  exception when invalid_authorization_specification then null; end;

  -- João recusa
  perform public.__di_as_user(joao);
  select id into strict conv from public.my_direct_invites();
  perform public.answer_direct_invite(conv, false);
  select count(*) into n from public.vault_members where vault_id = cofre and user_id = joao;
  perform public.__di_check(n = 0, 'recusar não deveria entrar');

  -- Convite cancelado pelo dono some do sininho
  perform public.__di_as_user(dono);
  perform public.create_direct_invite(cofre, joao, 'viewer', wrap, 1);
  select id into strict conv from public.vault_direct_invites(cofre);
  perform public.revoke_direct_invite(conv);
  perform public.__di_as_user(joao);
  select count(*) into n from public.my_direct_invites();
  perform public.__di_check(n = 0, 'convite cancelado ainda no sininho');
  begin
    perform public.answer_direct_invite(conv, true);
    raise exception 'FALHOU: aceitou convite cancelado';
  exception when invalid_authorization_specification then
    get stacked diagnostics t = message_text;
    perform public.__di_check(t = 'CONVITE_CANCELADO', 'cancelado: ' || t);
  end;

  -- Trocar a chave cancela convites diretos em aberto
  perform public.__di_as_user(dono);
  perform public.create_direct_invite(cofre, joao, 'viewer', wrap, 1);
  insert into public.vault_members (vault_id, user_id, role, wrapped_key, key_version) values (cofre, semapp, 'viewer', 'k', 1);
  perform public.remove_member_rotate(cofre, semapp, 2, 'chaveiro', 'meta-v2',
    jsonb_build_array(jsonb_build_object('user_id', dono, 'wrapped_key', 'k2'), jsonb_build_object('user_id', maria, 'wrapped_key', 'k2')));
  select count(*) into n from public.vault_direct_invites(cofre);
  perform public.__di_check(n = 0, 'troca de chave não cancelou o convite direto');

  -- Histórico registra convite, recusa e cancelamento
  select string_agg(distinct action, ',' order by action) into t from public.audit_log
  where vault_id = cofre and action like 'invite_%';
  perform public.__di_check(t = 'invite_create,invite_decline,invite_revoke', 'histórico: ' || coalesce(t, '<vazio>'));

  -- Visitante sem login não usa nada
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
  begin
    perform * from public.my_direct_invites();
    raise exception 'FALHOU: anônimo leu convites';
  exception when insufficient_privilege then null; end;
  begin
    perform * from public.find_user_by_email('x@y');
    raise exception 'FALHOU: anônimo procurou e-mail';
  exception when insufficient_privilege then null; end;

  raise exception 'TODOS_OS_TESTES_PASSARAM';
end
$test$;
