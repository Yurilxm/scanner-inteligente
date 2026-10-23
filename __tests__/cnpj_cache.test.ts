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

import { getCachedCNPJ, saveCachedCNPJ } from '../src/db/database';

const mockDb = (require('expo-sqlite') as any).__dbMock;

describe('QA Senior - Cache de CNPJ', () => {
  beforeEach(() => jest.clearAllMocks());

  it('deve retornar null se o CNPJ nao estiver no cache', () => {
    mockDb.getFirstSync.mockReturnValueOnce(null);
    expect(getCachedCNPJ('34185306000181')).toBeNull();
  });

  it('deve retornar dados do cache se o CNPJ existir e for recente', () => {
    mockDb.getFirstSync.mockReturnValueOnce({
      razao_social: 'ANTA RES EDUCACIONAL S.A.',
      cnae_fiscal: '8531700',
      cnae_descricao: 'Educacao superior',
      categoria: 'FACULDADE',
      fetchedAt: new Date().toISOString(),
    });
    const result = getCachedCNPJ('34185306000181');
    expect(result?.categoria).toBe('FACULDADE');
    expect(result?.razao_social).toBe('ANTA RES EDUCACIONAL S.A.');
  });

  it('deve retornar null se o cache estiver expirado (mais de 30 dias)', () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 31);
    mockDb.getFirstSync.mockReturnValueOnce({
      razao_social: 'ANTIGA LTDA',
      cnae_fiscal: '1234567',
      cnae_descricao: 'Teste',
      categoria: 'OUTROS',
      fetchedAt: oldDate.toISOString(),
    });
    expect(getCachedCNPJ('34185306000181')).toBeNull();
  });

  it('deve salvar CNPJ no cache com INSERT OR REPLACE', () => {
    saveCachedCNPJ('34.185.306/0001-81', 'ANTA RES EDUCACIONAL S.A.', '8531700', 'Educacao superior', 'FACULDADE');
    expect(mockDb.runSync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT OR REPLACE INTO cnpj_cache'),
      '34185306000181',
      'ANTA RES EDUCACIONAL S.A.',
      '8531700',
      'Educacao superior',
      'FACULDADE',
      expect.any(String)
    );
  });
});
