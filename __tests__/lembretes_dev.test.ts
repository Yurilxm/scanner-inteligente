jest.mock('expo-sqlite', () => {
  const m = { execSync: jest.fn(), getFirstSync: jest.fn(), getAllSync: jest.fn(), runSync: jest.fn(), closeSync: jest.fn() };
  return { openDatabaseSync: jest.fn(() => m) };
});

import * as Notifications from 'expo-notifications';
import { listScheduledReminders, scheduleTestReminder } from '../src/utils/notifications';

describe('Ferramentas de lembrete (dev)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('agenda o lembrete de teste por intervalo de segundos', async () => {
    await scheduleTestReminder(10);
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({ trigger: { type: 'timeInterval', seconds: 10 } })
    );
  });

  it('falha com mensagem clara se a permissão for negada', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValueOnce({ status: 'denied' });
    (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValueOnce({ status: 'denied' });
    await expect(scheduleTestReminder()).rejects.toThrow('Permissao de notificacao negada.');
  });

  it('lista os agendados em ordem de data, aceitando os formatos de cada plataforma', async () => {
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValueOnce([
      { identifier: 'b', content: { body: 'segundo' }, trigger: { type: 'date', value: new Date(2026, 10, 2, 9).getTime() } },
      { identifier: 'a', content: { body: 'primeiro' }, trigger: { type: 'date', date: new Date(2026, 9, 25, 9) } },
      { identifier: 'c', content: { body: 'sem data' }, trigger: { type: 'timeInterval', seconds: 10 } },
    ]);
    const list = await listScheduledReminders();
    expect(list.map(r => r.body)).toEqual(['sem data', 'primeiro', 'segundo']);
    expect(list[1].when).toEqual(new Date(2026, 9, 25, 9));
    expect(list[0].when).toBeNull();
  });
});
