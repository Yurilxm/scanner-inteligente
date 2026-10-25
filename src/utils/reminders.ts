import { SavedDocument } from '../db/database';
import { ScheduledReminder } from './notifications';

export type ReminderItem = ScheduledReminder & { doc: SavedDocument | null };

// Os lembretes de todos os perfis ficam juntos no sistema do celular, mas cada perfil tem seu banco.
// Mostra só os do perfil ativo; lembretes antigos (sem perfil gravado) entram se a conta existe neste perfil.
export function remindersForProfile(
  reminders: ScheduledReminder[],
  profile: string,
  getDoc: (id: string) => SavedDocument | null,
): { items: ReminderItem[]; hiddenFromOtherProfiles: number } {
  const items: ReminderItem[] = [];
  let hidden = 0;
  for (const r of reminders) {
    if (r.profile && r.profile !== profile) {
      hidden++;
      continue;
    }
    const doc = r.docId ? getDoc(r.docId) : null;
    if (!r.profile && r.docId && !doc) {
      hidden++; // conta de outro perfil (ou removida antes do cancelamento automático existir)
      continue;
    }
    items.push({ ...r, doc });
  }
  return { items, hiddenFromOtherProfiles: hidden };
}
