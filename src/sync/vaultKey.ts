import * as SecureStore from 'expo-secure-store';
import { Keyring, decodeBase64, encodeBase64 } from './crypto';

// A chave do cofre fica no chaveiro do Android, junto com a versão dela e as chaves antigas
// (depois de uma troca de chave, os registros antigos continuam cifrados com a chave da época).
const OPTIONS = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
const storeKey = (userId: string, vaultId: string) => `control.vault.${userId}.${vaultId}`;

export type StoredVaultKey = { version: number; key: Uint8Array; previous?: Keyring };

export async function readVaultKey(userId: string, vaultId: string): Promise<StoredVaultKey | null> {
  const raw = await SecureStore.getItemAsync(storeKey(userId, vaultId), OPTIONS);
  if (!raw) return null;
  const parsed = JSON.parse(raw) as { version?: number; key?: string; previous?: Record<string, string> };
  if (!parsed.key || typeof parsed.version !== 'number') return null;
  const previous: Keyring = {};
  for (const [version, key] of Object.entries(parsed.previous ?? {})) previous[Number(version)] = decodeBase64(key);
  return { version: parsed.version, key: decodeBase64(parsed.key), previous };
}

export async function saveVaultKey(userId: string, vaultId: string, stored: StoredVaultKey): Promise<void> {
  const previous: Record<string, string> = {};
  for (const [version, key] of Object.entries(stored.previous ?? {})) previous[version] = encodeBase64(key);
  const raw = JSON.stringify({ version: stored.version, key: encodeBase64(stored.key), previous });
  await SecureStore.setItemAsync(storeKey(userId, vaultId), raw, OPTIONS);
}

export async function forgetVaultKey(userId: string, vaultId: string): Promise<void> {
  await SecureStore.deleteItemAsync(storeKey(userId, vaultId), OPTIONS);
}

// Todas as chaves conhecidas do cofre, pela versão
export function allKeys(stored: StoredVaultKey): Keyring {
  return { ...(stored.previous ?? {}), [stored.version]: stored.key };
}
