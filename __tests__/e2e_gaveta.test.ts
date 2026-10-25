// Processo completo da gaveta compartilhada com DOIS celulares simulados.
// Cada celular carrega o app numa cópia isolada dos módulos (banco SQLite, chaveiro e avisos próprios);
// o servidor é um falso em memória com as mesmas regras do Supabase (testadas em supabase/tests/*.sql).
// Código de verdade: banco local, criptografia, motor de sincronização, convite e aceite.

/* eslint-disable @typescript-eslint/no-require-imports */

type Role = 'owner' | 'editor' | 'payer' | 'viewer';
type Rec = { kind: string; id: string; ciphertext: string | null; deleted: boolean; auditNote: string | null; keyVersion: number; updatedAt: string };

// ---- Servidor falso (compartilhado pelos dois celulares) ----
const mockServer = (() => {
  let clock = Date.parse('2026-10-24T20:00:00Z');
  const tick = () => new Date((clock += 1000)).toISOString();
  const users = new Map<string, { email: string; name: string; publicKey: string }>();
  const vaults = new Map<string, { ownerId: string; keyVersion: number; keyring: string | null; meta: string | null }>();
  const members = new Map<string, Map<string, { role: Role; wrappedKey: string; keyVersion: number }>>();
  const records = new Map<string, Map<string, Rec>>();
  const audit: { id: number; vaultId: string; at: string; action: string; recordKind: string | null; recordId: string | null; note: string | null; actorId: string | null; targetId: string | null }[] = [];
  const direct: { id: string; vaultId: string; inviteeId: string; role: Exclude<Role, 'owner'>; wrappedKey: string; keyVersion: number; createdBy: string; answer: string | null }[] = [];
  let me = '';
  const log = (vaultId: string, action: string, extra: Partial<(typeof audit)[number]> = {}) =>
    audit.push({ id: audit.length + 1, vaultId, at: tick(), action, recordKind: null, recordId: null, note: null, actorId: me, targetId: null, ...extra });
  const roleOf = (vaultId: string) => members.get(vaultId)?.get(me)?.role ?? null;
  const name = (id: string | null) => (id ? users.get(id)?.name ?? null : null);

  const remote = {
    // --- sincronização (RLS: membros leem; dono/editor gravam contas; pagador só pagamento)
    async pull(vaultId: string, since: string) {
      if (!roleOf(vaultId)) throw new Error('SEM_ACESSO');
      return [...(records.get(vaultId)?.values() ?? [])].filter(r => r.updatedAt > since).sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
    },
    async push(vaultId: string, rows: Omit<Rec, 'updatedAt'>[]) {
      const role = roleOf(vaultId);
      for (const row of rows) {
        const allowed = row.kind === 'payment' ? role !== null && role !== 'viewer' : role === 'owner' || role === 'editor';
        if (!allowed) throw new Error('new row violates row-level security policy');
      }
      const table = records.get(vaultId) ?? new Map<string, Rec>();
      records.set(vaultId, table);
      // Como no Supabase: um envio é uma transação, com o mesmo horário; entre envios, o tempo passa
      clock += 5 * 60 * 1000;
      const stamp = new Date(clock).toISOString();
      for (const row of rows) {
        const key = `${row.kind}:${row.id}`;
        const isNew = !table.has(key);
        table.set(key, { ...row, ciphertext: row.deleted ? null : row.ciphertext, updatedAt: stamp });
        const action = row.deleted ? 'delete' : isNew ? 'create' : row.kind === 'payment' ? 'payment' : 'update';
        log(vaultId, action, { at: stamp, recordKind: row.kind, recordId: row.id, note: row.auditNote });
      }
    },
    async getPhoto() { return null; },
    async putPhoto() {},
    async removePhoto() {},
    // --- cofres e membros
    async listMine(userId: string) {
      return [...members.entries()].filter(([, m]) => m.has(userId)).map(([vaultId, m]) => {
        const mine = m.get(userId)!;
        return { vaultId, role: mine.role, keyVersion: mine.keyVersion, wrappedKey: mine.wrappedKey, encryptedMeta: vaults.get(vaultId)!.meta };
      });
    },
    async getMember(vaultId: string, userId: string) {
      const m = members.get(vaultId)?.get(userId);
      return m ? { ...m } : null;
    },
    async createVault(input: { id: string; ownerId: string; encryptedMeta: string; userId: string; wrappedKey: string; keyVersion: number }) {
      vaults.set(input.id, { ownerId: input.ownerId, keyVersion: input.keyVersion, keyring: null, meta: input.encryptedMeta });
      members.set(input.id, new Map([[input.userId, { role: 'owner', wrappedKey: input.wrappedKey, keyVersion: input.keyVersion }]]));
      log(input.id, 'member_add', { targetId: input.userId, note: 'owner' });
    },
    async getVault(vaultId: string) {
      if (!roleOf(vaultId)) return null;
      const v = vaults.get(vaultId)!;
      return { keyVersion: v.keyVersion, keyring: v.keyring, encryptedMeta: v.meta };
    },
    async setVaultMeta(vaultId: string, meta: string) {
      if (roleOf(vaultId) !== 'owner') throw new Error('SEM_ACESSO');
      vaults.get(vaultId)!.meta = meta;
    },
    async listMembers(vaultId: string) {
      if (!roleOf(vaultId)) throw new Error('SEM_ACESSO');
      return [...members.get(vaultId)!.entries()].map(([userId, m]) => ({ userId, role: m.role, name: name(userId)!, email: users.get(userId)!.email, joinedAt: '' }));
    },
    async publicKeys(ids: string[]) { return Object.fromEntries(ids.map(id => [id, users.get(id)!.publicKey])); },
    async history(vaultId: string, _before: number | null, limit: number) {
      if (!roleOf(vaultId)) throw new Error('SEM_ACESSO');
      return audit.filter(a => a.vaultId === vaultId).sort((a, b) => b.id - a.id).slice(0, limit)
        .map(a => ({ ...a, actorName: name(a.actorId), targetName: name(a.targetId) }));
    },
    // --- convite pelo e-mail
    async findUserByEmail(email: string) {
      const found = [...users.entries()].find(([, u]) => u.email === email.trim().toLowerCase());
      return found ? { userId: found[0], publicKey: found[1].publicKey, name: found[1].name } : null;
    },
    async createDirectInvite(input: { vaultId: string; inviteeId: string; role: Exclude<Role, 'owner'>; wrappedKey: string; keyVersion: number }) {
      if (roleOf(input.vaultId) !== 'owner') throw new Error('SEM_ACESSO');
      direct.push({ id: `convite-${direct.length + 1}`, ...input, createdBy: me, answer: null });
      log(input.vaultId, 'invite_create', { targetId: input.inviteeId, note: input.role });
      return '2026-10-31T20:00:00Z';
    },
    async myDirectInvites() {
      return direct.filter(d => d.inviteeId === me && !d.answer).map(d => ({
        id: d.id, vaultId: d.vaultId, role: d.role, wrappedKey: d.wrappedKey, keyVersion: d.keyVersion,
        expiresAt: '2026-10-31T20:00:00Z', encryptedMeta: vaults.get(d.vaultId)!.meta, inviterName: name(d.createdBy),
      }));
    },
    async answerDirectInvite(id: string, accept: boolean) {
      const d = direct.find(x => x.id === id && x.inviteeId === me && !x.answer);
      if (!d) throw new Error('CONVITE_INVALIDO');
      d.answer = accept ? 'accepted' : 'declined';
      if (accept) {
        members.get(d.vaultId)!.set(me, { role: d.role, wrappedKey: d.wrappedKey, keyVersion: d.keyVersion });
        log(d.vaultId, 'member_add', { targetId: me, note: d.role });
      } else {
        log(d.vaultId, 'invite_decline', { targetId: me, note: d.role });
      }
      return d.vaultId;
    },
    async sentDirectInvites() { return []; },
    async listInvites() { return []; },
  };

  return {
    remote,
    actAs(userId: string) { me = userId; },
    register(userId: string, email: string, fullName: string, publicKey: string) { users.set(userId, { email, name: fullName, publicKey }); },
    documents(vaultId: string) { return [...(records.get(vaultId)?.values() ?? [])].filter(r => r.kind === 'document' && !r.deleted); },
  };
})();

const mockSession = { current: null as null | { user: { id: string; email: string; user_metadata: { full_name: string } } } };

jest.mock('expo-sqlite', () => require('../test-utils/nodeSqlite'));
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'x',
    getItemAsync: async (k: string) => store.get(k) ?? null,
    setItemAsync: async (k: string, v: string) => { store.set(k, v); },
    deleteItemAsync: async (k: string) => { store.delete(k); },
  };
});
jest.mock('expo-crypto', () => ({ getRandomBytes: (n: number) => new Uint8Array(require('crypto').randomBytes(n)) }));
jest.mock('../src/sync/supabase', () => ({ supabase: () => { throw new Error('rede real não é usada no teste'); }, isSupabaseConfigured: () => true }));
jest.mock('../src/sync/auth', () => ({ currentSession: async () => mockSession.current }));
jest.mock('../src/sync/remote', () => ({ remote: mockServer.remote, ServerError: class extends Error {} }));
jest.mock('../src/sync/photos', () => ({ photos: { read: async () => null, write: async () => '', remove: async () => {} } }));

// Módulos do app carregados no celular (db, profiles, engine, sharing...) e os atalhos do teste
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Phone = Record<string, any> & { ready(): Promise<void>; use(): void; gavetaAvisos(): string[] };

// Um celular: cópia própria do app (banco, chaveiro, avisos) com a conta Google e a frase da pessoa
function phone(user: { id: string; email: string; name: string }): Phone {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mods: Record<string, any> = {};
  jest.isolateModules(() => {
    Object.assign(mods, {
      db: require('../src/db/database'),
      profiles: require('../src/db/profiles'),
      engine: require('../src/sync/engine'),
      sharing: require('../src/sync/sharing'),
      reviewApi: require('../src/sync/review'),
      crypto: require('../src/sync/crypto'),
      secure: require('expo-secure-store'),
      notifications: require('expo-notifications'),
    });
  });
  const { db, crypto, secure } = mods;
  db.initDatabase();
  const phrase = crypto.createRecoveryPhrase();
  const publicKey = crypto.encodeBase64(crypto.identityFromPhrase(phrase).publicKey);
  mockServer.register(user.id, user.email, user.name, publicKey);
  const session = { user: { id: user.id, email: user.email, user_metadata: { full_name: user.name } } };
  return {
    ...mods,
    async ready() { await secure.setItemAsync(`control.phrase.${user.id}`, crypto.normalizePhrase(phrase)); },
    // Antes de cada ação, "este celular" é quem está com o app aberto
    use() { mockSession.current = session; mockServer.actAs(user.id); },
    gavetaAvisos(): string[] {
      return (mods.notifications.scheduleNotificationAsync as jest.Mock).mock.calls
        .map(c => c[0].content)
        .filter((c: { data?: { kind?: string } }) => c.data?.kind === 'gaveta')
        .map((c: { body: string }) => c.body);
    },
  };
}

const boleto = (issuer: string, cents: number, due: string) => ({
  documentType: 'BOLETO' as const, issuer, referenceMonth: '10/2026', cnpj: null, cpf: null,
  totalAmountCents: cents, dueDate: due, boletoLine: null,
});

describe('Gaveta compartilhada: processo completo com dois celulares', () => {
  it('criar, levar à nuvem, convidar, aceitar, ver pendentes, pagar e avisar', async () => {
    const kayo = phone({ id: 'u-kayo', email: 'kayo@teste.dev', name: 'Kayo' });
    const yuri = phone({ id: 'u-yuri', email: 'yuri@teste.dev', name: 'Yuri' });
    await kayo.ready();
    await yuri.ready();

    // 1) Kayo cria a gaveta, leva para a nuvem e adiciona dois boletos
    kayo.use();
    const gaveta = kayo.profiles.createProfile({ name: 'Teste da família', color: '#4f8cff', icon: 'home-heart' });
    await kayo.engine.enableProfileSync(gaveta);
    kayo.db.changeProfile(gaveta);
    kayo.db.saveDocument('', 'ENEL', boleto('ENEL', 18131, '2026-11-10'));
    kayo.db.saveDocument('', 'AGUA', boleto('ÁGUA', 9520, '2026-11-15'));
    await kayo.engine.syncProfile(gaveta);
    const vaultId = kayo.profiles.getProfile(gaveta).vaultId;
    expect(mockServer.documents(vaultId)).toHaveLength(2);
    // No servidor só vai texto cifrado
    expect(JSON.stringify(mockServer.documents(vaultId))).not.toContain('ENEL');

    // Os celulares são mesmo separados: módulos, banco e gavetas próprios
    expect(kayo.db).not.toBe(yuri.db);
    expect(yuri.profiles.getProfile(gaveta)).toBeNull();
    expect(yuri.profiles.listProfiles().some((p: { vaultId: string | null }) => p.vaultId === vaultId)).toBe(false);

    // 2) Kayo convida o Yuri pelo e-mail, como Pagador
    const sent = await kayo.sharing.inviteByEmail(gaveta, 'yuri@teste.dev', 'payer');
    expect(sent.name).toBe('Yuri');

    // 3) No celular do Yuri: o convite aparece no sininho, com o nome da gaveta, e ele aceita
    yuri.use();
    const inbox = await yuri.sharing.loadMyInvites();
    expect(inbox).toHaveLength(1);
    expect(inbox[0]).toMatchObject({ inviterName: 'Kayo', role: 'payer', meta: { name: 'Teste da família' } });
    const joined = await yuri.sharing.answerMyInvite(inbox[0], true);
    expect(joined.syncError).toBeNull();

    // Os dois boletos chegam como pendentes, na gaveta compartilhada
    const pendentes = yuri.db.listPendingDocuments(joined.profileId).map((d: { issuer: string }) => d.issuer);
    expect(pendentes).toEqual(['ENEL', 'ÁGUA']); // do que vence primeiro
    expect(yuri.profiles.getProfile(joined.profileId)).toMatchObject({ name: 'Teste da família', role: 'payer' });
    expect(await yuri.sharing.loadMyInvites()).toHaveLength(0); // sininho esvaziou

    // 4) Yuri paga a ENEL; como Pagador, a conta nova que ele tentar criar não sobe
    yuri.db.changeProfile(joined.profileId);
    const enel = yuri.db.getDocuments().find((d: { issuer: string }) => d.issuer === 'ENEL');
    yuri.db.togglePaidStatus(enel.id, 0, '2026-10-24');
    yuri.db.saveDocument('', 'GAS', boleto('GÁS', 5000, '2026-11-20'));
    await yuri.engine.syncProfile(joined.profileId);
    expect(mockServer.documents(vaultId)).toHaveLength(2); // o GÁS do pagador ficou só no celular dele
    expect(kayo.db.getDocuments().some((d: { issuer: string }) => d.issuer === 'GÁS')).toBe(false);

    // 5) Kayo sincroniza: a ENEL está paga, só a ÁGUA pendente, e chegam os avisos
    kayo.use();
    await kayo.engine.syncProfile(gaveta);
    expect(kayo.db.listPendingDocuments(gaveta).map((d: { issuer: string }) => d.issuer)).toEqual(['ÁGUA']);
    const paid = kayo.db.getDocuments().find((d: { issuer: string }) => d.issuer === 'ENEL');
    expect(paid).toMatchObject({ isPaid: 1, paymentDate: '2026-10-24' });
    const avisos = kayo.gavetaAvisos();
    expect(avisos).toContain('Yuri entrou como Pagador');
    expect(avisos.some(a => /^Yuri pagou ENEL/.test(a))).toBe(true);

    // Membros: a lista do Kayo mostra com quem a gaveta é compartilhada
    const members = JSON.parse(kayo.db.getProfileSettings(gaveta, { gaveta_members: '[]' }).gaveta_members);
    expect(members.map((m: { name: string; role: string }) => `${m.name}:${m.role}`).sort()).toEqual(['Kayo:owner', 'Yuri:payer']);
  });

  it('conta adicionada por um editor chega para o dono revisar: aviso, aceitar e recusar', async () => {
    const dono = phone({ id: 'u-dono2', email: 'dono2@teste.dev', name: 'Kayo' });
    const editor = phone({ id: 'u-editor2', email: 'editor2@teste.dev', name: 'Yuri' });
    await dono.ready();
    await editor.ready();

    dono.use();
    const gaveta = dono.profiles.createProfile({ name: 'Casa', color: '#4f8cff', icon: 'home-heart' });
    await dono.engine.enableProfileSync(gaveta);
    await dono.sharing.inviteByEmail(gaveta, 'editor2@teste.dev', 'editor');

    editor.use();
    const [invite] = await editor.sharing.loadMyInvites();
    const { profileId } = await editor.sharing.answerMyInvite(invite, true);
    editor.db.changeProfile(profileId);
    editor.db.saveDocument('', 'INTERNET', boleto('INTERNET', 9990, '2026-11-12'));
    editor.db.saveDocument('', 'LIXO', boleto('LIXO', 1500, '2026-11-30'));
    await editor.engine.syncProfile(profileId);

    // Dono sincroniza: as duas contas chegam, entram para revisar e geram aviso
    dono.use();
    await dono.engine.syncAllProfiles();
    const review: { docId: string; text: string }[] = dono.reviewApi.loadReviewEntries();
    expect(review.map(r => r.text)).toEqual(['Yuri adicionou INTERNET R$ 99,90', 'Yuri adicionou LIXO R$ 15,00']);
    expect(dono.gavetaAvisos().filter(a => a.includes('Yuri adicionou'))).toHaveLength(2);

    // Sincronizar de novo não repete o aviso
    await dono.engine.syncAllProfiles();
    expect(dono.gavetaAvisos().filter(a => a.includes('Yuri adicionou'))).toHaveLength(2);

    // Aceita a INTERNET e recusa o LIXO (exclui para todos)
    const internet = review.find(r => r.text.includes('INTERNET'))!;
    const lixo = review.find(r => r.text.includes('LIXO'))!;
    dono.reviewApi.acceptReview(gaveta, internet.docId);
    dono.reviewApi.refuseReview(gaveta, lixo.docId);
    expect(dono.reviewApi.loadReviewEntries()).toEqual([]);
    await dono.engine.syncProfile(gaveta);
    expect(dono.db.listPendingDocuments(gaveta).map((d: { issuer: string }) => d.issuer)).toEqual(['INTERNET']);

    // No celular do editor, o LIXO recusado some
    editor.use();
    await editor.engine.syncProfile(profileId);
    expect(editor.db.listPendingDocuments(profileId).map((d: { issuer: string }) => d.issuer)).toEqual(['INTERNET']);
    // ...e o editor é avisado da exclusão feita pelo dono
    expect(editor.gavetaAvisos().some(t => /^Kayo excluiu LIXO/.test(t))).toBe(true);

    // Dono altera a INTERNET: o editor é avisado da alteração
    dono.use();
    dono.db.changeProfile(gaveta);
    dono.db.updateDocumentIssuer(internet.docId, 'INTERNET FIBRA');
    await dono.engine.syncProfile(gaveta);
    editor.use();
    await editor.engine.syncProfile(profileId);
    expect(editor.gavetaAvisos().some(t => /^Kayo atualizou INTERNET FIBRA/.test(t))).toBe(true);

    // Editor marca como paga: o dono é avisado do pagamento
    const doc = editor.db.getDocuments().find((d: { issuer: string }) => d.issuer === 'INTERNET FIBRA');
    editor.db.togglePaidStatus(doc.id, 0, '2026-10-24');
    await editor.engine.syncProfile(profileId);
    dono.use();
    await dono.engine.syncProfile(gaveta);
    expect(dono.gavetaAvisos().some(t => /^Yuri pagou INTERNET FIBRA/.test(t))).toBe(true);

    // Ninguém é avisado do que ele mesmo fez
    expect(dono.gavetaAvisos().some(t => t.startsWith('Kayo'))).toBe(false);
    expect(editor.gavetaAvisos().some(t => t.startsWith('Yuri'))).toBe(false);
  });
});
