import * as SecureStore from 'expo-secure-store';
import './random';
import { Identity, encodeBase64, identityFromPhrase, isValidRecoveryPhrase, normalizePhrase } from './crypto';
import { supabase } from './supabase';

// A frase fica no chaveiro seguro do Android (protegido pelo hardware), só neste aparelho.
// No servidor vai apenas a chave PÚBLICA derivada dela.

const SECURE_OPTIONS = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
const phraseKey = (userId: string) => `control.phrase.${userId}`;

export type IdentityState =
  | 'needs-setup'    // conta nova: ainda não tem chave pública no servidor
  | 'needs-restore'  // conta já tem chave, mas este aparelho não tem a frase (celular novo)
  | 'ready';

async function serverPublicKey(userId: string): Promise<string | null> {
  const { data, error } = await supabase().from('user_keys').select('public_key').eq('user_id', userId).maybeSingle();
  if (error) throw new Error(`Não foi possível consultar a chave da conta: ${error.message}`);
  return data?.public_key ?? null;
}

export async function getIdentityState(userId: string): Promise<IdentityState> {
  const [remote, local] = await Promise.all([serverPublicKey(userId), SecureStore.getItemAsync(phraseKey(userId), SECURE_OPTIONS)]);
  if (!remote) return 'needs-setup';
  if (!local) return 'needs-restore';
  // Frase guardada que não gera a chave do servidor (ex.: conta trocada): pede de novo
  return encodeBase64(identityFromPhrase(local).publicKey) === remote ? 'ready' : 'needs-restore';
}

// Conta nova: cadastra a chave pública e guarda a frase neste aparelho
export async function registerIdentity(userId: string, phrase: string): Promise<void> {
  const normalized = normalizePhrase(phrase);
  const identity = identityFromPhrase(normalized);
  const { error } = await supabase().from('user_keys').insert({ user_id: userId, public_key: encodeBase64(identity.publicKey) });
  if (error) throw new Error(`Não foi possível registrar a chave: ${error.message}`);
  await SecureStore.setItemAsync(phraseKey(userId), normalized, SECURE_OPTIONS);
}

// Celular novo: só aceita a frase se ela gerar exatamente a chave já cadastrada na conta
export async function restoreIdentity(userId: string, phrase: string): Promise<void> {
  if (!isValidRecoveryPhrase(phrase)) throw new Error('Frase inválida. Confira as 12 palavras e a ordem.');
  const normalized = normalizePhrase(phrase);
  const remote = await serverPublicKey(userId);
  if (!remote) throw new Error('Esta conta ainda não tem frase de recuperação.');
  if (encodeBase64(identityFromPhrase(normalized).publicKey) !== remote) {
    throw new Error('Esta frase não pertence a esta conta.');
  }
  await SecureStore.setItemAsync(phraseKey(userId), normalized, SECURE_OPTIONS);
}

export async function getStoredPhrase(userId: string): Promise<string | null> {
  return SecureStore.getItemAsync(phraseKey(userId), SECURE_OPTIONS);
}

export async function loadIdentity(userId: string): Promise<Identity | null> {
  const phrase = await getStoredPhrase(userId);
  return phrase ? identityFromPhrase(phrase) : null;
}

// Ao sair da conta, a frase é removida deste aparelho (entrar de novo pede a frase)
export async function forgetLocalIdentity(userId: string): Promise<void> {
  await SecureStore.deleteItemAsync(phraseKey(userId), SECURE_OPTIONS);
}
