// Cópia da frase de recuperação no Gerenciador de Senhas do Google (Credential Manager).
// Fica nas senhas salvas da conta Google da pessoa, não no Supabase: o servidor do app
// continua sem conseguir ler as contas. Num celular novo, recupera com um toque.
import { isValidRecoveryPhrase } from './crypto';

type CredentialsManager = typeof import('react-native-credentials-manager');

// Carregada só na hora: num APK sem o módulo nativo, o require falha e a tela avisa
function credentials(): CredentialsManager {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('react-native-credentials-manager') as CredentialsManager;
}

export function phraseLabel(email: string): string {
  return `Frase de recuperação do Control (${email || 'conta'})`;
}

const isCancel = (e: unknown) => /cancel/i.test(e instanceof Error ? e.message : String(e));

// true se salvou; false se a pessoa recusou na janela do Android
export async function savePhraseToGoogle(email: string, phrase: string): Promise<boolean> {
  try {
    await credentials().signUpWithPassword({ username: phraseLabel(email), password: phrase });
    return true;
  } catch (e) {
    if (isCancel(e)) return false;
    throw e;
  }
}

// Abre as senhas salvas; devolve a frase escolhida, ou null se cancelou.
// Não confere a conta: quem chama valida com restoreIdentity (a frase precisa gerar a chave cadastrada).
export async function readPhraseFromGoogle(): Promise<string | null> {
  let picked: { password: string };
  try {
    picked = await credentials().signIn(['password'] as const, {});
  } catch (e) {
    if (isCancel(e)) return null;
    throw e;
  }
  if (!isValidRecoveryPhrase(picked.password)) {
    throw new Error('A senha escolhida não é uma frase de recuperação do Control.');
  }
  return picked.password;
}
