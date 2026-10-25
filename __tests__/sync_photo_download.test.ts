jest.mock('../src/sync/supabase', () => ({ supabase: () => { throw new Error('sem rede'); }, isSupabaseConfigured: () => true }));

import { contexts, encodeBase64, newVaultKey, sealJson, setRandomSource } from '../src/sync/crypto';
import { EMPTY_CURSOR, RemoteRecord } from '../src/sync/model';
import { blobToBytes } from '../src/sync/remote';
import { PhotoIO, SyncRemote, runSync } from '../src/sync/runSync';

// eslint-disable-next-line @typescript-eslint/no-require-imports
beforeAll(() => setRandomSource(n => new Uint8Array(require('crypto').randomBytes(n))));

const VAULT = '55555555-5555-4555-8555-555555555555';

describe('blobToBytes', () => {
  it('lê pelo FileReader quando o Blob não tem arrayBuffer (como no React Native)', async () => {
    const original = (globalThis as { FileReader?: unknown }).FileReader;
    class FakeReader {
      result: string | null = null;
      error: Error | null = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      readAsDataURL() {
        this.result = 'data:application/octet-stream;base64,' + encodeBase64(Uint8Array.of(1, 2, 3, 250));
        this.onload?.();
      }
    }
    (globalThis as { FileReader?: unknown }).FileReader = FakeReader;
    try {
      const rnBlob = { size: 4, type: 'application/octet-stream' } as unknown as Blob; // sem arrayBuffer()
      expect(Array.from(await blobToBytes(rnBlob))).toEqual([1, 2, 3, 250]);
    } finally {
      (globalThis as { FileReader?: unknown }).FileReader = original;
    }
  });

  it('usa arrayBuffer quando existe', async () => {
    const blob = { arrayBuffer: async () => new Uint8Array([9, 8]).buffer } as unknown as Blob;
    expect(Array.from(await blobToBytes(blob))).toEqual([9, 8]);
  });
});

describe('Foto que falha ao baixar', () => {
  it('não impede a conta de chegar; a foto fica para a próxima rodada', async () => {
    const key = newVaultKey();
    const doc = {
      documentType: 'BOLETO', issuer: 'ENEL', referenceMonth: '10/2026', cnpj: null, cpf: null, totalAmountCents: 18131,
      dueDate: '2026-11-10', boletoLine: null, ocrText: 'ENEL', createdAt: '2026-10-24T19:14:50.000Z',
      updatedAt: '2026-10-24T19:14:50.000Z', hasPhoto: true,
    };
    const rows: RemoteRecord[] = [{
      kind: 'document', id: 'd1', ciphertext: sealJson(key, doc, contexts.record(VAULT, 'd1', 'document')),
      deleted: false, auditNote: null, keyVersion: 1, updatedAt: '2026-10-24T19:14:51.000Z',
    }];
    const remote: SyncRemote = {
      pull: async () => rows,
      push: async () => {},
      getPhoto: async () => { throw new TypeError('undefined is not a function'); },
      putPhoto: async () => {},
      removePhoto: async () => {},
    };
    const photos: PhotoIO = { read: async () => null, write: async () => 'file://x.jpg', remove: async () => {} };
    const { commit, report } = await runSync({
      snapshot: { cursor: EMPTY_CURSOR, documents: [], learned: [], photoDue: {}, photoHave: {} },
      role: 'owner', vaultId: VAULT, key, keyVersion: 1, remote, photos,
    });
    expect(commit.contents.map(c => c.issuer)).toEqual(['ENEL']);
    expect(report.photosDown).toBe(0);
    expect(commit.meta['photoHave:d1']).toBeUndefined(); // não marcou como baixada: tenta de novo depois
  });
});
