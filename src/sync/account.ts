// Fachada usada pelas telas de conta. É carregada sob demanda (import()), para que um APK
// antigo, sem os módulos nativos novos, mostre "atualize o app" em vez de fechar.
import { createRecoveryPhrase } from './crypto';
import { LoginCancelled, completeLogin, currentSession, signInWithGoogle, signInWithGoogleNative, signOut } from './auth';
import {
  IdentityState, forgetLocalIdentity, getIdentityState, getStoredPhrase, registerIdentity, restoreIdentity,
} from './identity';
import { isSupabaseConfigured } from './supabase';
import { readPhraseFromGoogle, savePhraseToGoogle } from './phraseBackup';

export type AccountStatus =
  | { kind: 'not-configured' }
  | { kind: 'signed-out' }
  | { kind: 'signed-in'; userId: string; email: string; identity: IdentityState };

export async function getAccountStatus(): Promise<AccountStatus> {
  if (!isSupabaseConfigured()) return { kind: 'not-configured' };
  const session = await currentSession();
  if (!session) return { kind: 'signed-out' };
  return {
    kind: 'signed-in',
    userId: session.user.id,
    email: session.user.email ?? '',
    identity: await getIdentityState(session.user.id),
  };
}

// Versão sem rede, para o selo da tela inicial: sessão salva e frase neste aparelho
export type LocalAccountStatus =
  | { kind: 'signed-out' }
  | { kind: 'signed-in'; email: string; hasPhrase: boolean };

export async function getLocalAccountStatus(): Promise<LocalAccountStatus> {
  if (!isSupabaseConfigured()) return { kind: 'signed-out' };
  const session = await currentSession();
  if (!session) return { kind: 'signed-out' };
  const phrase = await getStoredPhrase(session.user.id);
  return { kind: 'signed-in', email: session.user.email ?? '', hasPhrase: !!phrase };
}

// Tenta o login nativo do Android; se ele não estiver disponível (APK antigo, aparelho sem
// Google Play) ou falhar por outro motivo que não seja cancelamento, usa o navegador.
export async function login(): Promise<boolean> {
  try {
    await signInWithGoogleNative();
    return true;
  } catch (e) {
    if (e instanceof LoginCancelled) return false;
    console.warn('Login nativo indisponível; usando o navegador.', e);
    return (await signInWithGoogle()) !== null;
  }
}

// Usado pela tela auth-callback quando o Android reabre o app pelo link de retorno do login
export async function finishLogin(code: string): Promise<void> {
  await completeLogin(code);
}

// Sair remove a frase deste aparelho; entrar de novo vai pedir a frase
export async function logout(userId: string): Promise<void> {
  await forgetLocalIdentity(userId);
  await signOut();
}

export const newRecoveryPhrase = createRecoveryPhrase;
export const confirmNewPhrase = registerIdentity;
export const restoreFromPhrase = restoreIdentity;
export const readStoredPhrase = getStoredPhrase;
// Criação da frase pelo caminho recomendado: guarda nas senhas da conta Google antes de registrar
export { savePhraseToGoogle };

export type { IdentityState };

// Salva a frase deste celular nas senhas da conta Google. false = a pessoa recusou.
export async function backupPhraseToGoogle(userId: string, email: string): Promise<boolean> {
  const phrase = await getStoredPhrase(userId);
  if (!phrase) throw new Error('Este celular ainda não tem a frase de recuperação.');
  return savePhraseToGoogle(email, phrase);
}

// Celular novo: escolhe a frase nas senhas da conta Google. false = cancelou.
// restoreIdentity só aceita se a frase gerar a chave já cadastrada nesta conta.
export async function restoreFromGoogle(userId: string): Promise<boolean> {
  const phrase = await readPhraseFromGoogle();
  if (!phrase) return false;
  await restoreIdentity(userId, phrase);
  return true;
}

