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

import { render, fireEvent } from '@testing-library/react-native';
import { brDateToISO, centsToDecimal, formatBRL, isoToBR, maskDateInput, todayISO } from '../src/utils/format';
import { ReclassifyModal, suggestKeyword } from '../src/components/ReclassifyModal';

const mockDb = (require('expo-sqlite') as any).__dbMock;

describe('format', () => {
  it('formata centavos', () => {
    expect(formatBRL(123456)).toBe('R$ 1.234,56');
    expect(formatBRL(100000000)).toBe('R$ 1.000.000,00');
    expect(formatBRL(99)).toBe('R$ 0,99');
    expect(formatBRL(null)).toBe('');
    expect(centsToDecimal(123456)).toBe('1234,56');
    expect(centsToDecimal(null)).toBe('');
  });

  it('converte datas ISO <-> pt-BR', () => {
    expect(isoToBR('2026-11-10')).toBe('10/11/2026');
    expect(isoToBR(null)).toBe('');
    expect(brDateToISO('10/11/2026')).toBe('2026-11-10');
    expect(brDateToISO('1/2/26')).toBe('2026-02-01');
  });

  it('rejeita datas que não existem ou mal formadas', () => {
    expect(brDateToISO('31/02/2026')).toBeNull();
    expect(brDateToISO('10/13/2026')).toBeNull();
    expect(brDateToISO('10-11-2026')).toBeNull();
    expect(brDateToISO('aa/bb/cccc')).toBeNull();
    expect(brDateToISO('')).toBeNull();
  });

  it('todayISO usa o fuso local, não UTC', () => {
    // 23h do dia 10 no horário local
    expect(todayISO(new Date(2026, 10, 10, 23, 30))).toBe('2026-11-10');
  });

  it('mascara a digitação da data', () => {
    expect(maskDateInput('1011')).toBe('10/11');
    expect(maskDateInput('10112026')).toBe('10/11/2026');
    expect(maskDateInput('10/11/20269')).toBe('10/11/2026');
  });
});

describe('ReclassifyModal', () => {
  beforeEach(() => jest.clearAllMocks());

  it('sugere a palavra já aprendida para a categoria', () => {
    mockDb.getFirstSync.mockReturnValueOnce({ pattern: 'cisne branco' });
    expect(suggestKeyword('CONDOMINIO', 'qualquer texto')).toBe('CISNE BRANCO');
  });

  it('sem aprendizado, sugere pelo beneficiário', () => {
    mockDb.getFirstSync.mockReturnValueOnce(null);
    expect(suggestKeyword('', 'Beneficiario: PROLAGOS SA')).toBe('PROLAGOS');
  });

  it('aprende o padrão e devolve a categoria em maiúsculas', async () => {
    mockDb.getFirstSync.mockReturnValue(null);
    const onSaved = jest.fn();
    const { getByText, getByPlaceholderText } = await render(
      <ReclassifyModal initialCategory="" ocrText="Beneficiario: PROLAGOS SA" onSaved={onSaved} onCancel={jest.fn()} />
    );
    await fireEvent.changeText(getByPlaceholderText('Ex: CONDOMINIO CISNE BRANCO'), 'agua');
    await fireEvent.press(getByText('Aprender'));

    expect(onSaved).toHaveBeenCalledWith('AGUA');
    expect(mockDb.runSync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT OR REPLACE INTO learned_categories'),
      expect.any(String), 'prolagos', 'AGUA', expect.any(String)
    );
  });

  it('não salva com categoria vazia', async () => {
    mockDb.getFirstSync.mockReturnValue(null);
    const onSaved = jest.fn();
    const { getByText } = await render(
      <ReclassifyModal initialCategory="" ocrText="" onSaved={onSaved} onCancel={jest.fn()} />
    );
    await fireEvent.press(getByText('Aprender'));
    expect(onSaved).not.toHaveBeenCalled();
  });
});
