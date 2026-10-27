import * as Notifications from 'expo-notifications';

const mockAppSetting = jest.fn();
jest.mock('../src/utils/perfil', () => ({ appSetting: (k: string) => mockAppSetting(k) }));
jest.mock('../src/db/profiles', () => ({ listProfiles: jest.fn(() => [{ id: 'p1', name: 'Meu' }]) }));
jest.mock('../src/db/database', () => ({ getCurrentProfile: () => 'p1' }));
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  requestPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  setNotificationChannelAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(async () => 'id'),
  getAllScheduledNotificationsAsync: jest.fn(async () => []),
  cancelScheduledNotificationAsync: jest.fn(),
  AndroidImportance: { MAX: 4 },
  SchedulableTriggerInputTypes: { DATE: 'date', TIME_INTERVAL: 'timeInterval' },
}));

import { scheduleDueDateReminder } from '../src/utils/notifications';

const mockSchedule = Notifications.scheduleNotificationAsync as jest.Mock;

describe('scheduleDueDateReminder (janela de agendamento)', () => {
  const baseNow = new Date('2026-10-27T01:34:00').getTime();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Date, 'now').mockReturnValue(baseNow);
    mockAppSetting.mockImplementation((key: string) => {
      if (key === 'notifications_enabled') return 'true';
      if (key === 'notification_days_before') return '5';
      if (key === 'notification_frequency') return 'once';
      return '';
    });
  });

  afterEach(() => jest.restoreAllMocks());

  it('once com janela no futuro: agenda 1', async () => {
    // due 2026-11-30, 5 dias antes = 2026-11-25 > hoje (27/10)
    const ok = await scheduleDueDateReminder('doc1', 'Academia', '2026-11-30');
    expect(ok).toBe(true);
    expect(mockSchedule).toHaveBeenCalledTimes(1);
  });

  it('once com janela ja passada mas vencimento futuro: catch-up agenda 1', async () => {
    // due 2026-10-30, 5 dias antes = 2026-10-25 < hoje (27/10). Catch-up = 28/10 9h.
    const ok = await scheduleDueDateReminder('doc1', 'Academia', '2026-10-30');
    expect(ok).toBe(true);
    expect(mockSchedule).toHaveBeenCalledTimes(1);
  });

  it('vencimento no passado: nao agenda e retorna false', async () => {
    // due 2026-10-20 < hoje (27/10)
    const ok = await scheduleDueDateReminder('doc1', 'Academia', '2026-10-20');
    expect(ok).toBe(false);
    expect(mockSchedule).not.toHaveBeenCalled();
  });

  it('notificacoes desligadas: nao agenda e retorna false', async () => {
    mockAppSetting.mockImplementation((key: string) => {
      if (key === 'notifications_enabled') return 'false';
      if (key === 'notification_days_before') return '5';
      if (key === 'notification_frequency') return 'once';
      return '';
    });
    const ok = await scheduleDueDateReminder('doc1', 'Academia', '2026-11-30');
    expect(ok).toBe(false);
    expect(mockSchedule).not.toHaveBeenCalled();
  });

  it('daily com varios dias no futuro: agenda multiplas', async () => {
    mockAppSetting.mockImplementation((key: string) => {
      if (key === 'notifications_enabled') return 'true';
      if (key === 'notification_days_before') return '5';
      if (key === 'notification_frequency') return 'daily';
      return '';
    });
    // due 2026-11-30, daily de 25/11 a 29/11 (todos futuros)
    const ok = await scheduleDueDateReminder('doc1', 'Academia', '2026-11-30');
    expect(ok).toBe(true);
    expect(mockSchedule).toHaveBeenCalledTimes(5);
  });

  it('daily com todos os dias passados mas vencimento futuro: catch-up agenda 1', async () => {
    // Avanca "hoje" para 29/10 10:00, DEPOIS das 9h de todos os dias da janela
    // (25, 26, 27, 28, 29/10 as 9h ja passaram). Catch-up dispara 30/10 9h.
    jest.spyOn(Date, 'now').mockReturnValue(new Date('2026-10-29T10:00:00').getTime());
    mockAppSetting.mockImplementation((key: string) => {
      if (key === 'notifications_enabled') return 'true';
      if (key === 'notification_days_before') return '5';
      if (key === 'notification_frequency') return 'daily';
      return '';
    });
    const ok = await scheduleDueDateReminder('doc1', 'Academia', '2026-10-30');
    expect(ok).toBe(true);
    expect(mockSchedule).toHaveBeenCalledTimes(1);
  });
});
