import { generateCSV } from '../src/utils/export';

jest.mock('expo-sqlite', () => {
  const m = { execSync: jest.fn(), getFirstSync: jest.fn(), getAllSync: jest.fn(), runSync: jest.fn(), closeSync: jest.fn() };
  return { openDatabaseSync: jest.fn(() => m) };
});

describe('QA - CSV Escape', () => {
  it('deve escapar ; no emissor (Excel nao quebra)', () => {
    const doc: any = {
      id: '1', documentType: 'BOLETO', issuer: 'TESTE; COM PONTO E VIRGULA',
      referenceMonth: '10/2026', dueDate: '2026-11-10', totalAmountCents: 10000,
      cnpj: null, isPaid: 0, boletoLine: null, paymentDate: null, createdAt: '2026-01-01',
    };
    const csv = generateCSV([doc]);
    expect(csv).toContain('"TESTE; COM PONTO E VIRGULA"');
  });

  it('deve escapar aspas duplas', () => {
    const doc: any = {
      id: '1', documentType: 'BOLETO', issuer: 'EMPRESA COM ASPAS',
      referenceMonth: null, dueDate: null, totalAmountCents: null,
      cnpj: null, isPaid: 0, boletoLine: null, paymentDate: null, createdAt: '2026-01-01',
    };
    const csv = generateCSV([doc]);
    expect(csv).toContain('EMPRESA COM ASPAS');
  });
});
