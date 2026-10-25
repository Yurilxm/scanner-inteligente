-- Testa a gaveta da família (migração 20261024120000) SEM deixar rastro: o bloco termina com
-- um erro proposital ('TODOS_OS_TESTES_PASSARAM') que desfaz tudo. Falhas terminam com 'FALHOU: ...'.
--
-- Rodar: npx supabase db query --project-ref <ref> -f supabase/tests/sharing_test.sql

do $test$
declare
  dono   uuid := '00000000-0000-4000-8000-00000000001a';
  pagad  uuid := '00000000-0000-4000-8000-00000000001b';
  visual uuid := '00000000-0000-4000-8000-00000000001c';
  intrus uuid := '00000000-0000-4000-8000-00000000001d';
  cofre  uuid := '00000000-0000-4000-8000-0000000001f1';
  convite uuid := '00000000-0000-4000-8000-0000000001c1';
  pendente uuid := '00000000-0000-4000-8000-0000000001c2';
  n int;
  t text;
  key44 text := repeat('A', 43) || '=';
  r record;
begin
  create function public.__sh_as_user(p_uid uuid) returns void language plpgsql as $f$
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    if current_user <> 'authenticated' or auth.uid() is distinct from p_uid then
      raise exception 'FALHOU: troca de usuário no teste não funcionou';
    end if;
  end $f$;
  create function public.__sh_check(ok boolean, what text) returns void language plpgsql as $f$
  begin
    if not coalesce(ok, false) then raise exception 'FALHOU: %', what; end if;
  end $f$;

  insert into auth.users (id, email, aud, role, raw_user_meta_data) values
    (dono,   'teste-dono@example.invalid',   'authenticated', 'authenticated', '{"full_name":"Dona Teste"}'),
    (pagad,  'teste-pagad@example.invalid',  'authenticated', 'authenticated', '{"full_name":"Pagador Teste"}'),
    (visual, 'teste-visual@example.invalid', 'authenticated', 'authenticated', '{}'),
    (intrus, 'teste-intrus@example.invalid', 'authenticated', 'authenticated', '{}');

  perform public.__sh_as_user(dono);   insert into public.user_keys values (dono, key44);
  perform public.__sh_as_user(pagad);  insert into public.user_keys values (pagad, key44);
  perform public.__sh_as_user(visual); insert into public.user_keys values (visual, key44);
  perform public.__sh_as_user(intrus); insert into public.user_keys values (intrus, key44);

  perform public.__sh_as_user(dono);
  insert into public.vaults (id, encrypted_meta) values (cofre, 'meta-v1');
  insert into public.vault_members (vault_id, user_id, role, wrapped_key, key_version) values
    (cofre, dono, 'owner', 'k-dono-1', 1),
    (cofre, pagad, 'payer', 'k-pagad-1', 1);
  insert into public.records (vault_id, kind, id, ciphertext, key_version) values (cofre, 'document', 'doc1', 'cifrado', 1);

  -- Convite por QR: a prévia traz o nome cifrado da gaveta e quem convidou
  insert into public.invites (id, vault_id, role, token_hash, wrapped_vault_key, key_version) values
    (convite, cofre, 'viewer', encode(sha256('tok-1'::bytea), 'hex'), 'chave-convite', 1),
    (pendente, cofre, 'payer', encode(sha256('tok-2'::bytea), 'hex'), 'chave-convite', 1);

  perform public.__sh_as_user(visual);
  select * into strict r from public.peek_invite(convite, 'tok-1');
  perform public.__sh_check(r.encrypted_meta = 'meta-v1', 'prévia sem o nome cifrado da gaveta');
  perform public.__sh_check(r.inviter_name = 'Dona Teste', 'prévia com quem convidou errado: ' || coalesce(r.inviter_name, '<nulo>'));
  perform public.__sh_check(r.role = 'viewer' and r.key_version = 1, 'prévia com papel/versão errados');
  perform public.accept_invite(convite, 'tok-1', 'k-visual-1');

  -- Lista de membros: nomes para quem é do cofre, nada para quem não é
  select string_agg(m.name || ':' || m.role, ',' order by m.joined_at) into t from public.vault_member_list(cofre) m;
  perform public.__sh_check(t = 'Dona Teste:owner,Pagador Teste:payer,teste-visual:viewer', 'membros inesperados: ' || coalesce(t, '<vazio>'));

  perform public.__sh_as_user(intrus);
  begin
    perform * from public.vault_member_list(cofre);
    raise exception 'FALHOU: quem não é membro viu a lista de membros';
  exception when insufficient_privilege then null; end;
  begin
    perform * from public.vault_history(cofre);
    raise exception 'FALHOU: quem não é membro viu o histórico';
  exception when insufficient_privilege then null; end;

  -- Histórico com nomes
  perform public.__sh_as_user(pagad);
  select count(*) into n from public.vault_history(cofre) h
  where h.action = 'member_add' and h.target_name = 'teste-visual' and h.actor_name = 'teste-visual';
  perform public.__sh_check(n = 1, 'histórico sem a entrada do novo membro');
  select count(*) into n from public.vault_history(cofre, null, 1);
  perform public.__sh_check(n = 1, 'limite do histórico não respeitado');

  -- Remover + trocar a chave: só o dono, versão certa, chave nova para todos que ficam
  begin
    perform public.remove_member_rotate(cofre, visual, 2, 'chaveiro', 'meta-v2',
      jsonb_build_array(jsonb_build_object('user_id', dono, 'wrapped_key', 'k-dono-2'),
                        jsonb_build_object('user_id', pagad, 'wrapped_key', 'k-pagad-2')));
    raise exception 'FALHOU: pagador removeu membro';
  exception when insufficient_privilege then null; end;

  perform public.__sh_as_user(dono);
  begin
    perform public.remove_member_rotate(cofre, visual, 3, 'chaveiro', 'meta-v2',
      jsonb_build_array(jsonb_build_object('user_id', dono, 'wrapped_key', 'k-dono-2'),
                        jsonb_build_object('user_id', pagad, 'wrapped_key', 'k-pagad-2')));
    raise exception 'FALHOU: aceitou versão de chave pulando número';
  exception when invalid_parameter_value then
    get stacked diagnostics t = message_text;
    perform public.__sh_check(t = 'VERSAO_DA_CHAVE', 'versão: ' || t);
  end;
  begin
    perform public.remove_member_rotate(cofre, visual, 2, 'chaveiro', 'meta-v2',
      jsonb_build_array(jsonb_build_object('user_id', dono, 'wrapped_key', 'k-dono-2')));
    raise exception 'FALHOU: trocou a chave esquecendo um membro';
  exception when serialization_failure then
    get stacked diagnostics t = message_text;
    perform public.__sh_check(t = 'MEMBROS_MUDARAM', 'faltando membro: ' || t);
  end;
  begin
    perform public.remove_member_rotate(cofre, visual, 2, 'chaveiro', 'meta-v2',
      jsonb_build_array(jsonb_build_object('user_id', dono, 'wrapped_key', 'k-dono-2'),
                        jsonb_build_object('user_id', pagad, 'wrapped_key', 'k-pagad-2'),
                        jsonb_build_object('user_id', visual, 'wrapped_key', 'k-visual-2')));
    raise exception 'FALHOU: mandou a chave nova para quem saiu';
  exception when serialization_failure then null; end;
  begin
    perform public.remove_member_rotate(cofre, dono, 2, 'chaveiro', 'meta-v2', '[]'::jsonb);
    raise exception 'FALHOU: dono removeu a si mesmo';
  exception when invalid_parameter_value then null; end;

  -- A tentativa que falhou não pode ter removido ninguém
  select count(*) into n from public.vault_members where vault_id = cofre;
  perform public.__sh_check(n = 3, 'falha deixou o cofre pela metade');

  perform public.remove_member_rotate(cofre, visual, 2, 'chaveiro', 'meta-v2',
    jsonb_build_array(jsonb_build_object('user_id', dono, 'wrapped_key', 'k-dono-2'),
                      jsonb_build_object('user_id', pagad, 'wrapped_key', 'k-pagad-2')));

  select key_version || ':' || keyring || ':' || encrypted_meta into strict t from public.vaults where id = cofre;
  perform public.__sh_check(t = '2:chaveiro:meta-v2', 'cofre não trocou de chave: ' || t);
  select string_agg(user_id::text || '=' || wrapped_key || '@' || key_version, ',' order by role) into t
  from public.vault_members where vault_id = cofre;
  perform public.__sh_check(t = format('%s=k-dono-2@2,%s=k-pagad-2@2', dono, pagad), 'chaves dos membros: ' || coalesce(t, '<vazio>'));
  select count(*) into n from public.invites where id = pendente and revoked_at is not null;
  perform public.__sh_check(n = 1, 'convite pendente não foi cancelado');
  select string_agg(action, ',' order by id) into t from public.audit_log
  where vault_id = cofre and action in ('member_remove', 'key_rotate', 'invite_revoke');
  perform public.__sh_check(t like '%member_remove%' and t like '%key_rotate%' and t like '%invite_revoke%',
    'histórico da remoção incompleto: ' || coalesce(t, '<vazio>'));

  -- Quem saiu perde o acesso
  perform public.__sh_as_user(visual);
  select count(*) into n from public.records where vault_id = cofre;
  perform public.__sh_check(n = 0, 'removido ainda lê registros');
  select count(*) into n from public.vaults where id = cofre;
  perform public.__sh_check(n = 0, 'removido ainda vê o cofre (e o chaveiro)');
  begin
    perform * from public.vault_member_list(cofre);
    raise exception 'FALHOU: removido viu os membros';
  exception when insufficient_privilege then null; end;

  -- Funções internas fora da API; visitante sem login não usa nada
  perform public.__sh_as_user(dono);
  begin
    perform public.member_label(dono);
    raise exception 'FALHOU: member_label exposto na API';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
  begin
    perform * from public.vault_member_list(cofre);
    raise exception 'FALHOU: anônimo viu membros';
  exception when insufficient_privilege then null; end;

  raise exception 'TODOS_OS_TESTES_PASSARAM';
end
$test$;
