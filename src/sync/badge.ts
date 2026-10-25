// Estado do selo da conta na tela inicial. Puro, para testar sem login nem banco.
import type { LocalAccountStatus } from './account';

export type AccountBadgeState = 'loading' | 'signed-out' | 'pending' | 'synced';

// "synced": conectado e com a frase neste celular (a conta está pronta para sincronizar).
// "pending": conectado, mas sem a frase aqui — nada sincroniza até recuperá-la.
export function accountBadgeState(status: LocalAccountStatus | null): AccountBadgeState {
  if (!status) return 'loading';
  if (status.kind === 'signed-out') return 'signed-out';
  return status.hasPhrase ? 'synced' : 'pending';
}
