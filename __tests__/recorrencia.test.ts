import * as SQLite from 'expo-sqlite';
import { duplicateDocumentForNextMonth } from '../src/db/database';

jest.mock('expo-sqlite', () => ({
  openDatabaseSync: jest.fn().mockReturnValue({
    closeSync: jest.fn(),
    execSync: jest.fn(),
    getFirstSync: jest.fn(),
    getAllSync: jest.fn(() => []),
    runSync: jest.fn(),
  }),
}));

const mockDb = (SQLite.openDatabaseSync as jest.Mock)();
const mockGetFirstSync = mockDb.getFirstSync as jest.Mock;
const mockRunSync = mockDb.runSync as jest.Mock;

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
  beforeEach(() => jest.clearAllMocks());

  describe('vencimento e referencia', () => {
    it('mes comum: 10/11/2026 -> 10/12/2026', () => {
      mockGetFirstSync.mockReturnValue(fakeDoc());
      duplicateDocumentForNextMonth('doc-original');
      const args = mockRunSync.mock.calls[0];
      expect(args[9]).toBe('2026-12-10');
      expect(args[5]).toBe('12/2026');
    });

    it('fevereiro nao bissexto: 31/01/2026 -> 28/02/2026', () => {
      mockGetFirstSync.mockReturnValue(fakeDoc({ dueDate: '2026-01-31' }));
      duplicateDocumentForNextMonth('doc-original');
      const args = mockRunSync.mock.calls[0];
      expect(args[9]).toBe('2026-02-28');
      expect(args[5]).toBe('02/2026');
    });

    it('fevereiro bissexto: 31/01/2024 -> 29/02/2024', () => {
      mockGetFirstSync.mockReturnValue(fakeDoc({ dueDate: '2024-01-31' }));
      duplicateDocumentForNextMonth('doc-original');
      const args = mockRunSync.mock.calls[0];
      expect(args[9]).toBe('2024-02-29');
    });

    it('dezembro -> janeiro do ano seguinte: 10/12/2026 -> 10/01/2027', () => {
      mockGetFirstSync.mockReturnValue(fakeDoc({ dueDate: '2026-12-10' }));
      duplicateDocumentForNextMonth('doc-original');
      const args = mockRunSync.mock.calls[0];
      expect(args[9]).toBe('2027-01-10');
      expect(args[5]).toBe('01/2027');
    });

    it('dia 15/03/2026 -> 15/04/2026 (mes que tem dia 31)', () => {
      mockGetFirstSync.mockReturnValue(fakeDoc({ dueDate: '2026-03-15' }));
      duplicateDocumentForNextMonth('doc-original');
      const args = mockRunSync.mock.calls[0];
      expect(args[9]).toBe('2026-04-15');
    });
  });

  describe('dados preservados e limpos', () => {
    it('limpa foto, ocr e boleto, preserva cnpj e pixKey (esboco)', () => {
      mockGetFirstSync.mockReturnValue(fakeDoc({ pixKey: 'chave@gigamais.com' }));
      duplicateDocumentForNextMonth('doc-original');
      const args = mockRunSync.mock.calls[0];
      expect(args[2]).toBe('');                    // imageUri LIMPO
      expect(args[6]).toBe('07714104000107');      // cnpj PRESERVADO
      expect(args[12]).toBe('chave@gigamais.com'); // pixKey PRESERVADO
      expect(args[10]).toBeNull();                 // boletoLine LIMPO
      expect(args[11]).toBeNull();                 // ocrText LIMPO
    });

    it('cria com isPaid=0 e paymentDate=null (pendente)', () => {
      mockGetFirstSync.mockReturnValue(fakeDoc());
      duplicateDocumentForNextMonth('doc-original');
      const args = mockRunSync.mock.calls[0];
      expect(args[14]).toBe(0);
      expect(args[15]).toBeNull();
    });

    it('preserva o issuer (mesmo emissor)', () => {
      mockGetFirstSync.mockReturnValue(fakeDoc({ issuer: 'ENEL SP' }));
      duplicateDocumentForNextMonth('doc-original');
      const args = mockRunSync.mock.calls[0];
      expect(args[4]).toBe('ENEL SP');
    });

    it('preserva o totalAmountCents (valor sera corrigido depois)', () => {
      mockGetFirstSync.mockReturnValue(fakeDoc({ totalAmountCents: 12345 }));
      duplicateDocumentForNextMonth('doc-original');
      const args = mockRunSync.mock.calls[0];
      expect(args[8]).toBe(12345);
    });

    it('preserva o documentType', () => {
      mockGetFirstSync.mockReturnValue(fakeDoc({ documentType: 'PIX' }));
      duplicateDocumentForNextMonth('doc-original');
      const args = mockRunSync.mock.calls[0];
      expect(args[3]).toBe('PIX');
    });
  });

  describe('casos de erro', () => {
    it('retorna null se a conta nao existe', () => {
      mockGetFirstSync.mockReturnValue(null);
      expect(duplicateDocumentForNextMonth('doc-inexistente')).toBeNull();
      expect(mockRunSync).not.toHaveBeenCalled();
    });

    it('retorna null se a conta nao tem vencimento', () => {
      mockGetFirstSync.mockReturnValue(fakeDoc({ dueDate: null }));
      expect(duplicateDocumentForNextMonth('doc-original')).toBeNull();
      expect(mockRunSync).not.toHaveBeenCalled();
    });

    it('retorna string (id do clone) quando da certo', () => {
      mockGetFirstSync.mockReturnValue(fakeDoc());
      const id = duplicateDocumentForNextMonth('doc-original');
      expect(typeof id).toBe('string');
      expect(id).not.toBeNull();
    });
  });
});
