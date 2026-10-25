import { contexts, newVaultKey, openJson, sealJson, setRandomSource } from '../src/sync/crypto';
import { EMPTY_CURSOR, NotePayload, OutboundRecord, RemoteRecord, SyncDocument, SyncSnapshot, matchProfileForVault } from '../src/sync/model';
import { PhotoIO, SyncRemote, runSync } from '../src/sync/runSync';

// O mesmo gerador do Node usado em sync_crypto.test.ts; o app usa o expo-crypto.
// eslint-disable-next-line @typescript-eslint/no-require-imports
beforeAll(() => setRandomSource(n => new Uint8Array(require('crypto').randomBytes(n))));

let key: Uint8Array;

const enc = new TextEncoder();
const VAULT = '11111111-1111-4111-8111-111111111111';
const KEY_VERSION = 1;

function doc(partial: Partial<SyncDocument> & Pick<SyncDocument, 'id'>): SyncDocument {
  return {
    imageUri: '',
    documentType: 'BOLETO',
    issuer: 'ENEL',
    referenceMonth: '10/2026',
    cnpj: null,
    cpf: null,
    totalAmountCents: 18131,
    dueDate: '2026-11-10',
    boletoLine: null,
    ocrText: 'ENEL',
    isPaid: 0,
    paymentDate: null,
    createdAt: '2026-10-23T10:00:00.000Z',
    updatedAt: '2026-10-23T11:00:00.000Z',
    paymentUpdatedAt: '2026-10-23T11:00:00.000Z',
    deletedAt: null,
    contentDirty: false,
    paymentDirty: false,
    ...partial,
  };
}

function snapshot(documents: SyncDocument[], extra: Partial<SyncSnapshot> = {}): SyncSnapshot {
  return { cursor: EMPTY_CURSOR, documents, learned: [], photoDue: {}, photoHave: {}, ...extra };
}

class MemoryRemote implements SyncRemote {
  rows: RemoteRecord[] = [];
  photos = new Map<string, Uint8Array>();
  now = Date.parse('2026-10-23T12:00:00.000Z');

  async pull(_vaultId: string, since: string) {
    const after = Date.parse(since);
    return this.rows.filter(row => Date.parse(row.updatedAt) > after);
  }

  async push(_vaultId: string, rows: OutboundRecord[]) {
    this.now += 1000;
    const updatedAt = new Date(this.now).toISOString();
    for (const row of rows) {
      const stored: RemoteRecord = { ...row, updatedAt };
      const index = this.rows.findIndex(item => item.kind === row.kind && item.id === row.id);
      if (index >= 0) this.rows[index] = stored;
      else this.rows.push(stored);
    }
  }

  async getPhoto(_vaultId: string, id: string) {
    const bytes = this.photos.get(id);
    return bytes ? bytes.slice() : null;
  }

  async putPhoto(_vaultId: string, id: string, bytes: Uint8Array) {
    this.photos.set(id, bytes.slice());
  }

  async removePhoto(_vaultId: string, id: string) {
    this.photos.delete(id);
  }
}

function memoryPhotos(files: Record<string, Uint8Array>): PhotoIO & { written: Record<string, Uint8Array>; removed: string[] } {
  const written: Record<string, Uint8Array> = {};
  const removed: string[] = [];
  return {
    written,
    removed,
    async read(uri) {
      return files[uri] ? files[uri].slice() : null;
    },
    async write(id, bytes) {
      written[id] = bytes.slice();
      return `file://scans/nuvem-${id}.jpg`;
    },
    async remove(uri) {
      removed.push(uri);
      delete files[uri];
    },
  };
}

describe('perfil da nuvem no outro celular', () => {
  const profiles = [
    { id: 'yuri', name: 'Yuri', vaultId: null },
    { id: 'mae', name: 'Mãe', vaultId: null },
  ];

  it('liga o perfil local de mesmo nome', () => {
    expect(matchProfileForVault(profiles, ' yuri ')).toBe('yuri');
  });

  it('cria perfil novo se o nome já está em outro cofre ou não existe', () => {
    expect(matchProfileForVault([{ id: 'yuri', name: 'Yuri', vaultId: 'cofre-1' }], 'Yuri')).toBeNull();
    expect(matchProfileForVault(profiles, 'Trabalho')).toBeNull();
  });
});

describe('sincronização de contas, pagamentos e fotos', () => {
  beforeAll(() => { key = newVaultKey(); });

  it('envia o que mudou e o outro celular recebe conta, pagamento e foto', async () => {
    const remote = new MemoryRemote();
    const photo = enc.encode('foto-do-boleto');
    const files = { 'file://local.jpg': photo };
    const mine = memoryPhotos(files);
    const local = snapshot([doc({
      id: 'conta-1',
      imageUri: 'file://local.jpg',
      contentDirty: true,
      paymentDirty: true,
      isPaid: 1,
      paymentDate: '2026-10-20',
    })]);

    const sent = await runSync({ snapshot: local, role: 'owner', vaultId: VAULT, key, keyVersion: KEY_VERSION, remote, photos: mine });
    expect(sent.report.pushed).toBe(2);
    expect(sent.report.photosUp).toBe(1);
    expect(sent.commit.clearContent).toEqual(['conta-1']);
    expect(sent.commit.clearPayment).toEqual(['conta-1']);
    const note = openJson<NotePayload>(key, remote.rows.find(r => r.kind === 'document')!.auditNote!, contexts.note(VAULT, 'document', 'conta-1'));
    expect(note.text).toContain('R$ 181,31');

    const otherFiles = {};
    const other = memoryPhotos(otherFiles);
    const received = await runSync({
      snapshot: snapshot([]),
      role: 'owner',
      vaultId: VAULT,
      key,
      keyVersion: KEY_VERSION,
      remote,
      photos: other,
    });
    expect(received.report.pulled).toBe(2);
    expect(received.report.photosDown).toBe(1);
    const content = received.commit.contents[0];
    expect(content.issuer).toBe('ENEL');
    expect(content.imageUri).toBe('file://scans/nuvem-conta-1.jpg');
    expect(received.commit.payments[0].isPaid).toBe(1);
    expect(other.written['conta-1']).toEqual(photo);
    expect(received.report.pushed).toBe(0);
  });

  it('não deixa uma alteração antiga da nuvem cobrir o que este celular mudou depois', async () => {
    const remote = new MemoryRemote();
    const old = doc({ id: 'conta-2' });
    remote.rows.push({
      kind: 'document',
      id: 'conta-2',
      deleted: false,
      keyVersion: KEY_VERSION,
      updatedAt: '2026-10-23T12:00:00.000Z',
      ciphertext: sealJson(key, {
        documentType: old.documentType, issuer: 'ANTIGO', referenceMonth: null, cnpj: null, cpf: null,
        totalAmountCents: 100, dueDate: null, boletoLine: null, ocrText: null,
        createdAt: old.createdAt, updatedAt: '2026-10-23T09:00:00.000Z', hasPhoto: false,
      }, contexts.record(VAULT, 'conta-2', 'document')),
      auditNote: null,
    });
    const result = await runSync({
      snapshot: snapshot([doc({ id: 'conta-2', issuer: 'NOVO', updatedAt: '2026-10-23T15:00:00.000Z', contentDirty: true })]),
      role: 'editor',
      vaultId: VAULT,
      key,
      keyVersion: KEY_VERSION,
      remote,
      photos: memoryPhotos({}),
    });
    expect(result.commit.contents).toHaveLength(0);
    expect(result.report.pushed).toBe(1);
    const pushed = openJson<{ issuer: string }>(key, remote.rows.find(r => r.id === 'conta-2')!.ciphertext!, contexts.record(VAULT, 'conta-2', 'document'));
    expect(pushed.issuer).toBe('NOVO');
  });

  it('a exclusão mais nova apaga aqui, e uma edição mais nova desfaz a exclusão na nuvem', async () => {
    const remote = new MemoryRemote();
    const tombstone = (id: string, at: string): RemoteRecord => ({
      kind: 'document',
      id,
      deleted: true,
      ciphertext: null,
      keyVersion: KEY_VERSION,
      updatedAt: '2026-10-23T18:00:00.000Z',
      auditNote: sealJson(key, { at, text: 'Excluiu ENEL' }, contexts.note(VAULT, 'document', id)),
    });
    remote.rows.push(tombstone('apagar', '2026-10-23T16:00:00.000Z'));
    remote.rows.push(tombstone('ficar', '2026-10-23T12:00:00.000Z'));

    const result = await runSync({
      snapshot: snapshot([
        doc({ id: 'apagar', updatedAt: '2026-10-23T11:00:00.000Z', imageUri: 'file://apagar.jpg' }),
        doc({ id: 'ficar', updatedAt: '2026-10-23T17:00:00.000Z', contentDirty: true, issuer: 'FICOU' }),
      ]),
      role: 'owner',
      vaultId: VAULT,
      key,
      keyVersion: KEY_VERSION,
      remote,
      photos: memoryPhotos({ 'file://apagar.jpg': enc.encode('x') }),
    });

    expect(result.commit.contents.find(c => c.id === 'apagar')?.deletedAt).toBe('2026-10-23T16:00:00.000Z');
    expect(result.commit.contents.find(c => c.id === 'ficar')).toBeUndefined();
    const stayed = openJson<{ issuer: string }>(key, remote.rows.find(r => r.id === 'ficar' && !r.deleted)!.ciphertext!, contexts.record(VAULT, 'ficar', 'document'));
    expect(stayed.issuer).toBe('FICOU');
  });

  it('visualizador não envia alteração', async () => {
    const remote = new MemoryRemote();
    const result = await runSync({
      snapshot: snapshot([doc({ id: 'conta-3', contentDirty: true, paymentDirty: true })]),
      role: 'viewer',
      vaultId: VAULT,
      key,
      keyVersion: KEY_VERSION,
      remote,
      photos: memoryPhotos({}),
    });
    expect(result.report.pushed).toBe(0);
    expect(remote.rows).toHaveLength(0);
    expect(result.commit.clearContent).toHaveLength(0);
  });

  it('pagador envia só o pagamento', async () => {
    const remote = new MemoryRemote();
    const result = await runSync({
      snapshot: snapshot([doc({ id: 'conta-4', contentDirty: true, paymentDirty: true, isPaid: 1 })]),
      role: 'payer',
      vaultId: VAULT,
      key,
      keyVersion: KEY_VERSION,
      remote,
      photos: memoryPhotos({}),
    });
    expect(remote.rows.map(r => r.kind)).toEqual(['payment']);
    expect(result.commit.clearContent).toHaveLength(0);
    expect(result.commit.clearPayment).toEqual(['conta-4']);
  });

  it('palavra aprendida mais nova substitui a local, mesmo com outro id', async () => {
    const remote = new MemoryRemote();
    remote.rows.push({
      kind: 'learned',
      id: 'remoto',
      deleted: false,
      keyVersion: KEY_VERSION,
      updatedAt: '2026-10-23T13:00:00.000Z',
      ciphertext: sealJson(key, {
        pattern: 'enel', category: 'LUZ', updatedAt: '2026-10-23T13:00:00.000Z', deletedAt: null,
      }, contexts.record(VAULT, 'remoto', 'learned')),
      auditNote: null,
    });
    const result = await runSync({
      snapshot: {
        ...snapshot([]),
        learned: [{ id: 'local', pattern: 'enel', category: 'OUTROS', updatedAt: '2026-10-23T10:00:00.000Z', deletedAt: null, dirty: true }],
      },
      role: 'owner',
      vaultId: VAULT,
      key,
      keyVersion: KEY_VERSION,
      remote,
      photos: memoryPhotos({}),
    });
    expect(result.commit.learned).toEqual([
      expect.objectContaining({ id: 'remoto', pattern: 'enel', category: 'LUZ' }),
    ]);
    expect(result.report.pushed).toBe(0);
  });

  it('interrompe se o texto cifrado foi adulterado', async () => {
    const remote = new MemoryRemote();
    const sealed = sealJson(key, {
      documentType: 'BOLETO', issuer: 'ENEL', referenceMonth: null, cnpj: null, cpf: null,
      totalAmountCents: 100, dueDate: null, boletoLine: null, ocrText: null,
      createdAt: '2026-10-23T10:00:00.000Z', updatedAt: '2026-10-23T11:00:00.000Z', hasPhoto: false,
    }, contexts.record(VAULT, 'conta-5', 'document'));
    remote.rows.push({
      kind: 'document', id: 'conta-5', deleted: false, keyVersion: KEY_VERSION,
      updatedAt: '2026-10-23T12:00:00.000Z',
      ciphertext: `${sealed.slice(0, 12)}${sealed[12] === 'A' ? 'B' : 'A'}${sealed.slice(13)}`,
      auditNote: null,
    });
    await expect(runSync({
      snapshot: snapshot([]),
      role: 'owner',
      vaultId: VAULT,
      key,
      keyVersion: KEY_VERSION,
      remote,
      photos: memoryPhotos({}),
    })).rejects.toThrow();
  });
});

describe('correções da revisão', () => {
  beforeAll(() => { key = newVaultKey(); });

  it('conta paga e depois excluída não vira conta-fantasma num celular novo', async () => {
    const remote = new MemoryRemote();
    // Celular A: cria, paga e depois exclui a conta
    const a = await runSync({
      snapshot: snapshot([doc({ id: 'conta-x', contentDirty: true, paymentDirty: true, isPaid: 1, paymentDate: '2026-10-20' })]),
      role: 'owner', vaultId: VAULT, key, keyVersion: KEY_VERSION, remote, photos: memoryPhotos({}),
    });
    expect(a.report.pushed).toBe(2);
    await runSync({
      snapshot: snapshot([doc({ id: 'conta-x', deletedAt: '2026-10-23T13:00:00.000Z', updatedAt: '2026-10-23T13:00:00.000Z', contentDirty: true, isPaid: 1 })]),
      role: 'owner', vaultId: VAULT, key, keyVersion: KEY_VERSION, remote, photos: memoryPhotos({}),
    });

    // Celular B, vazio: recebe a exclusão e o pagamento antigo
    const b = await runSync({ snapshot: snapshot([]), role: 'owner', vaultId: VAULT, key, keyVersion: KEY_VERSION, remote, photos: memoryPhotos({}) });
    const tombstone = b.commit.contents.find(c => c.id === 'conta-x');
    expect(tombstone?.deletedAt).toBe('2026-10-23T13:00:00.000Z'); // guardada como excluída (invisível)
    expect(b.commit.payments.find(p => p.id === 'conta-x')).toBeUndefined(); // pagamento anterior à exclusão é descartado
    expect(b.commit.contents.filter(c => c.id === 'conta-x' && !c.deletedAt)).toEqual([]); // nenhuma conta visível
    expect(b.report.reminders.every(r => r.id !== 'conta-x' || r.deleted || !r.dueDate)).toBe(true);
  });

  it('foto vai uma vez só; editar a conta depois não reenvia', async () => {
    const remote = new MemoryRemote();
    const files = { 'file://f.jpg': enc.encode('foto') };
    const mine = memoryPhotos(files);
    const putSpy = jest.spyOn(remote, 'putPhoto');

    const first = await runSync({
      snapshot: snapshot([doc({ id: 'c1', imageUri: 'file://f.jpg', contentDirty: true })]),
      role: 'owner', vaultId: VAULT, key, keyVersion: KEY_VERSION, remote, photos: mine,
    });
    expect(first.report.photosUp).toBe(1);
    const photoHave = { c1: first.commit.meta['photoHave:c1'] as string };

    const edited = await runSync({
      snapshot: snapshot([doc({ id: 'c1', imageUri: 'file://f.jpg', issuer: 'ENERGIA', updatedAt: '2026-10-23T14:00:00.000Z', contentDirty: true })], { photoHave }),
      role: 'owner', vaultId: VAULT, key, keyVersion: KEY_VERSION, remote, photos: mine,
    });
    expect(edited.report.photosUp).toBe(0);
    expect(putSpy).toHaveBeenCalledTimes(1);
    // e o conteúdo continua dizendo que tem foto
    const content = openJson<{ hasPhoto: boolean }>(key, remote.rows.find(r => r.kind === 'document')!.ciphertext!, contexts.record(VAULT, 'c1', 'document'));
    expect(content.hasPhoto).toBe(true);
  });

  it('outro celular não baixa a foto de novo a cada edição', async () => {
    const remote = new MemoryRemote();
    await runSync({
      snapshot: snapshot([doc({ id: 'c2', imageUri: 'file://g.jpg', contentDirty: true })]),
      role: 'owner', vaultId: VAULT, key, keyVersion: KEY_VERSION, remote, photos: memoryPhotos({ 'file://g.jpg': enc.encode('g') }),
    });
    const other = memoryPhotos({});
    const got = await runSync({ snapshot: snapshot([]), role: 'owner', vaultId: VAULT, key, keyVersion: KEY_VERSION, remote, photos: other });
    expect(got.report.photosDown).toBe(1);

    // Celular A edita a conta; B já tem a foto
    await runSync({
      snapshot: snapshot([doc({ id: 'c2', imageUri: 'file://g.jpg', issuer: 'NOVO', updatedAt: '2026-10-23T15:00:00.000Z', contentDirty: true })], { photoHave: { c2: 'x' } }),
      role: 'owner', vaultId: VAULT, key, keyVersion: KEY_VERSION, remote, photos: memoryPhotos({ 'file://g.jpg': enc.encode('g') }),
    });
    const again = await runSync({
      snapshot: snapshot([doc({ id: 'c2', imageUri: 'file://scans/nuvem-c2.jpg' })], { cursor: got.commit.cursor, photoHave: { c2: got.commit.meta['photoHave:c2'] as string } }),
      role: 'owner', vaultId: VAULT, key, keyVersion: KEY_VERSION, remote, photos: other,
    });
    expect(again.report.pulled).toBe(1);
    expect(again.report.photosDown).toBe(0);
  });

  it('foto que falha não trava a sincronização e fica para a próxima rodada', async () => {
    const remote = new MemoryRemote();
    jest.spyOn(remote, 'putPhoto').mockRejectedValueOnce(new Error('rede caiu'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await runSync({
      snapshot: snapshot([doc({ id: 'c3', imageUri: 'file://h.jpg', contentDirty: true, paymentDirty: true, isPaid: 1 })]),
      role: 'owner', vaultId: VAULT, key, keyVersion: KEY_VERSION, remote, photos: memoryPhotos({ 'file://h.jpg': enc.encode('h') }),
    });
    warn.mockRestore();
    expect(result.report.pushed).toBe(2);                  // conta e pagamento subiram
    expect(result.commit.clearPayment).toEqual(['c3']);
    expect(result.commit.clearContent).toEqual([]);         // conta segue pendente para reenviar a foto
    expect(result.commit.meta['photoHave:c3']).toBeUndefined();
  });

  it('foto acima do limite do servidor não é enviada', async () => {
    const remote = new MemoryRemote();
    const putSpy = jest.spyOn(remote, 'putPhoto');
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await runSync({
      snapshot: snapshot([doc({ id: 'c4', imageUri: 'file://big.jpg', contentDirty: true })]),
      role: 'owner', vaultId: VAULT, key, keyVersion: KEY_VERSION, remote,
      photos: memoryPhotos({ 'file://big.jpg': new Uint8Array(2 * 1024 * 1024 + 1) }),
    });
    warn.mockRestore();
    expect(putSpy).not.toHaveBeenCalled();
    expect(result.report.pushed).toBe(1);
  });

  it('palavra aprendida excluída na nuvem não trava a sincronização', async () => {
    const remote = new MemoryRemote();
    remote.rows.push({ kind: 'learned', id: 'l1', ciphertext: null, deleted: true, auditNote: null, keyVersion: KEY_VERSION, updatedAt: '2026-10-23T12:30:00.000Z' });
    const result = await runSync({ snapshot: snapshot([]), role: 'owner', vaultId: VAULT, key, keyVersion: KEY_VERSION, remote, photos: memoryPhotos({}) });
    expect(result.commit.cursor).toBe('2026-10-23T12:30:00.000Z');
  });
});
