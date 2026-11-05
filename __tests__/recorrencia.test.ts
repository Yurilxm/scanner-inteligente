import * as SQLite from 'expo-sqlite';
import { duplicateDocumentForNextMonth } from '../src/db/database';

// Mock do SQLite com um objeto ÚNICO retornado em toda chamada.
// Isso evita o problema de hoisting do jest.mock (as const do mock não são
// hoisted; usar .mockReturnValue deixa o objeto disponível pra acessar de fora).
jest.mock('expo-sqlite', () => ({
  openDatabaseSync: jest.fn().mockReturnValue({
    closeSync: jest.fn(),
    execSync: jest.fn(),
    getFirstSync: jest.fn(),
    getAllSync: jest.fn(() => []),
    runSync: jest.fn(),
  }),
}));

// Acessa o MESMO objeto que o database.ts usa internamente
const mockDb = (SQLite.openDatabaseSync as jest.Mock)();
const mockGetFirstSync = mockDb.getFirstSync as jest.Mock;
const mockRunSync = mockDb.runSync as jest.Mock;

// Helper: monta um SavedDocument fake pra cada teste
function fakeDoc(overrides: Partial<any> = {}) {
  return {
    id: 'doc-original',
    imageUri: 'file://photo.jpg',
    documentType: 'BOLETO',
    issuer: 'Giga Mais',
    referenceMonth: '11/2026',
    cnpj: '07714104000107',
    cpf: null,
    totalAmountCents: 5806,
    dueDate: '2026-11-10',
    boletoLine: '3419109149066362785415999190000716260000005806',
    ocrText: 'texto OCR do boleto de outubro',
    pixKey: null,
    isPaid: 1,
    paymentDate: '2026-11-05',
    createdAt: '2026-11-01T10:00:00Z',
    observacao: null,
    ...overrides,
  };
}

// Ordem dos args do INSERT em saveDocument:
// [0]=SQL [1]=id [2]=imageUri [3]=documentType [4]=issuer [5]=referenceMonth
// [6]=cnpj [7]=cpf [8]=totalAmountCents [9]=dueDate [10]=boletoLine
// [11]=ocrText [12]=pixKey [13]=observacao [14]=isPaid [15]=paymentDate

describe('Recorrencia - duplicateDocumentForNextMonth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('cria copia com vencimento no mes seguinte (10/11 -> 10/12)', () => {
    mockGetFirstSync.mockReturnValue(fakeDoc());

    const newId = duplicateDocumentForNextMonth('doc-original');

    expect(newId).not.toBeNull();
    expect(typeof newId).toBe('string');
    expect(mockRunSync).toHaveBeenCalledTimes(1);

    const args = mockRunSync.mock.calls[0];
    expect(args[9]).toBe('2026-12-10');
    expect(args[5]).toBe('12/2026');
    expect(args[10]).toBeNull();
    expect(args[11]).toBeNull();
    expect(args[14]).toBe(0);
    expect(args[15]).toBeNull();
  });

  it('fevereiro nao bissexto: 31/01 -> 28/02', () => {
    mockGetFirstSync.mockReturnValue(fakeDoc({ dueDate: '2026-01-31' }));

    duplicateDocumentForNextMonth('doc-original');

    const args = mockRunSync.mock.calls[0];
    expect(args[9]).toBe('2026-02-28');
    expect(args[5]).toBe('02/2026');
  });

  it('dezembro -> janeiro do ano seguinte', () => {
    mockGetFirstSync.mockReturnValue(fakeDoc({ dueDate: '2026-12-10' }));

    duplicateDocumentForNextMonth('doc-original');

    const args = mockRunSync.mock.calls[0];
    expect(args[9]).toBe('2027-01-10');
    expect(args[5]).toBe('01/2027');
  });

  it('retorna null se a conta nao existe', () => {
    mockGetFirstSync.mockReturnValue(null);

    const result = duplicateDocumentForNextMonth('doc-inexistente');

    expect(result).toBeNull();
    expect(mockRunSync).not.toHaveBeenCalled();
  });

  it('retorna null se a conta nao tem vencimento', () => {
    mockGetFirstSync.mockReturnValue(fakeDoc({ dueDate: null }));

    const result = duplicateDocumentForNextMonth('doc-original');

    expect(result).toBeNull();
    expect(mockRunSync).not.toHaveBeenCalled();
  });

  it('preserva foto, cnpj e pixKey, mas limpa boletoLine e ocrText', () => {
    mockGetFirstSync.mockReturnValue(fakeDoc({ pixKey: 'chave@gigamais.com' }));

    duplicateDocumentForNextMonth('doc-original');

    const args = mockRunSync.mock.calls[0];
    expect(args[2]).toBe('file://photo.jpg');
    expect(args[6]).toBe('07714104000107');
    expect(args[12]).toBe('chave@gigamais.com');
    expect(args[10]).toBeNull();
    expect(args[11]).toBeNull();
  });
});
