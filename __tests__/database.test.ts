import { initDatabase, saveDocument, getDocuments, deleteDocumentById, togglePaidStatus } from '../src/db/database';
import * as SQLite from 'expo-sqlite';

jest.mock('expo-sqlite', () => {
  const execSync = jest.fn();
  const runSync = jest.fn();
  const getAllSync = jest.fn().mockReturnValue([]);
  return {
    openDatabaseSync: jest.fn().mockReturnValue({
      execSync,
      runSync,
      getAllSync,
      getFirstSync: jest.fn(),
    }),
  };
});

describe('database', () => {
  it('inicializa a tabela', () => {
    initDatabase();
    const db = SQLite.openDatabaseSync('scanner.db');
    expect(db.execSync).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE IF NOT EXISTS documents'));
  });

  it('salva um documento', () => {
    saveDocument('file:///img.jpg', 'Texto OCR', {
      documentType: 'BOLETO',
      issuer: 'ENEL',
      referenceMonth: '10/2026',
      cnpj: '11222333000181',
      cpf: null,
      totalAmountCents: 1000,
      dueDate: '2026-10-01',
      boletoLine: null,
    });
    const db = SQLite.openDatabaseSync('scanner.db');
    expect(db.runSync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO documents'),
      expect.any(String),
      'file:///img.jpg',
      'BOLETO',
      'ENEL',
      '10/2026',
      '11222333000181',
      null,
      1000,
      '2026-10-01',
      null,
      'Texto OCR',
      0,
      null,
      expect.any(String)
    );
  });

  it('apaga um documento pelo ID', () => {
    deleteDocumentById('123');
    const db = SQLite.openDatabaseSync('scanner.db');
    expect(db.runSync).toHaveBeenCalledWith('DELETE FROM documents WHERE id = ?', '123');
  });


  it('deve alternar o status de pago corretamente', () => {
    // Mock do runSync para verificar a query
    const db = SQLite.openDatabaseSync('scanner.db');
    togglePaidStatus('123', 0); // Marcar como pago
    expect(db.runSync).toHaveBeenCalledWith(
      'UPDATE documents SET isPaid = ?, paymentDate = ? WHERE id = ?',
      1,
      expect.any(String),
      '123'
    );

    togglePaidStatus('123', 1); // Desmarcar
    expect(db.runSync).toHaveBeenCalledWith(
      'UPDATE documents SET isPaid = ?, paymentDate = ? WHERE id = ?',
      0,
      null,
      '123'
    );
  });
});
