import { saveDocument } from '../src/db/database';
import * as SQLite from 'expo-sqlite';

jest.mock('expo-sqlite', () => ({
  openDatabaseSync: jest.fn(() => ({
    closeSync: jest.fn(),
    execSync: jest.fn(),
    getFirstSync: jest.fn(),
    getAllSync: jest.fn(() => [{ name: 'paymentDate' }]),
    runSync: jest.fn(),
  })),
}));

describe('Lógica de Salvamento', () => {
  it('salva um documento sem erros e retorna um ID', () => {
    const fields = {
      documentType: 'BOLETO', issuer: 'ENEL', referenceMonth: '10/2026',
      cnpj: '123', cpf: null, totalAmountCents: 1000, dueDate: '2026-11-10', boletoLine: null
    } as any;

    const id = saveDocument('file:///img.jpg', 'OCR text', fields, '2026-10-23');
    expect(id).toBeDefined();
    expect(typeof id).toBe('string');
  });
});
