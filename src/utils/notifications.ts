import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { getSetting } from '../db/database';

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
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#00d4ff',
    });
  }
  return true;
}

export async function scheduleDueDateReminder(docId: string, issuer: string, dueDate: string) {
  if (!dueDate) return;
  const [year, month, day] = dueDate.split('-').map(Number);
  const due = new Date(year, month - 1, day);
  
  const daysBefore = parseInt(getSetting('notification_days_before', '5'), 10) || 5;
  const frequency = getSetting('notification_frequency', 'once');
  
  if (frequency === 'once') {
    const reminderDate = new Date(due);
    reminderDate.setDate(reminderDate.getDate() - daysBefore);
    reminderDate.setHours(9, 0, 0, 0);
    
    if (reminderDate.getTime() <= Date.now()) return;

    await Notifications.scheduleNotificationAsync({
      content: {
        title: '⏰ Conta a Vencer!',
        body: `A conta ${issuer} vence em ${daysBefore} dias (${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}).`,
        data: { docId },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: reminderDate },
    });
  } else {
    // Daily: agenda uma notificação para cada dia dos últimos N dias
    for (let i = daysBefore; i >= 1; i--) {
      const reminderDate = new Date(due);
      reminderDate.setDate(reminderDate.getDate() - i);
      reminderDate.setHours(9, 0, 0, 0);
      
      if (reminderDate.getTime() <= Date.now()) continue;

      await Notifications.scheduleNotificationAsync({
        content: {
          title: '⏰ Conta a Vencer!',
          body: `Faltam ${i} dias para o vencimento da conta ${issuer} (${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}).`,
          data: { docId },
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: reminderDate },
      });
    }
  }
}
