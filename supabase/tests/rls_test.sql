-- Testa as regras de acesso no banco real SEM deixar rastro: tudo roda num único bloco
-- que termina com um erro proposital ('TODOS_OS_TESTES_PASSARAM'), o que desfaz cada
-- alteração (usuários de teste, cofres, registros, histórico).
-- Qualquer falha termina com 'FALHOU: ...'.
--
-- Rodar: npx supabase db query --project-ref <ref> -f supabase/tests/rls_test.sql

do $test$
declare
  dono   uuid := '00000000-0000-4000-8000-00000000000a';
  editor uuid := '00000000-0000-4000-8000-00000000000b';
  pagad  uuid := '00000000-0000-4000-8000-00000000000c';
  visual uuid := '00000000-0000-4000-8000-00000000000d';
  intrus uuid := '00000000-0000-4000-8000-00000000000e';
  cofre  uuid := '00000000-0000-4000-8000-0000000000f1';
  n int;
  t text;
  key44 text := repeat('A', 43) || '=';
begin
  -- Auxiliares criados dentro do bloco: somem junto com o resto no final
  create function public.__rls_as_user(p_uid uuid) returns void language plpgsql as $f$
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    if current_user <> 'authenticated' or auth.uid() is distinct from p_uid then
      raise exception 'FALHOU: troca de usuário no teste não funcionou';
    end if;
  end $f$;
  create function public.__rls_check(ok boolean, what text) returns void language plpgsql as $f$
  begin
    if not coalesce(ok, false) then raise exception 'FALHOU: %', what; end if;
  end $f$;

  -- Usuários de teste (como postgres)
  insert into auth.users (id, email, aud, role)
  select u, 'teste-rls-' || right(u::text, 1) || '@example.invalid', 'authenticated', 'authenticated'
  from unnest(array[dono, editor, pagad, visual, intrus]) as u;

  -- Cada usuário cadastra a própria chave pública
  perform public.__rls_as_user(dono);   insert into public.user_keys values (dono, key44);
  perform public.__rls_as_user(editor); insert into public.user_keys values (editor, key44);
  perform public.__rls_as_user(pagad);  insert into public.user_keys values (pagad, key44);
  perform public.__rls_as_user(visual); insert into public.user_keys values (visual, key44);
  perform public.__rls_as_user(intrus); insert into public.user_keys values (intrus, key44);

  begin
    perform public.__rls_as_user(intrus);
    insert into public.user_keys values (dono, key44);
    raise exception 'FALHOU: cadastrou chave de outro usuário';
  exception when insufficient_privilege or unique_violation then null; end;

  -- Dono cria o cofre e os membros
  perform public.__rls_as_user(dono);
  insert into public.vaults (id) values (cofre);
  insert into public.vault_members (vault_id, user_id, role, wrapped_key, key_version) values
    (cofre, dono, 'owner', 'k', 1),
    (cofre, editor, 'editor', 'k', 1),
    (cofre, pagad, 'payer', 'k', 1),
    (cofre, visual, 'viewer', 'k', 1);
  select owner_id into strict t from public.vaults where id = cofre;
  perform public.__rls_check(t::uuid = dono, 'dono do cofre deveria ser quem criou');

  begin
    perform public.__rls_as_user(dono);
    insert into public.vault_members values (cofre, intrus, 'owner', 'k', 1);
    raise exception 'FALHOU: criou um segundo dono';
  exception when insufficient_privilege then null; end;

  begin
    perform public.__rls_as_user(editor);
    insert into public.vault_members values (cofre, intrus, 'viewer', 'k', 1);
    raise exception 'FALHOU: editor convidou membro';
  exception when insufficient_privilege then null; end;

  begin
    perform public.__rls_as_user(intrus);
    insert into public.vault_members values (cofre, intrus, 'editor', 'k', 1);
    raise exception 'FALHOU: intruso se adicionou ao cofre';
  exception when insufficient_privilege then null; end;

  -- Registros por papel
  perform public.__rls_as_user(dono);
  insert into public.records (vault_id, kind, id, ciphertext, key_version, audit_note)
  values (cofre, 'document', 'conta-1', 'cifrado-v1', 1, 'nota-criacao');

  perform public.__rls_as_user(editor);
  update public.records set ciphertext = 'cifrado-v2' where vault_id = cofre and kind = 'document' and id = 'conta-1';
  get diagnostics n = row_count;
  perform public.__rls_check(n = 1, 'editor deveria editar a conta');

  perform public.__rls_as_user(pagad);
  update public.records set ciphertext = 'pagador-mexeu' where vault_id = cofre and kind = 'document' and id = 'conta-1';
  get diagnostics n = row_count;
  perform public.__rls_check(n = 0, 'pagador não pode editar a conta');
  begin
    insert into public.records (vault_id, kind, id, ciphertext, key_version) values (cofre, 'document', 'conta-2', 'x', 1);
    raise exception 'FALHOU: pagador criou conta';
  exception when insufficient_privilege then null; end;

  perform public.__rls_as_user(pagad);
  insert into public.records (vault_id, kind, id, ciphertext, key_version, updated_by)
  values (cofre, 'payment', 'conta-1', 'pago-cifrado', 1, dono); -- tenta se passar pelo dono
  select updated_by::text into strict t from public.records where vault_id = cofre and kind = 'payment' and id = 'conta-1';
  perform public.__rls_check(t::uuid = pagad, 'autor do registro deveria ser forçado pelo servidor');

  perform public.__rls_as_user(visual);
  select count(*) into n from public.records where vault_id = cofre;
  perform public.__rls_check(n = 2, 'visualizador deveria ver os 2 registros');
  begin
    insert into public.records (vault_id, kind, id, ciphertext, key_version) values (cofre, 'payment', 'conta-9', 'x', 1);
    raise exception 'FALHOU: visualizador marcou pagamento';
  exception when insufficient_privilege then null; end;
  update public.records set ciphertext = 'visual-mexeu' where vault_id = cofre;
  get diagnostics n = row_count;
  perform public.__rls_check(n = 0, 'visualizador não pode alterar nada');

  -- Intruso não vê nada
  perform public.__rls_as_user(intrus);
  select count(*) into n from public.records where vault_id = cofre;
  perform public.__rls_check(n = 0, 'intruso viu registros');
  select count(*) into n from public.vaults where id = cofre;
  perform public.__rls_check(n = 0, 'intruso viu o cofre');
  select count(*) into n from public.vault_members where vault_id = cofre;
  perform public.__rls_check(n = 0, 'intruso viu os membros');
  select count(*) into n from public.audit_log where vault_id = cofre;
  perform public.__rls_check(n = 0, 'intruso viu o histórico');
  select count(*) into n from public.user_keys where user_id = dono;
  perform public.__rls_check(n = 0, 'intruso viu chave de quem não divide cofre com ele');

  -- Quem divide cofre vê a chave pública do outro
  perform public.__rls_as_user(editor);
  select count(*) into n from public.user_keys where user_id = dono;
  perform public.__rls_check(n = 1, 'editor deveria ver a chave do dono');

  -- Ninguém apaga registro de verdade; exclusão é marca e limpa o conteúdo
  perform public.__rls_as_user(dono);
  begin
    delete from public.records where vault_id = cofre;
    raise exception 'FALHOU: apagou registro de verdade';
  exception when insufficient_privilege then null; end;
  perform public.__rls_as_user(editor);
  update public.records set deleted = true where vault_id = cofre and kind = 'document' and id = 'conta-1';
  select coalesce(ciphertext, '<null>') into strict t from public.records where vault_id = cofre and kind = 'document' and id = 'conta-1';
  perform public.__rls_check(t = '<null>', 'exclusão deveria apagar o conteúdo cifrado');

  -- Histórico: gerado pelo banco, intocável
  perform public.__rls_as_user(visual);
  select string_agg(action || ':' || actor_id::text, ',' order by id) into t
  from public.audit_log where vault_id = cofre and record_kind is not null;
  perform public.__rls_check(
    t = format('create:%s,update:%s,create:%s,delete:%s', dono, editor, pagad, editor),
    'histórico de registros inesperado: ' || coalesce(t, '<vazio>'));
  select note into strict t from public.audit_log where vault_id = cofre and action = 'create' and record_kind = 'document';
  perform public.__rls_check(t = 'nota-criacao', 'nota cifrada deveria ir para o histórico');
  begin
    insert into public.audit_log (vault_id, action) values (cofre, 'forjado');
    raise exception 'FALHOU: escreveu no histórico';
  exception when insufficient_privilege then null; end;
  perform public.__rls_as_user(dono);
  begin
    delete from public.audit_log where vault_id = cofre;
    raise exception 'FALHOU: dono apagou o histórico';
  exception when insufficient_privilege then null; end;

  -- Fotos: editor envia; pagador não; intruso não vê
  perform public.__rls_as_user(editor);
  insert into storage.objects (bucket_id, name, owner) values ('photos', cofre || '/conta-1.bin', editor);
  begin
    perform public.__rls_as_user(pagad);
    insert into storage.objects (bucket_id, name, owner) values ('photos', cofre || '/conta-x.bin', pagad);
    raise exception 'FALHOU: pagador enviou foto';
  exception when insufficient_privilege then null; end;
  perform public.__rls_as_user(intrus);
  select count(*) into n from storage.objects where bucket_id = 'photos' and name like cofre || '/%';
  perform public.__rls_check(n = 0, 'intruso viu foto');
  perform public.__rls_as_user(visual);
  select count(*) into n from storage.objects where bucket_id = 'photos' and name like cofre || '/%';
  perform public.__rls_check(n = 1, 'visualizador deveria ver a foto');

  -- Membros: editor não muda papel; dono remove; membro sai; troca de chave registrada
  perform public.__rls_as_user(editor);
  update public.vault_members set role = 'owner' where vault_id = cofre and user_id = editor;
  get diagnostics n = row_count;
  perform public.__rls_check(n = 0, 'editor se promoveu');
  perform public.__rls_as_user(dono);
  delete from public.vault_members where vault_id = cofre and user_id = visual;
  update public.vaults set key_version = 2 where id = cofre;
  perform public.__rls_as_user(visual);
  select count(*) into n from public.records where vault_id = cofre;
  perform public.__rls_check(n = 0, 'membro removido continuou vendo registros');
  perform public.__rls_as_user(pagad);
  delete from public.vault_members where vault_id = cofre and user_id = pagad;
  get diagnostics n = row_count;
  perform public.__rls_check(n = 1, 'membro deveria conseguir sair');
  perform public.__rls_as_user(editor);
  select string_agg(action, ',' order by id) into t from public.audit_log where vault_id = cofre and record_kind is null;
  perform public.__rls_check(
    t = 'member_add,member_add,member_add,member_add,member_remove,key_rotate,member_remove',
    'histórico de membros inesperado: ' || coalesce(t, '<vazio>'));

  -- Só o dono exclui o cofre
  delete from public.vaults where id = cofre;
  get diagnostics n = row_count;
  perform public.__rls_check(n = 0, 'editor excluiu o cofre');

  -- Convites por QR code
  perform public.__rls_as_user(editor);
  begin
    insert into public.invites (vault_id, role, token_hash, wrapped_vault_key, key_version)
    values (cofre, 'viewer', encode(sha256('tok'::bytea), 'hex'), 'chave-cifrada', 2);
    raise exception 'FALHOU: editor criou convite';
  exception when insufficient_privilege then null; end;

  perform public.__rls_as_user(dono);
  insert into public.invites (id, vault_id, role, token_hash, wrapped_vault_key, key_version) values
    ('00000000-0000-4000-8000-0000000000c1', cofre, 'viewer', encode(sha256('token-certo'::bytea), 'hex'), 'chave-cifrada', 2),
    ('00000000-0000-4000-8000-0000000000c2', cofre, 'viewer', encode(sha256('token-2'::bytea), 'hex'), 'chave-cifrada', 2);
  insert into public.invites (id, vault_id, role, token_hash, wrapped_vault_key, key_version, created_at, expires_at)
  values ('00000000-0000-4000-8000-0000000000c3', cofre, 'payer', encode(sha256('token-3'::bytea), 'hex'), 'x', 2,
          now() - interval '2 days', now() - interval '1 day');
  update public.invites set revoked_at = now() where id = '00000000-0000-4000-8000-0000000000c2';

  perform public.__rls_as_user(intrus);
  select count(*) into n from public.invites;
  perform public.__rls_check(n = 0, 'quem não é dono leu a tabela de convites');
  begin
    perform * from public.peek_invite('00000000-0000-4000-8000-0000000000c1', 'token-errado');
    raise exception 'FALHOU: convite aceito com token errado';
  exception when invalid_authorization_specification then
    get stacked diagnostics t = message_text;
    perform public.__rls_check(t = 'CONVITE_INVALIDO', 'token errado: ' || t);
  end;
  begin
    perform * from public.peek_invite('00000000-0000-4000-8000-0000000000c2', 'token-2');
    raise exception 'FALHOU: convite cancelado funcionou';
  exception when invalid_authorization_specification then
    get stacked diagnostics t = message_text;
    perform public.__rls_check(t = 'CONVITE_CANCELADO', 'cancelado: ' || t);
  end;
  begin
    perform * from public.peek_invite('00000000-0000-4000-8000-0000000000c3', 'token-3');
    raise exception 'FALHOU: convite expirado funcionou';
  exception when invalid_authorization_specification then
    get stacked diagnostics t = message_text;
    perform public.__rls_check(t = 'CONVITE_EXPIRADO', 'expirado: ' || t);
  end;

  select p.role into strict t from public.peek_invite('00000000-0000-4000-8000-0000000000c1', 'token-certo') p;
  perform public.__rls_check(t = 'viewer', 'convite deveria trazer o papel');
  perform public.__rls_check(
    public.accept_invite('00000000-0000-4000-8000-0000000000c1', 'token-certo', 'chave-embrulhada-p-intruso') = cofre,
    'aceitar deveria devolver o cofre');
  select role into strict t from public.vault_members where vault_id = cofre and user_id = intrus;
  perform public.__rls_check(t = 'viewer', 'quem aceitou deveria entrar como visualizador');
  select count(*) into n from public.records where vault_id = cofre;
  perform public.__rls_check(n > 0, 'novo membro deveria ver os registros');

  perform public.__rls_as_user(visual); -- já foi removido; tenta reaproveitar o convite usado
  begin
    perform public.accept_invite('00000000-0000-4000-8000-0000000000c1', 'token-certo', 'k');
    raise exception 'FALHOU: convite usado duas vezes';
  exception when invalid_authorization_specification then
    get stacked diagnostics t = message_text;
    perform public.__rls_check(t = 'CONVITE_JA_USADO', 'reuso: ' || t);
  end;

  perform public.__rls_as_user(dono);
  select string_agg(action || ':' || coalesce(actor_id::text, '?'), ',' order by id) into t
  from public.audit_log where vault_id = cofre and action in ('invite_create', 'invite_revoke') or (vault_id = cofre and action = 'member_add' and target_user = intrus);
  perform public.__rls_check(
    t = format('invite_create:%s,invite_create:%s,invite_create:%s,invite_revoke:%s,member_add:%s', dono, dono, dono, dono, intrus),
    'histórico de convites inesperado: ' || coalesce(t, '<vazio>'));

  -- Visitante sem login: só o keepalive
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
  perform public.__rls_check(public.keepalive() = 'ok', 'keepalive deveria responder');
  begin
    perform count(*) from public.records;
    raise exception 'FALHOU: anônimo leu registros';
  exception when insufficient_privilege then null; end;
  begin
    perform * from public.peek_invite(gen_random_uuid(), 'x');
    raise exception 'FALHOU: anônimo consultou convite';
  exception when insufficient_privilege then null; end;

  raise exception 'TODOS_OS_TESTES_PASSARAM';
end
$test$;
