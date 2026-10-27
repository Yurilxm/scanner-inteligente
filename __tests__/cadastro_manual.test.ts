import { saveDocument } from '../src/db/database';

jest.mock('expo-sqlite', () => ({
  openDatabaseSync: jest.fn(() => ({
    closeSync: jest.fn(),
    execSync: jest.fn(),
    getFirstSync: jest.fn(),
    getAllSync: jest.fn(),
    runSync: jest.fn(),
  })),
}));

describe('Cadastro manual - conta sem comprovante', () => {
  it('saveDocument aceita CONTA com pixKey sem quebrar', () => {
    const fields = {
      documentType: 'CONTA' as const,
      issuer: 'Academia',
      referenceMonth: '11/2026',
      cnpj: null,
      cpf: null,
      totalAmountCents: 9900,
      dueDate: '2026-11-15',
      boletoLine: null,
      pixKey: 'chave@exemplo.com',
    };
    const id = saveDocument('', '', fields, null, 'anotacao');
    expect(id).toBeDefined();
    expect(typeof id).toBe('string');
  });

  it('saveDocument aceita CONTA sem pixKey (chave opcional)', () => {
    const fields = {
      documentType: 'CONTA' as const,
      issuer: 'Curso de ingles',
      referenceMonth: null,
      cnpj: null,
      cpf: null,
      totalAmountCents: 25000,
      dueDate: '2026-12-05',
      boletoLine: null,
    };
    const id = saveDocument('', '', fields);
    expect(id).toBeDefined();
  });

  it('saveDocument aceita CONTA ja paga (paymentDate)', () => {
    const fields = {
      documentType: 'CONTA' as const,
      issuer: 'Transporte',
      referenceMonth: null,
      cnpj: null,
      cpf: null,
      totalAmountCents: 15000,
      dueDate: '2026-11-10',
      boletoLine: null,
      pixKey: null,
    };
    const id = saveDocument('', '', fields, '2026-11-08', 'pago em dinheiro');
    expect(id).toBeDefined();
  });
});
