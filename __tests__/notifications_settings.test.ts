import * as Notifications from 'expo-notifications';
import { scheduleDueDateReminder } from '../src/utils/notifications';
import { appSetting } from '../src/utils/perfil';

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  SchedulableTriggerInputTypes: { DATE: 'date' },
}));

jest.mock('../src/db/database', () => ({
  getCurrentProfile: jest.fn(() => 'yuri'),
}));

// Lembretes usam os ajustes do app (perfil único), não os da gaveta
jest.mock('../src/utils/perfil', () => ({ appSetting: jest.fn() }));

describe('QA Senior - Configuracoes de Notificacao', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('deve agendar UMA notificacao se a frequencia for "once"', async () => {
    (appSetting as jest.Mock).mockImplementation((key: string) => {
      if (key === 'notification_days_before') return '5';
      if (key === 'notification_frequency') return 'once';
      return key === 'notifications_enabled' ? 'true' : '';
    });

    // Vencimento no futuro
    await scheduleDueDateReminder('123', 'ENEL', '2026-12-10');
    
    // Deve ter agendado apenas 1 notificacao
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    // O perfil vai junto, para a tela de lembretes separar os perfis
    expect((Notifications.scheduleNotificationAsync as jest.Mock).mock.calls[0][0].content.data).toEqual({ docId: '123', profile: 'yuri' });
  });

  it('deve agendar MULTIPLAS notificacoes se a frequencia for "daily"', async () => {
    (appSetting as jest.Mock).mockImplementation((key: string) => {
      if (key === 'notification_days_before') return '3';
      if (key === 'notification_frequency') return 'daily';
      return key === 'notifications_enabled' ? 'true' : '';
    });

    await scheduleDueDateReminder('123', 'ENEL', '2026-12-10');
    
    // Se sao 3 dias, deve agendar no dia 7, 8 e 9 (3 notificacoes)
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(3);
  });

  it('deve ignorar notificacoes para datas que ja passaram', async () => {
    (appSetting as jest.Mock).mockImplementation((key: string) => {
      if (key === 'notification_days_before') return '5';
      if (key === 'notification_frequency') return 'once';
      return key === 'notifications_enabled' ? 'true' : '';
    });

    // Vencimento no passado
    await scheduleDueDateReminder('123', 'ENEL', '2020-01-01');
    
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });
});
