jest.mock('expo-sqlite', () => {
  const dbMock = {
    execSync: jest.fn(),
    getFirstSync: jest.fn(),
    getAllSync: jest.fn(),
    runSync: jest.fn(),
    closeSync: jest.fn(),
  };
  return {
    openDatabaseSync: jest.fn(() => dbMock),
    __dbMock: dbMock,
  };
});

import { initDatabase, getSetting, setSetting, saveLearnedCategory } from '../src/db/database';

const mockDb = (require('expo-sqlite') as any).__dbMock;

describe('QA Senior - Migracao e Tabelas Novas', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('deve criar as tabelas settings e learned_categories na inicializacao', () => {
    initDatabase();
    const execCalls = mockDb.execSync.mock.calls.map((c: any) => c[0]);
    expect(execCalls.some((sql: string) => sql.includes('CREATE TABLE IF NOT EXISTS documents'))).toBe(true);
    expect(execCalls.some((sql: string) => sql.includes('CREATE TABLE IF NOT EXISTS settings'))).toBe(true);
    expect(execCalls.some((sql: string) => sql.includes('CREATE TABLE IF NOT EXISTS learned_categories'))).toBe(true);
  });

  it('deve retornar o valor padrao se a tabela settings estiver vazia', () => {
    mockDb.getFirstSync.mockReturnValueOnce(null);
    expect(getSetting('notification_days_before', '5')).toBe('5');
  });

  it('deve retornar o valor padrao se a tabela settings der erro', () => {
    mockDb.getFirstSync.mockImplementationOnce(() => { throw new Error('no such table'); });
    expect(getSetting('notification_days_before', '5')).toBe('5');
  });

  it('deve salvar settings usando INSERT OR REPLACE', () => {
    setSetting('notification_days_before', '3');
    expect(mockDb.runSync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT OR REPLACE INTO settings'),
      'notification_days_before',
      '3'
    );
  });

  it('deve normalizar a palavra-chave antes de salvar (sem acento, minusculo)', () => {
    saveLearnedCategory('Condomínio Cisne Branco', 'CONDOMINIO');
    expect(mockDb.runSync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO learned_categories'),
      expect.any(String),
      'condominio cisne branco',
      'CONDOMINIO',
      expect.any(String),
      expect.any(String)
    );
  });

  it('deve ignorar palavras-chave muito curtas (menos de 3 letras)', () => {
    saveLearnedCategory('ab', 'TESTE');
    expect(mockDb.runSync).not.toHaveBeenCalled();
  });
});
