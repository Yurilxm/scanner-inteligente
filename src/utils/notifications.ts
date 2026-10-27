import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { Platform } from 'react-native';
import { getCurrentProfile } from '../db/database';
import { appSetting } from './perfil';
import { listProfiles } from '../db/profiles';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function requestNotificationPermissions() {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') return false;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Lembretes de Vencimento',
      importance: AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#00d4ff',
    });
  }
  return true;
}

export async function cancelDueDateReminders(docId: string) {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const mine = scheduled.filter(n => n.content.data?.docId === docId);
  await Promise.all(mine.map(n => Notifications.cancelScheduledNotificationAsync(n.identifier)));
}

// Ao excluir um perfil: cancela os lembretes dele (inclusive os antigos, sem perfil gravado, pelas contas)
export async function cancelProfileReminders(profileId: string, docIds: string[]) {
  const ids = new Set(docIds);
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const theirs = scheduled.filter(n => {
    const data = (n.content.data ?? {}) as Record<string, unknown>;
    return data.profile === profileId || (!data.profile && typeof data.docId === 'string' && ids.has(data.docId));
  });
  await Promise.all(theirs.map(n => Notifications.cancelScheduledNotificationAsync(n.identifier)));
}

// Cancela os lembretes do documento e reagenda só se ainda estiver pendente
export async function syncDueDateReminders(doc: { id: string; issuer: string | null; dueDate: string | null; isPaid: number }) {
  await cancelDueDateReminders(doc.id);
  if (doc.isPaid !== 1 && doc.issuer && doc.dueDate) {
    await scheduleDueDateReminder(doc.id, doc.issuer, doc.dueDate);
  }
}

// Com mais de uma gaveta, o aviso diz de qual é a conta
function reminderTitle(profileId: string): string {
  const profiles = listProfiles();
  const me = profiles.find(p => p.id === profileId);
  return profiles.length > 1 && me ? `⏰ Conta a vencer · ${me.name}` : '⏰ Conta a Vencer!';
}

// profileId: a gaveta da conta (padrão: a aberta; ao mover uma conta, a gaveta de destino)
export async function scheduleDueDateReminder(
  docId: string,
  issuer: string,
  dueDate: string,
  profileId = getCurrentProfile(),
): Promise<boolean> {
  if (!dueDate) return false;
  if (appSetting('notifications_enabled') !== 'true') return false;

  const [year, month, day] = dueDate.split('-').map(Number);
  const due = new Date(year, month - 1, day);
  due.setHours(23, 59, 59, 999);

  if (due.getTime() <= Date.now()) return false;

  const daysBefore = parseInt(appSetting('notification_days_before'), 10) || 5;
  const frequency = appSetting('notification_frequency');
  const dueStr = `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;

  const scheduled: Date[] = [];

  if (frequency === 'once') {
    const reminderDate = new Date(due);
    reminderDate.setDate(reminderDate.getDate() - daysBefore);
    reminderDate.setHours(9, 0, 0, 0);
    if (reminderDate.getTime() > Date.now()) scheduled.push(reminderDate);
  } else {
    for (let i = daysBefore; i >= 1; i--) {
      const reminderDate = new Date(due);
      reminderDate.setDate(reminderDate.getDate() - i);
      reminderDate.setHours(9, 0, 0, 0);
      if (reminderDate.getTime() > Date.now()) scheduled.push(reminderDate);
    }
  }

  // Catch-up: janela de "X dias antes" ja passou mas vencimento futuro.
  // Agenda pelo menos 1 aviso: hoje as 9h (se ainda nao passou) ou amanha as 9h.
  if (scheduled.length === 0) {
    const catchup = new Date();
    catchup.setHours(9, 0, 0, 0);
    if (catchup.getTime() <= Date.now()) catchup.setDate(catchup.getDate() + 1);
    if (catchup.getTime() < due.getTime()) scheduled.push(catchup);
  }

  if (scheduled.length === 0) return false;

  for (const when of scheduled) {
    const dueDay = new Date(year, month - 1, day).getTime();
    const whenDay = new Date(when.getFullYear(), when.getMonth(), when.getDate()).getTime();
    const daysLeft = Math.max(0, Math.round((dueDay - whenDay) / (24 * 60 * 60 * 1000)));
    const body = daysLeft === 0
      ? `A conta ${issuer} vence hoje (${dueStr}).`
      : daysLeft === 1
      ? `A conta ${issuer} vence amanha (${dueStr}).`
      : `Faltam ${daysLeft} dias para o vencimento da conta ${issuer} (${dueStr}).`;

    await Notifications.scheduleNotificationAsync({
      content: {
        title: reminderTitle(profileId),
        body,
        data: { docId, profile: profileId },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when },
    });
  }

  return true;
}

// ---- Ferramentas de desenvolvimento (usadas só em __DEV__ nas Configurações) ----

// Dispara um lembrete de teste em poucos segundos, pelo mesmo canal dos lembretes reais
export async function scheduleTestReminder(seconds = 10) {
  if (!(await requestNotificationPermissions())) throw new Error('Permissao de notificacao negada.');
  await Notifications.scheduleNotificationAsync({
    content: { title: '⏰ Conta a Vencer! (teste)', body: `Lembrete de teste do Control, disparado ${seconds}s apos o agendamento.`, data: { test: true } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds },
  });
}

// A data agendada volta em formatos diferentes conforme a plataforma (date, value, timestamp)
function scheduledDate(trigger: unknown): Date | null {
  const t = trigger as Record<string, unknown> | null;
  const raw = t?.date ?? t?.value ?? t?.timestamp;
  if (raw instanceof Date) return raw;
  if (typeof raw === 'number' || typeof raw === 'string') {
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export type ScheduledReminder = {
  identifier: string;
  when: Date | null;
  title: string;
  body: string;
  docId: string | null;
  profile: string | null; // null em lembretes criados antes de o perfil ser gravado
};

export async function listScheduledReminders(): Promise<ScheduledReminder[]> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  return scheduled
    .map(n => {
      const data = (n.content.data ?? {}) as Record<string, unknown>;
      return {
        identifier: n.identifier,
        when: scheduledDate(n.trigger),
        title: n.content.title ?? '',
        body: n.content.body ?? '',
        docId: typeof data.docId === 'string' ? data.docId : null,
        profile: typeof data.profile === 'string' ? data.profile : null,
      };
    })
    .sort((a, b) => (a.when?.getTime() ?? 0) - (b.when?.getTime() ?? 0));
}

// Aviso imediato (novidades de uma gaveta compartilhada). Sem permissão, simplesmente não aparece.
export async function notifyNow(title: string, body: string, data: Record<string, string> = {}) {
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title, body, data: { kind: 'gaveta', ...data } },
      trigger: null,
    });
  } catch (e) {
    console.warn('Aviso da gaveta', e);
  }
}
