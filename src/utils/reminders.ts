import { SavedDocument } from '../db/database';
import { ScheduledReminder } from './notifications';

export type ReminderItem = ScheduledReminder & { doc: SavedDocument | null };

// Os lembretes de todos os perfis ficam juntos no sistema do celular, mas cada perfil tem seu banco.
// Mostra so os do perfil ativo; lembretes antigos (sem perfil gravado) entram se a conta existe neste perfil.
//
// Para evitar poluicao visual (uma conta com config 'daily' gera N lembretes por conta),
// agrupa por docId e mantem apenas o proximo aviso de cada conta. Quando o proximo
// disparar, o seguinte aparece automaticamente.
export function remindersForProfile(
  reminders: ScheduledReminder[],
  profile: string,
  getDoc: (id: string) => SavedDocument | null,
): { items: ReminderItem[]; hiddenFromOtherProfiles: number } {
  const byDoc = new Map<string, ReminderItem>();
  let hidden = 0;
  for (const r of reminders) {
    if (r.profile && r.profile !== profile) {
      hidden++;
      continue;
    }
    const doc = r.docId ? getDoc(r.docId) : null;
    if (!r.profile && r.docId && !doc) {
      hidden++;
      continue;
    }
    const item: ReminderItem = { ...r, doc };
    const key = r.docId || r.identifier;
    const existing = byDoc.get(key);
    if (!existing) {
      byDoc.set(key, item);
    } else {
      const existingTime = existing.when?.getTime() ?? Infinity;
      const itemTime = item.when?.getTime() ?? Infinity;
      if (itemTime < existingTime) byDoc.set(key, item);
    }
  }
  const items = [...byDoc.values()].sort((a, b) => (a.when?.getTime() ?? 0) - (b.when?.getTime() ?? 0));
  return { items, hiddenFromOtherProfiles: hidden };
}
