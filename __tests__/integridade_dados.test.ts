jest.mock('expo-sqlite', () => {
  const dbMock = {
    execSync: jest.fn(),
    getFirstSync: jest.fn(),
    getAllSync: jest.fn(),
    runSync: jest.fn(),
    closeSync: jest.fn(),
  };
  return { openDatabaseSync: jest.fn(() => dbMock), __dbMock: dbMock };
});

import * as Notifications from 'expo-notifications';
import { initDatabase, generateId, saveDocument } from '../src/db/database';
import { cancelDueDateReminders, syncDueDateReminders } from '../src/utils/notifications';

const mockDb = (require('expo-sqlite') as any).__dbMock;
const execCalls = (): string[] => mockDb.execSync.mock.calls.map((c: any) => c[0]);

describe('Migracao versionada', () => {
  beforeEach(() => jest.clearAllMocks());

  it('recria documents com tipos corretos quando user_version = 0', () => {
    mockDb.getFirstSync.mockReturnValueOnce({ user_version: 0 });
    initDatabase();
    const migration = execCalls().find(sql => sql.includes('documents_v1'));
    expect(migration).toBeDefined();
    expect(migration).toContain('CAST(NULLIF(TRIM(totalAmountCents)');
    expect(migration).toContain('PRAGMA user_version = 1');
  });

  it('não migra de novo quando já está na versão atual', () => {
    mockDb.getFirstSync.mockReturnValueOnce({ user_version: 1 });
    initDatabase();
    expect(execCalls().some(sql => sql.includes('documents_v1'))).toBe(false);
  });

  it('colunas novas do ALTER TABLE usam INTEGER para valores numéricos', () => {
    mockDb.getFirstSync.mockReturnValueOnce({ user_version: 1 });
    initDatabase();
    expect(execCalls()).toContain('ALTER TABLE documents ADD COLUMN isPaid INTEGER DEFAULT 0;');
    expect(execCalls()).toContain('ALTER TABLE documents ADD COLUMN totalAmountCents INTEGER;');
  });

  it('faz ROLLBACK se a migração falhar', () => {
    mockDb.getFirstSync.mockReturnValueOnce({ user_version: 0 });
    mockDb.execSync.mockImplementation((sql: string) => {
      if (sql.includes('documents_v1')) throw new Error('disk full');
    });
    expect(() => initDatabase()).toThrow('disk full');
    expect(execCalls()).toContain('ROLLBACK;');
    mockDb.execSync.mockReset();
  });
});

describe('IDs únicos', () => {
  it('gera IDs distintos no mesmo milissegundo', () => {
    jest.spyOn(Date, 'now').mockReturnValue(1700000000000);
    const ids = new Set(Array.from({ length: 50 }, () => generateId()));
    expect(ids.size).toBe(50);
    jest.restoreAllMocks();
  });

  it('saveDocument usa o novo formato de ID', () => {
    const id = saveDocument('file:///a.jpg', '', {
      documentType: 'BOLETO', issuer: 'ENEL', referenceMonth: null, cnpj: null, cpf: null,
      totalAmountCents: 100, dueDate: null, boletoLine: null,
    });
    expect(id).toMatch(/^\d+-[a-z0-9]+$/);
  });
});

describe('Lembretes de vencimento', () => {
  const scheduled = [
    { identifier: 'n1', content: { data: { docId: 'A' } } },
    { identifier: 'n2', content: { data: { docId: 'B' } } },
    { identifier: 'n3', content: { data: { docId: 'A' } } },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    (Notifications.getAllScheduledNotificationsAsync as jest.Mock).mockResolvedValue(scheduled);
    mockDb.getFirstSync.mockReturnValue(null); // getSetting usa os padrões
  });

  it('cancela só os lembretes do documento', async () => {
    await cancelDueDateReminders('A');
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(2);
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('n1');
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('n3');
  });

  it('conta paga: cancela e não reagenda', async () => {
    await syncDueDateReminders({ id: 'A', issuer: 'ENEL', dueDate: '2099-12-10', isPaid: 1 });
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(2);
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('conta desmarcada como paga: reagenda', async () => {
    await syncDueDateReminders({ id: 'A', issuer: 'ENEL', dueDate: '2099-12-10', isPaid: 0 });
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
  });
});
