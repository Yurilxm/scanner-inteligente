// Nomes e explicações dos papéis de uma gaveta compartilhada, para as telas.
import type { SyncRole } from './model';

export type GuestRole = Exclude<SyncRole, 'owner'>;

export const ROLE_LABELS: Record<SyncRole, string> = {
  owner: 'Dono',
  editor: 'Editor',
  payer: 'Pagador',
  viewer: 'Visualizador',
};

export const ROLE_DESCRIPTIONS: Record<SyncRole, string> = {
  owner: 'Gerencia quem participa, além de tudo que o editor faz.',
  editor: 'Vê, adiciona, edita, exclui e marca contas como pagas.',
  payer: 'Vê as contas e marca como pagas.',
  viewer: 'Só vê as contas e quem pagou.',
};

export const ROLE_ICONS: Record<SyncRole, string> = {
  owner: 'crown-outline',
  editor: 'pencil-outline',
  payer: 'cash-check',
  viewer: 'eye-outline',
};

// Do mais permissivo ao mais restrito (ordem dos botões ao convidar)
export const GUEST_ROLES: GuestRole[] = ['editor', 'payer', 'viewer'];

// Nome de quem compartilhou a gaveta, guardado nas configurações do perfil dela
export const GAVETA_OWNER_SETTING = 'gaveta_owner';

export function roleLabel(role: string | null | undefined): string {
  return role && role in ROLE_LABELS ? ROLE_LABELS[role as SyncRole] : 'Membro';
}

// Quem participa da gaveta (cópia local, atualizada na sincronização, para a tela de Gavetas)
export const GAVETA_MEMBERS_SETTING = 'gaveta_members';
// Último evento do histórico já avisado (notificação de novidades)
export const GAVETA_ACTIVITY_SETTING = 'gaveta_activity_seen';

export type CachedMember = { name: string; role: SyncRole; me: boolean };

export function parseCachedMembers(raw: string): CachedMember[] {
  try {
    const list = JSON.parse(raw) as CachedMember[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

// "Compartilhada com Maria" / "com Maria e João" / "com Maria e mais 2"
export function sharedWithText(members: CachedMember[]): string | null {
  const others = members.filter(m => !m.me).map(m => m.name);
  if (others.length === 0) return null;
  if (others.length === 1) return `Compartilhada com ${others[0]}`;
  if (others.length === 2) return `Compartilhada com ${others[0]} e ${others[1]}`;
  return `Compartilhada com ${others[0]} e mais ${others.length - 1}`;
}

// Contas novas de outras pessoas: fila para revisar, as já revisadas e as já avisadas (por gaveta)
export const GAVETA_REVIEW_SETTING = 'gaveta_review';
export const GAVETA_REVIEWED_SETTING = 'gaveta_reviewed';
export const GAVETA_NOTIFIED_SETTING = 'gaveta_notified';
// Último erro de sincronização da gaveta (vazio = sincronizou bem)
export const GAVETA_SYNC_ERROR_SETTING = 'gaveta_sync_error';

export function parseIdList(raw: string): string[] {
  try {
    const list = JSON.parse(raw) as unknown;
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
