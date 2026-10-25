// Chaveiro do Android em memória
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'x',
    getItemAsync: jest.fn(async (k: string) => store.get(k) ?? null),
    setItemAsync: jest.fn(async (k: string, v: string) => { store.set(k, v); }),
    deleteItemAsync: jest.fn(async (k: string) => { store.delete(k); }),
    __store: store,
  };
});
jest.mock('expo-crypto', () => ({
  getRandomBytes: (n: number) => new Uint8Array(require('crypto').randomBytes(n)),
}));
jest.mock('../src/sync/auth', () => ({ currentSession: jest.fn() }));
jest.mock('../src/sync/photos', () => ({ photos: {} }));
jest.mock('../src/sync/remote', () => ({
  remote: { getMember: jest.fn(), getVault: jest.fn() },
}));

import { contexts, createRecoveryPhrase, encodeBase64, identityFromPhrase, newVaultKey, sealKeyring, wrapKey } from '../src/sync/crypto';
import { openVault } from '../src/sync/engine';
import { remote } from '../src/sync/remote';
import { readVaultKey, saveVaultKey } from '../src/sync/vaultKey';

const VAULT = '44444444-4444-4444-8444-444444444444';
const USER = 'u-maria';
const getMember = remote.getMember as jest.Mock;
const getVault = remote.getVault as jest.Mock;

describe('openVault', () => {
  const identity = identityFromPhrase(createRecoveryPhrase());
  const member = (key: Uint8Array, version: number) => ({
    role: 'payer' as const,
    keyVersion: version,
    wrappedKey: wrapKey(identity.publicKey, key, contexts.vaultKey(VAULT, USER, version)),
  });

  beforeEach(() => {
    getMember.mockReset();
    getVault.mockReset();
  });

  it('depois de uma troca de chave, guarda a nova e as antigas do chaveiro', async () => {
    const key1 = newVaultKey();
    const key2 = newVaultKey();
    await saveVaultKey(USER, VAULT, { version: 1, key: key1 });
    getMember.mockResolvedValue(member(key2, 2));
    getVault.mockResolvedValue({ keyVersion: 2, encryptedMeta: null, keyring: sealKeyring(key2, { 1: key1 }, contexts.keyring(VAULT, 2)) });

    const opened = await openVault(USER, VAULT, identity);
    expect(opened?.role).toBe('payer');
    expect(opened?.stored.version).toBe(2);
    expect(encodeBase64(opened!.stored.key)).toBe(encodeBase64(key2));
    expect(encodeBase64(opened!.stored.previous![1])).toBe(encodeBase64(key1));

    const saved = await readVaultKey(USER, VAULT);
    expect(saved?.version).toBe(2);
    expect(encodeBase64(saved!.previous![1])).toBe(encodeBase64(key1));
  });

  it('com a chave em dia, não consulta o servidor de novo', async () => {
    const key = newVaultKey();
    await saveVaultKey(USER, VAULT, { version: 3, key });
    getMember.mockResolvedValue(member(key, 3));
    const opened = await openVault(USER, VAULT, identity);
    expect(opened?.stored.version).toBe(3);
    expect(getVault).not.toHaveBeenCalled();
  });

  it('quem foi removido recebe null', async () => {
    getMember.mockResolvedValue(null);
    await expect(openVault(USER, VAULT, identity)).resolves.toBeNull();
  });
});
