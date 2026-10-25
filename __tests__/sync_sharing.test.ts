import {
  contexts, createRecoveryPhrase, encodeBase64, identityFromPhrase, inviteTokenHash, newVaultKey,
  openKeyring, openJson, seal, sealJson, setRandomSource, unwrapKey, wrapKey,
} from '../src/sync/crypto';
import type { HistoryRow, MemberRow, SharingRemote } from '../src/sync/remote';
import { sharedWithText } from '../src/sync/roles';
import {
  NotAnInvite, NotOnControl, acceptInvite, activityToNotify, answerInvite, createInvite, describeHistory, inviteByEmail, listMyInvites,
  previewInvite, removeMember, reviewQueue,
} from '../src/sync/sharingCore';
import { PhotoIO, SyncRemote, runSync } from '../src/sync/runSync';
import { EMPTY_CURSOR, RemoteRecord } from '../src/sync/model';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const nodeCrypto = require('crypto');
beforeAll(() => setRandomSource(n => new Uint8Array(nodeCrypto.randomBytes(n))));

const VAULT = '22222222-2222-4222-8222-222222222222';
const INVITE = '33333333-3333-4333-8333-333333333333';

function person(userId: string, name: string) {
  return { userId, name, identity: identityFromPhrase(createRecoveryPhrase()) };
}

// Servidor falso com as mesmas regras do Supabase para convites e troca de chave
function fakeServer(owner: ReturnType<typeof person>, vaultKey: Uint8Array) {
  const vault = { keyVersion: 1, keyring: null as string | null, encryptedMeta: sealJson(vaultKey, { name: 'Casa', color: '#fff' }, contexts.vaultMeta(VAULT)) };
  const members = new Map<string, { role: MemberRow['role']; wrappedKey: string; keyVersion: number; name: string }>();
  members.set(owner.userId, { role: 'owner', wrappedKey: wrapKey(owner.identity.publicKey, vaultKey, contexts.vaultKey(VAULT, owner.userId, 1)), keyVersion: 1, name: owner.name });
  const keys = new Map<string, string>([[owner.userId, encodeBase64(owner.identity.publicKey)]]);
  const invites = new Map<string, { role: 'editor' | 'payer' | 'viewer'; tokenHash: string; wrapped: string; keyVersion: number; used: boolean }>();
  let me = owner.userId;
  const direct: {
    id: string; vaultId: string; inviteeId: string; role: 'editor' | 'payer' | 'viewer'; wrappedKey: string;
    keyVersion: number; answer: string | null;
  }[] = [];
  const names = new Map<string, string>([[owner.userId, owner.name]]);

  const remote: SharingRemote = {
    async getMember(_v, userId) {
      const m = members.get(userId);
      return m ? { wrappedKey: m.wrappedKey, keyVersion: m.keyVersion, role: m.role } : null;
    },
    async getVault() { return { ...vault }; },
    async setVaultMeta(_v, meta) { vault.encryptedMeta = meta; },
    async deleteVault() {},
    async listMembers() {
      if (!members.has(me)) throw new Error('SEM_ACESSO');
      return [...members.entries()].map(([userId, m]) => ({ userId, role: m.role, name: m.name, email: `${m.name}@x`, joinedAt: '' }));
    },
    async publicKeys(ids) { return Object.fromEntries(ids.filter(id => keys.has(id)).map(id => [id, keys.get(id)!])); },
    async setRole() { throw new Error('não usado'); },
    async leave() { throw new Error('não usado'); },
    async removeMemberRotate(input) {
      if (me !== owner.userId) throw new Error('SEM_ACESSO');
      if (input.keyVersion !== vault.keyVersion + 1) throw new Error('VERSAO_DA_CHAVE');
      const staying = [...members.keys()].filter(id => id !== input.userId);
      const wrapped = new Set(input.wraps.map(w => w.user_id));
      if (staying.length !== wrapped.size || staying.some(id => !wrapped.has(id))) throw new Error('MEMBROS_MUDARAM');
      members.delete(input.userId);
      for (const w of input.wraps) members.set(w.user_id, { ...members.get(w.user_id)!, wrappedKey: w.wrapped_key, keyVersion: input.keyVersion });
      Object.assign(vault, { keyVersion: input.keyVersion, keyring: input.keyring, encryptedMeta: input.encryptedMeta });
    },
    async createInvite(input) {
      invites.set(input.id, { role: input.role, tokenHash: input.tokenHash, wrapped: input.wrappedVaultKey, keyVersion: input.keyVersion, used: false });
      return '2026-10-25T12:00:00Z';
    },
    async listInvites() { return []; },
    async revokeInvite() {},
    async peekInvite(id, token) {
      const inv = invites.get(id);
      if (!inv || inv.tokenHash !== inviteTokenHash(token)) throw new Error('CONVITE_INVALIDO');
      return { vaultId: VAULT, role: inv.role, wrappedVaultKey: inv.wrapped, keyVersion: inv.keyVersion, expiresAt: '', encryptedMeta: vault.encryptedMeta, inviterName: owner.name };
    },
    async acceptInvite(id, token, wrappedKey) {
      const inv = invites.get(id)!;
      if (inv.used || inv.tokenHash !== inviteTokenHash(token)) throw new Error('CONVITE_JA_USADO');
      inv.used = true;
      members.set(me, { role: inv.role, wrappedKey, keyVersion: inv.keyVersion, name: names.get(me) ?? me });
      return VAULT;
    },
    async history() { return []; },
    // Convite direto: o servidor só acha pelo e-mail quem já cadastrou a chave pública
    async findUserByEmail(email) {
      const id = [...names.entries()].find(([, n]) => `${n.toLowerCase()}@x` === email.toLowerCase())?.[0];
      return id && keys.has(id) ? { userId: id, publicKey: keys.get(id)!, name: names.get(id)! } : null;
    },
    async createDirectInvite(input) {
      if (me !== owner.userId) throw new Error('SEM_ACESSO');
      if (input.keyVersion !== vault.keyVersion) throw new Error('VERSAO_DA_CHAVE');
      direct.push({ id: `d${direct.length}`, ...input, answer: null });
      return '2026-10-31T12:00:00Z';
    },
    async myDirectInvites() {
      return direct.filter(d => d.inviteeId === me && !d.answer).map(d => ({
        id: d.id, vaultId: VAULT, role: d.role, wrappedKey: d.wrappedKey, keyVersion: d.keyVersion,
        expiresAt: '', encryptedMeta: vault.encryptedMeta, inviterName: owner.name,
      }));
    },
    async answerDirectInvite(id, accept) {
      const d = direct.find(x => x.id === id && x.inviteeId === me && !x.answer);
      if (!d) throw new Error('CONVITE_INVALIDO');
      d.answer = accept ? 'accepted' : 'declined';
      if (accept) members.set(me, { role: d.role, wrappedKey: d.wrappedKey, keyVersion: d.keyVersion, name: names.get(me) ?? me });
      return VAULT;
    },
    async sentDirectInvites() { return []; },
    async revokeDirectInvite() {},
  };

  return {
    remote,
    vault,
    members,
    invites,
    direct,
    register(p: ReturnType<typeof person>) {
      keys.set(p.userId, encodeBase64(p.identity.publicKey));
      names.set(p.userId, p.name);
    },
    actAs(p: ReturnType<typeof person>) {
      me = p.userId;
      keys.set(p.userId, encodeBase64(p.identity.publicKey));
      names.set(p.userId, p.name);
    },
  };
}

async function join(server: ReturnType<typeof fakeServer>, owner: ReturnType<typeof person>, guest: ReturnType<typeof person>, vaultKey: Uint8Array, role: 'editor' | 'payer' | 'viewer') {
  server.actAs(owner);
  let n = 0;
  const { link } = await createInvite(server.remote, { vaultId: VAULT, stored: { version: server.vault.keyVersion, key: vaultKey }, role, newId: () => `${INVITE.slice(0, -1)}${n++}` });
  server.actAs(guest);
  const preview = await previewInvite(server.remote, link);
  return acceptInvite(server.remote, guest.identity, guest.userId, preview);
}

describe('Convite da gaveta por QR', () => {
  it('quem lê o QR vê o nome da gaveta e entra com a chave dela; o servidor só tem o hash do token', async () => {
    const dona = person('u-dona', 'Dona');
    const maria = person('u-maria', 'Maria');
    const key = newVaultKey();
    const server = fakeServer(dona, key);

    server.actAs(dona);
    const invite = await createInvite(server.remote, { vaultId: VAULT, stored: { version: 1, key }, role: 'payer', newId: () => INVITE });
    expect(invite.link).toMatch(/^scannerinteligente:\/\/convite\?i=/);
    expect(invite.expiresAt).toBe('2026-10-25T12:00:00Z');
    const saved = server.invites.get(INVITE)!;
    expect(saved.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(invite.link).not.toContain(saved.tokenHash);

    server.actAs(maria);
    const preview = await previewInvite(server.remote, invite.link);
    expect(preview.meta.name).toBe('Casa');
    expect(preview.role).toBe('payer');
    expect(preview.inviterName).toBe('Dona');

    const stored = await acceptInvite(server.remote, maria.identity, maria.userId, preview);
    expect(encodeBase64(stored.key)).toBe(encodeBase64(key));
    // A chave guardada no servidor só abre com a identidade da Maria
    const member = server.members.get(maria.userId)!;
    expect(member.role).toBe('payer');
    expect(encodeBase64(unwrapKey(maria.identity, member.wrappedKey, contexts.vaultKey(VAULT, maria.userId, 1)))).toBe(encodeBase64(key));
    expect(() => unwrapKey(dona.identity, member.wrappedKey, contexts.vaultKey(VAULT, maria.userId, 1))).toThrow();
  });

  it('QR que não é convite do Control é recusado sem consultar o servidor', async () => {
    const server = fakeServer(person('u-dona', 'Dona'), newVaultKey());
    const spy = jest.spyOn(server.remote, 'peekInvite');
    await expect(previewInvite(server.remote, 'https://exemplo.com/qualquer')).rejects.toBeInstanceOf(NotAnInvite);
    expect(spy).not.toHaveBeenCalled();
  });

  it('convite com segredo errado não abre', async () => {
    const dona = person('u-dona', 'Dona');
    const server = fakeServer(dona, newVaultKey());
    const { link } = await createInvite(server.remote, { vaultId: VAULT, stored: { version: 1, key: newVaultKey() }, role: 'viewer', newId: () => INVITE });
    const tampered = link.replace(/s=([A-Za-z0-9_-])/, (_m, c) => `s=${c === 'A' ? 'B' : 'A'}`);
    await expect(previewInvite(server.remote, tampered)).rejects.toThrow('CONVITE_INVALIDO');
  });
});

describe('Remover alguém troca a chave da gaveta', () => {
  it('quem fica recebe a chave nova e o chaveiro com a antiga; quem saiu não', async () => {
    const dona = person('u-dona', 'Dona');
    const maria = person('u-maria', 'Maria');
    const joao = person('u-joao', 'João');
    const key1 = newVaultKey();
    const server = fakeServer(dona, key1);
    await join(server, dona, maria, key1, 'editor');
    await join(server, dona, joao, key1, 'viewer');

    server.actAs(dona);
    const key2 = newVaultKey();
    const next = await removeMember(server.remote, { vaultId: VAULT, removeUserId: joao.userId, stored: { version: 1, key: key1 }, newKey: key2 });

    expect(next.version).toBe(2);
    expect(encodeBase64(next.previous![1])).toBe(encodeBase64(key1));
    expect(server.members.has(joao.userId)).toBe(false);
    expect(server.vault.keyVersion).toBe(2);

    // Maria abre a chave nova com a identidade dela, e o chaveiro devolve a antiga
    const m = server.members.get(maria.userId)!;
    expect(m.keyVersion).toBe(2);
    const mariaKey = unwrapKey(maria.identity, m.wrappedKey, contexts.vaultKey(VAULT, maria.userId, 2));
    expect(encodeBase64(mariaKey)).toBe(encodeBase64(key2));
    const ring = openKeyring(mariaKey, server.vault.keyring!, contexts.keyring(VAULT, 2));
    expect(encodeBase64(ring[1])).toBe(encodeBase64(key1));
    // Nome da gaveta recifrado com a chave nova; a antiga (que o João tem) não abre mais
    expect(openJson<{ name: string }>(key2, server.vault.encryptedMeta, contexts.vaultMeta(VAULT)).name).toBe('Casa');
    expect(() => openJson(key1, server.vault.encryptedMeta, contexts.vaultMeta(VAULT))).toThrow();
    expect(() => openKeyring(key1, server.vault.keyring!, contexts.keyring(VAULT, 2))).toThrow();
  });

  it('não troca a chave se a pessoa já não participa', async () => {
    const dona = person('u-dona', 'Dona');
    const key = newVaultKey();
    const server = fakeServer(dona, key);
    await expect(removeMember(server.remote, { vaultId: VAULT, removeUserId: 'u-ninguem', stored: { version: 1, key }, newKey: newVaultKey() }))
      .rejects.toThrow('já não participa');
    expect(server.vault.keyVersion).toBe(1);
  });
});

describe('Sincronização depois da troca de chave', () => {
  const enc = new TextEncoder();

  it('lê registros e fotos antigos com o chaveiro e grava com a chave nova', async () => {
    const key1 = newVaultKey();
    const key2 = newVaultKey();
    const doc = {
      documentType: 'BOLETO', issuer: 'ENEL', referenceMonth: '10/2026', cnpj: null, cpf: null, totalAmountCents: 18131,
      dueDate: '2026-11-10', boletoLine: null, ocrText: 'ENEL', createdAt: '2026-10-23T10:00:00.000Z',
      updatedAt: '2026-10-23T10:00:00.000Z', hasPhoto: true,
    };
    const rows: RemoteRecord[] = [{
      kind: 'document', id: 'd1', ciphertext: sealJson(key1, doc, contexts.record(VAULT, 'd1', 'document')),
      deleted: false, auditNote: null, keyVersion: 1, updatedAt: '2026-10-23T10:00:01.000Z',
    }];
    const photo = seal(key1, enc.encode('foto'), contexts.photo(VAULT, 'd1'));
    const written: Uint8Array[] = [];
    const remote: SyncRemote = {
      pull: async () => rows,
      push: async () => {},
      getPhoto: async () => photo,
      putPhoto: async () => {},
      removePhoto: async () => {},
    };
    const photos: PhotoIO = {
      read: async () => null,
      write: async (_id, bytes) => { written.push(bytes); return 'file://d1.jpg'; },
      remove: async () => {},
    };
    const { commit } = await runSync({
      snapshot: { cursor: EMPTY_CURSOR, documents: [], learned: [], photoDue: {}, photoHave: {} },
      role: 'viewer', vaultId: VAULT, key: key2, keyVersion: 2, previousKeys: { 1: key1 }, remote, photos,
    });
    expect(commit.contents.map(c => c.issuer)).toEqual(['ENEL']);
    expect(new TextDecoder().decode(written[0])).toBe('foto');
  });

  it('sem a chave antiga, avisa em vez de gravar lixo', async () => {
    const rows: RemoteRecord[] = [{
      kind: 'payment', id: 'p1', ciphertext: sealJson(newVaultKey(), {}, 'x'), deleted: false, auditNote: null,
      keyVersion: 1, updatedAt: '2026-10-23T10:00:01.000Z',
    }];
    const remote: SyncRemote = { pull: async () => rows, push: async () => {}, getPhoto: async () => null, putPhoto: async () => {}, removePhoto: async () => {} };
    await expect(runSync({
      snapshot: { cursor: EMPTY_CURSOR, documents: [], learned: [], photoDue: {}, photoHave: {} },
      role: 'viewer', vaultId: VAULT, key: newVaultKey(), keyVersion: 2, remote,
      photos: { read: async () => null, write: async () => '', remove: async () => {} },
    })).rejects.toThrow('chave que este celular ainda não tem');
  });
});

describe('Histórico da gaveta', () => {
  const base = { recordKind: null, recordId: null, note: null, targetId: null, targetName: null };

  it('abre os resumos com a chave da época e escreve em português', () => {
    const key1 = newVaultKey();
    const key2 = newVaultKey();
    const note = (key: Uint8Array, kind: string, id: string, text: string) =>
      sealJson(key, { at: '2026-10-24T10:00:00Z', text }, contexts.note(VAULT, kind, id));
    const rows: HistoryRow[] = [
      { ...base, id: 7, at: 't7', action: 'payment', recordKind: 'payment', recordId: 'd1', note: note(key2, 'payment', 'd1', 'Pagou ENEL'), actorId: 'u-maria', actorName: 'Maria' },
      { ...base, id: 6, at: 't6', action: 'key_rotate', actorId: 'u-dona', actorName: 'Dona' },
      { ...base, id: 5, at: 't5', action: 'member_remove', actorId: 'u-dona', actorName: 'Dona', targetId: 'u-joao', targetName: 'João', note: 'viewer' },
      { ...base, id: 4, at: 't4', action: 'member_role', actorId: 'u-dona', actorName: 'Dona', targetId: 'u-maria', targetName: 'Maria', note: 'payer -> editor' },
      { ...base, id: 3, at: 't3', action: 'create', recordKind: 'document', recordId: 'd1', note: note(key1, 'document', 'd1', 'Atualizou ENEL R$ 181,31'), actorId: 'u-dona', actorName: 'Dona' },
      { ...base, id: 2, at: 't2', action: 'member_add', actorId: 'u-maria', actorName: 'Maria', targetId: 'u-maria', targetName: 'Maria', note: 'payer' },
      { ...base, id: 1, at: 't1', action: 'member_add', actorId: 'u-dona', actorName: 'Dona', targetId: 'u-dona', targetName: 'Dona', note: 'owner' },
      { ...base, id: 0, at: 't0', action: 'delete', recordKind: 'document', recordId: 'dx', note: 'cifrado-com-chave-perdida', actorId: 'u-x', actorName: null },
    ];
    const texts = describeHistory(rows, { 1: key1, 2: key2 }, VAULT, 'u-dona').map(e => e.text);
    expect(texts).toEqual([
      'Maria pagou ENEL',
      'A chave da gaveta foi trocada',
      'Você removeu João',
      'Você mudou Maria de Pagador para Editor',
      'Você adicionou ENEL R$ 181,31',
      'Maria entrou como Pagador',
      'Você criou a gaveta',
      'Alguém excluiu uma conta',
    ]);
  });
});

describe('Convite pelo e-mail (sininho)', () => {
  it('chega no sininho com o nome da gaveta e, ao aceitar, a pessoa entra com a chave certa', async () => {
    const dona = person('u-dona', 'Dona');
    const maria = person('u-maria', 'Maria');
    const key = newVaultKey();
    const server = fakeServer(dona, key);
    server.register(maria); // Maria já usa o Control

    server.actAs(dona);
    const sent = await inviteByEmail(server.remote, { vaultId: VAULT, stored: { version: 1, key }, email: ' MARIA@x ', role: 'payer', myId: dona.userId });
    expect(sent.name).toBe('Maria');
    expect(sent.expiresAt).toBe('2026-10-31T12:00:00Z');
    // O servidor guarda só o embrulho: abre com a identidade da Maria, não com a da dona
    const stored = server.direct[0];
    expect(() => unwrapKey(dona.identity, stored.wrappedKey, contexts.vaultKey(VAULT, maria.userId, 1))).toThrow();

    server.actAs(maria);
    const inbox = await listMyInvites(server.remote, maria.identity, maria.userId);
    expect(inbox).toHaveLength(1);
    expect(inbox[0].meta.name).toBe('Casa');
    expect(inbox[0].inviterName).toBe('Dona');

    const accepted = await answerInvite(server.remote, inbox[0], true);
    expect(encodeBase64(accepted!.key)).toBe(encodeBase64(key));
    // O membro criado usa o mesmo embrulho: o motor abre a gaveta normalmente depois
    const member = server.members.get(maria.userId)!;
    expect(member.role).toBe('payer');
    expect(encodeBase64(unwrapKey(maria.identity, member.wrappedKey, contexts.vaultKey(VAULT, maria.userId, 1)))).toBe(encodeBase64(key));
    expect(await listMyInvites(server.remote, maria.identity, maria.userId)).toHaveLength(0);
  });

  it('recusar não entra na gaveta', async () => {
    const dona = person('u-dona', 'Dona');
    const joao = person('u-joao', 'Joao');
    const key = newVaultKey();
    const server = fakeServer(dona, key);
    server.register(joao);
    await inviteByEmail(server.remote, { vaultId: VAULT, stored: { version: 1, key }, email: 'joao@x', role: 'viewer', myId: dona.userId });
    server.actAs(joao);
    const [invite] = await listMyInvites(server.remote, joao.identity, joao.userId);
    await expect(answerInvite(server.remote, invite, false)).resolves.toBeNull();
    expect(server.members.has(joao.userId)).toBe(false);
  });

  it('quem ainda não usa o Control, ou o próprio e-mail, não recebe convite', async () => {
    const dona = person('u-dona', 'Dona');
    const key = newVaultKey();
    const server = fakeServer(dona, key);
    await expect(inviteByEmail(server.remote, { vaultId: VAULT, stored: { version: 1, key }, email: 'ninguem@x', role: 'viewer', myId: dona.userId }))
      .rejects.toBeInstanceOf(NotOnControl);
    await expect(inviteByEmail(server.remote, { vaultId: VAULT, stored: { version: 1, key }, email: 'dona@x', role: 'viewer', myId: dona.userId }))
      .rejects.toThrow('próprio e-mail');
    expect(server.direct).toHaveLength(0);
  });

  it('convite com embrulho que não abre (ex.: chave de outra conta) não quebra o sininho', async () => {
    const dona = person('u-dona', 'Dona');
    const maria = person('u-maria', 'Maria');
    const key = newVaultKey();
    const server = fakeServer(dona, key);
    server.register(maria);
    await inviteByEmail(server.remote, { vaultId: VAULT, stored: { version: 1, key }, email: 'maria@x', role: 'viewer', myId: dona.userId });
    server.actAs(maria);
    const outra = person('u-maria', 'Maria');
    expect(await listMyInvites(server.remote, outra.identity, maria.userId)).toEqual([]);
  });

  it('o histórico conta quem convidou, quem recusou e o que foi cancelado', () => {
    const base = { recordKind: null, recordId: null, actorId: 'u-dona', actorName: 'Dona' };
    const texts = describeHistory([
      { ...base, id: 3, at: 't', action: 'invite_decline', note: 'payer', actorId: 'u-joao', actorName: 'Joao', targetId: 'u-joao', targetName: 'Joao' },
      { ...base, id: 2, at: 't', action: 'invite_revoke', note: 'viewer', targetId: 'u-maria', targetName: 'Maria' },
      { ...base, id: 1, at: 't', action: 'invite_create', note: 'payer', targetId: 'u-maria', targetName: 'Maria' },
      { ...base, id: 0, at: 't', action: 'invite_create', note: 'viewer', targetId: null, targetName: null },
    ], {}, VAULT, 'u-dona').map(e => e.text);
    expect(texts).toEqual([
      'Joao recusou o convite (Pagador)',
      'Convite para Maria (Visualizador) cancelado',
      'Você convidou Maria como Pagador',
      'Você criou um convite por QR (Visualizador)',
    ]);
  });
});

describe('Avisos de novidades da gaveta', () => {
  const base = { recordKind: null, recordId: null, note: null, targetId: null, targetName: null };
  const rows = [
    { ...base, id: 12, at: 't', action: 'member_add', note: 'editor', actorId: 'u-joao', actorName: 'Joao', targetId: 'u-joao', targetName: 'Joao' },
    { ...base, id: 11, at: 't', action: 'invite_create', note: 'editor', actorId: 'u-dona', actorName: 'Dona', targetId: 'u-joao', targetName: 'Joao' },
    { ...base, id: 10, at: 't', action: 'member_add', note: 'owner', actorId: 'u-dona', actorName: 'Dona', targetId: 'u-dona', targetName: 'Dona' },
  ];

  it('na primeira vez só marca o ponto de partida', () => {
    expect(activityToNotify(rows, {}, VAULT, 'u-dona', null)).toEqual({ notify: [], lastSeen: 12 });
  });

  it('avisa o que outra pessoa fez depois da última olhada', () => {
    const result = activityToNotify(rows, {}, VAULT, 'u-dona', 10);
    expect(result.lastSeen).toBe(12);
    expect(result.notify.map(e => e.text)).toEqual(['Joao entrou como Editor']); // o convite foi a própria dona
  });

  it('nada novo, nada a avisar', () => {
    expect(activityToNotify(rows, {}, VAULT, 'u-dona', 12)).toEqual({ notify: [], lastSeen: 12 });
  });

  it('texto de quem participa', () => {
    const me = { name: 'Dona', role: 'owner' as const, me: true };
    expect(sharedWithText([me])).toBeNull();
    expect(sharedWithText([me, { name: 'Joao', role: 'editor', me: false }])).toBe('Compartilhada com Joao');
    expect(sharedWithText([me, { name: 'A', role: 'payer', me: false }, { name: 'B', role: 'viewer', me: false }, { name: 'C', role: 'viewer', me: false }]))
      .toBe('Compartilhada com A e mais 2');
  });
});

describe('Contas novas para revisar', () => {
  const base = { recordKind: 'document', note: null, targetId: null, targetName: null, at: 't' };
  let key: Uint8Array;
  let rows: HistoryRow[];
  const note = (id: string, text: string) => sealJson(key, { at: 't', text }, contexts.note(VAULT, 'document', id));
  beforeAll(() => {
    key = newVaultKey();
    rows = [
    { ...base, id: 3, action: 'create', recordId: 'd3', note: note('d3', 'Atualizou GÁS R$ 50,00'), actorId: 'u-dona', actorName: 'Dona' },
    { ...base, id: 2, action: 'create', recordId: 'd2', note: note('d2', 'Atualizou ÁGUA R$ 95,20'), actorId: 'u-yuri', actorName: 'Yuri' },
    { ...base, id: 1, action: 'create', recordId: 'd1', note: note('d1', 'Atualizou ENEL R$ 181,31'), actorId: 'u-yuri', actorName: 'Yuri' },
    { ...base, id: 0, action: 'payment', recordKind: 'payment', recordId: 'd1', note: null, actorId: 'u-yuri', actorName: 'Yuri' },
    ];
  });

  it('lista as contas que outra pessoa adicionou, inclusive antigas, na ordem em que chegaram', () => {
    const queue = reviewQueue(rows, { 1: key }, VAULT, 'u-dona', new Set(), () => true);
    expect(queue.map(q => [q.docId, q.actorName, q.text])).toEqual([
      ['d1', 'Yuri', 'Yuri adicionou ENEL R$ 181,31'],
      ['d2', 'Yuri', 'Yuri adicionou ÁGUA R$ 95,20'],
    ]);
  });

  it('some depois de aceita/recusada ou se a conta já foi excluída', () => {
    const queue = reviewQueue(rows, { 1: key }, VAULT, 'u-dona', new Set(['d1']), id => id !== 'd2');
    expect(queue).toEqual([]);
  });
});

describe('Avisos de mudança nas contas', () => {
  const at = (min: number) => new Date(Date.parse('2026-10-24T19:00:00Z') + min * 60000).toISOString();
  const row = (id: number, action: string, kind: string, rec: string, actor: string, min: number) => ({
    id, at: at(min), action, recordKind: kind, recordId: rec, note: null, actorId: actor, actorName: actor === 'u-yuri' ? 'Yuri' : 'Kayo',
    targetId: null, targetName: null,
  });

  it('avisa alteração, pagamento e exclusão feitos por outra pessoa', () => {
    const rows = [
      row(4, 'delete', 'document', 'd2', 'u-yuri', 90),
      row(3, 'payment', 'payment', 'd1', 'u-yuri', 80),
      row(2, 'update', 'document', 'd1', 'u-yuri', 70),
      row(1, 'create', 'document', 'd1', 'u-kayo', 0),
    ];
    const { notify } = activityToNotify(rows, {}, VAULT, 'u-kayo', 1);
    expect(notify.map(n => n.text)).toEqual(['Yuri editou uma conta', 'Yuri atualizou um pagamento', 'Yuri excluiu uma conta']);
  });

  it('não repete o eco de quem acabou de adicionar a conta (alteração e pagamento inicial)', () => {
    const rows = [
      row(5, 'update', 'document', 'd1', 'u-yuri', 30),   // mudou depois: avisa
      row(4, 'payment', 'payment', 'd1', 'u-yuri', 0.1),   // eco
      row(3, 'update', 'document', 'd1', 'u-yuri', 0.05),  // eco
      row(2, 'create', 'payment', 'd1', 'u-yuri', 0),
      row(1, 'create', 'document', 'd1', 'u-yuri', 0),
    ];
    const { notify } = activityToNotify(rows, {}, VAULT, 'u-kayo', 0);
    expect(notify.map(n => n.text)).toEqual(['Yuri editou uma conta']);
  });

  it('pagar minutos depois de adicionar avisa (não é eco)', () => {
    const rows = [row(2, 'payment', 'payment', 'd1', 'u-yuri', 5), row(1, 'create', 'document', 'd1', 'u-yuri', 0)];
    expect(activityToNotify(rows, {}, VAULT, 'u-kayo', 1).notify.map(n => n.text)).toEqual(['Yuri atualizou um pagamento']);
  });

  it('o próprio aviso da pessoa não chega para ela', () => {
    const rows = [row(2, 'update', 'document', 'd1', 'u-kayo', 30), row(1, 'payment', 'payment', 'd1', 'u-kayo', 40)];
    expect(activityToNotify(rows, {}, VAULT, 'u-kayo', 0).notify).toEqual([]);
  });
});
