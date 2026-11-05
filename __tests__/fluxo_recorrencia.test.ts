import * as SQLite from 'expo-sqlite';
import { duplicateDocumentForNextMonth, togglePaidStatus } from '../src/db/database';

// Mock com "banco em memória" (Map): mantem docs entre chamadas de runSync/getFirstSync
jest.mock('expo-sqlite', () => {
  const docs = new Map<string, any>();
  return {
    openDatabaseSync: jest.fn().mockReturnValue({
      closeSync: jest.fn(),
      execSync: jest.fn(),
      runSync: jest.fn((sql: string, ...args: any[]) => {
        // args[0] = id (primeiro argumento depois da SQL, tanto no seed quanto no saveDocument)
        if (sql.includes('INSERT INTO documents')) {
          docs.set(args[0], {
            id: args[0], imageUri: args[1], documentType: args[2], issuer: args[3],
            referenceMonth: args[4], cnpj: args[5], cpf: args[6],
            totalAmountCents: args[7], dueDate: args[8], boletoLine: args[9],
            ocrText: args[10], pixKey: args[11], observacao: args[12],
            isPaid: args[13], paymentDate: args[14],
          });
        }
        // UPDATE togglePaidStatus: args = [newStatus, dateToSave, now, id]
        if (sql.includes('UPDATE documents SET isPaid')) {
          const id = args[3];
          if (docs.has(id)) {
            const d = docs.get(id);
            d.isPaid = args[0];
            d.paymentDate = args[1];
          }
        }
      }),
      getFirstSync: jest.fn((sql: string, ...args: any[]) => {
        if (sql.includes('WHERE id = ?')) return docs.get(args[0]) || null;
        return null;
      }),
      getAllSync: jest.fn(() => Array.from(docs.values())),
    }),
  };
});

const mockDb = (SQLite.openDatabaseSync as jest.Mock)();

function seedDoc(overrides: Partial<any> = {}) {
  const doc = {
    id: 'doc-1',
    imageUri: 'file://foto.jpg',
    documentType: 'BOLETO',
    issuer: 'Giga Mais',
    referenceMonth: '11/2026',
    cnpj: '07714104000107',
    cpf: null,
    totalAmountCents: 5806,
    dueDate: '2026-11-10',
    boletoLine: '3419109149066362785415999190000716260000005806',
    ocrText: 'OCR do boleto de novembro',
    pixKey: null,
    isPaid: 1,
    paymentDate: '2026-11-05',
    ...overrides,
  };
  mockDb.runSync(
    'INSERT INTO documents VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    doc.id, doc.imageUri, doc.documentType, doc.issuer, doc.referenceMonth,
    doc.cnpj, doc.cpf, doc.totalAmountCents, doc.dueDate, doc.boletoLine,
    doc.ocrText, doc.pixKey, null, doc.isPaid, doc.paymentDate,
  );
  // Limpa o historico DEPOIS do seed, para que o find pegue apenas o INSERT do clone
  (mockDb as any).runSync.mockClear();
  return doc;
}

// Helper para achar a chamada de INSERT de um ID especifico
function findInsertFor(id: string) {
  return (mockDb as any).runSync.mock.calls.find(
    (c: any[]) => c[0].includes('INSERT INTO documents') && c[1] === id
  );
}

describe('Fluxo completo de recorrencia (integracao)', () => {
  beforeEach(() => {
    (mockDb as any).runSync.mockClear();
    (mockDb as any).getFirstSync.mockClear();
  });

  it('cria clone e o clone fica PENDENTE com dueDate do mes seguinte', () => {
    seedDoc();
    const newId = duplicateDocumentForNextMonth('doc-1');
    expect(newId).not.toBeNull();

    const insertCall = findInsertFor(newId!);
    expect(insertCall).toBeDefined();
    // mock.calls[0] = [SQL, ...args]
    // args: [0]=id [1]=imageUri [2]=documentType [3]=issuer [4]=referenceMonth
    //       [5]=cnpj [6]=cpf [7]=totalAmountCents [8]=dueDate [9]=boletoLine
    //       [10]=ocrText [11]=pixKey [12]=observacao [13]=isPaid [14]=paymentDate
    expect(insertCall[9]).toBe('2026-12-10');   // dueDate +1 mes
    expect(insertCall[14]).toBe(0);             // isPaid = 0
    expect(insertCall[2]).toBe('');             // imageUri vazio
  });

  it('togglePaidStatus em clone cria estado consistente', () => {
    seedDoc();
    const cloneId = duplicateDocumentForNextMonth('doc-1');
    togglePaidStatus(cloneId!, 0, '2026-12-08');

    const updateCall = (mockDb as any).runSync.mock.calls.find(
      (c: any[]) => c[0].includes('UPDATE documents SET isPaid')
    );
    expect(updateCall).toBeDefined();
    expect(updateCall[1]).toBe(1);              // novo isPaid
    expect(updateCall[2]).toBe('2026-12-08');   // paymentDate novo
  });

  it('clonar conta ja paga ainda gera clone pendente (nao herda o pago)', () => {
    seedDoc({ isPaid: 1, paymentDate: '2026-11-05' });
    const newId = duplicateDocumentForNextMonth('doc-1');

    const insertCall = findInsertFor(newId!);
    expect(insertCall).toBeDefined();
    expect(insertCall[14]).toBe(0);     // isPaid = 0
    expect(insertCall[15]).toBeNull();  // paymentDate = null
  });

  it('clone preserva cnpj e pixKey do original', () => {
    seedDoc({ pixKey: 'chave@gigamais.com' });
    const newId = duplicateDocumentForNextMonth('doc-1');

    const insertCall = findInsertFor(newId!);
    expect(insertCall).toBeDefined();
    expect(insertCall[6]).toBe('07714104000107');       // cnpj (args[5])
    expect(insertCall[12]).toBe('chave@gigamais.com');  // pixKey (args[11])
  });
});
