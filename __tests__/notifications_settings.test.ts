import * as Notifications from 'expo-notifications';
import { scheduleDueDateReminder } from '../src/utils/notifications';
import { getSetting } from '../src/db/database';

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  SchedulableTriggerInputTypes: { DATE: 'date' },
}));

jest.mock('../src/db/database', () => ({
  getSetting: jest.fn(),
}));

describe('QA Senior - Configuracoes de Notificacao', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('deve agendar UMA notificacao se a frequencia for "once"', async () => {
    (getSetting as jest.Mock).mockImplementation((key, def) => {
      if (key === 'notification_days_before') return '5';
      if (key === 'notification_frequency') return 'once';
      return def;
    });

    // Vencimento no futuro
    await scheduleDueDateReminder('123', 'ENEL', '2026-12-10');
    
    // Deve ter agendado apenas 1 notificacao
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
  });

  it('deve agendar MULTIPLAS notificacoes se a frequencia for "daily"', async () => {
    (getSetting as jest.Mock).mockImplementation((key, def) => {
      if (key === 'notification_days_before') return '3';
      if (key === 'notification_frequency') return 'daily';
      return def;
    });

    await scheduleDueDateReminder('123', 'ENEL', '2026-12-10');
    
    // Se sao 3 dias, deve agendar no dia 7, 8 e 9 (3 notificacoes)
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(3);
  });

  it('deve ignorar notificacoes para datas que ja passaram', async () => {
    (getSetting as jest.Mock).mockImplementation((key, def) => {
      if (key === 'notification_days_before') return '5';
      if (key === 'notification_frequency') return 'once';
      return def;
    });

    // Vencimento no passado
    await scheduleDueDateReminder('123', 'ENEL', '2020-01-01');
    
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });
});
