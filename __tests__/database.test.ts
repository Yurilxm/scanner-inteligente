// Banco local rodando sobre SQLite de verdade (node:sqlite)
jest.mock('expo-sqlite', () => require('../test-utils/nodeSqlite'));

import * as SQLite from 'expo-sqlite';

const fields = {
  documentType: 'BOLETO' as const, issuer: 'ENEL', referenceMonth: '10/2026', cnpj: '11222333000181', cpf: null,
  totalAmountCents: 18131, dueDate: '2026-11-10', boletoLine: null,
};

// Banco v1 como o do celular antes desta versão: sem as colunas de sincronização
function seedV1Database() {
  const old = SQLite.openDatabaseSync('scanner_yuri.db');
  old.execSync(`
    CREATE TABLE documents (
      id TEXT PRIMARY KEY NOT NULL, imageUri TEXT NOT NULL, documentType TEXT NOT NULL, issuer TEXT,
      referenceMonth TEXT, cnpj TEXT, cpf TEXT, totalAmountCents INTEGER, dueDate TEXT, boletoLine TEXT,
      ocrText TEXT, isPaid INTEGER DEFAULT 0, paymentDate TEXT, createdAt TEXT NOT NULL
    );
    CREATE TABLE learned_categories (id TEXT PRIMARY KEY NOT NULL, pattern TEXT NOT NULL UNIQUE, category TEXT NOT NULL, createdAt TEXT NOT NULL);
    INSERT INTO documents (id, imageUri, documentType, issuer, totalAmountCents, isPaid, createdAt)
      VALUES ('antigo', 'file:///a.jpg', 'BOLETO', 'PROLAGOS', 46206, 1, '2026-10-01T10:00:00.000Z');
    INSERT INTO learned_categories VALUES ('l1', 'luz do vale', 'ENERGIA', '2026-10-02T10:00:00.000Z');
    PRAGMA user_version = 1;
  `);
}

describe('Banco local (SQL real)', () => {
  let db: typeof import('../src/db/database');
  const raw = () => SQLite.openDatabaseSync('scanner_yuri.db');

  beforeAll(() => {
    seedV1Database();
    db = require('../src/db/database');
    db.initDatabase();
  });

  it('migra um banco v1 para a v2 sem perder dados', () => {
    expect(raw().getFirstSync<{ user_version: number }>('PRAGMA user_version')!.user_version).toBe(2);
    const antigo = raw().getFirstSync<any>("SELECT * FROM documents WHERE id = 'antigo'");
    expect(antigo).toMatchObject({
      issuer: 'PROLAGOS', totalAmountCents: 46206, isPaid: 1,
      updatedAt: '2026-10-01T10:00:00.000Z', paymentUpdatedAt: '2026-10-01T10:00:00.000Z',
      deletedAt: null, contentDirty: 1, paymentDirty: 1, // tudo que já existia ainda precisa subir
    });
    expect(raw().getFirstSync<any>("SELECT * FROM learned_categories WHERE id = 'l1'")).toMatchObject({ updatedAt: '2026-10-02T10:00:00.000Z', dirty: 1 });
  });

  it('rodar de novo não migra outra vez', () => {
    expect(() => db.initDatabase()).not.toThrow();
    expect(raw().getFirstSync<{ user_version: number }>('PRAGMA user_version')!.user_version).toBe(2);
  });

  it('salvar marca conteúdo e pagamento para envio', () => {
    const id = db.saveDocument('file:///b.jpg', 'texto', fields);
    expect(db.getDocumentById(id)).toMatchObject({ issuer: 'ENEL', contentDirty: 1, paymentDirty: 1, isPaid: 0 });
    expect(db.getDocumentById(id)!.updatedAt).toBe(db.getDocumentById(id)!.createdAt);
  });

  it('pagar mexe só no pagamento; reclassificar mexe só no conteúdo', () => {
    const id = db.saveDocument('file:///c.jpg', '', fields);
    raw().runSync('UPDATE documents SET contentDirty = 0, paymentDirty = 0 WHERE id = ?', id); // como se já tivesse subido

    db.togglePaidStatus(id, 0, '2026-10-20');
    expect(db.getDocumentById(id)).toMatchObject({ isPaid: 1, paymentDate: '2026-10-20', paymentDirty: 1, contentDirty: 0 });

    raw().runSync('UPDATE documents SET paymentDirty = 0 WHERE id = ?', id);
    db.updateDocumentIssuer(id, 'ENERGIA');
    expect(db.getDocumentById(id)).toMatchObject({ issuer: 'ENERGIA', contentDirty: 1, paymentDirty: 0 });

    db.togglePaidStatus(id, 1);
    expect(db.getDocumentById(id)).toMatchObject({ isPaid: 0, paymentDate: null });
  });

  it('excluir marca a conta (some do app, mas fica o aviso para sincronizar)', () => {
    const id = db.saveDocument('file:///d.jpg', 'texto do ocr', fields);
    db.deleteDocumentById(id);
    expect(db.getDocumentById(id)).toBeNull();
    expect(db.getDocuments().some(d => d.id === id)).toBe(false);
    const tombstone = raw().getFirstSync<any>('SELECT * FROM documents WHERE id = ?', id);
    expect(tombstone).toMatchObject({ contentDirty: 1, ocrText: null });
    expect(tombstone.deletedAt).toBeTruthy();
    const rawCount = raw().getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM documents WHERE deletedAt IS NULL')!.n;
    expect(rawCount).toBe(db.getDocuments().length);
  });

  it('aprender a mesma palavra de novo mantém o id', () => {
    db.saveLearnedCategory('Luz do Vale', 'LUZ');
    const row = raw().getFirstSync<any>("SELECT * FROM learned_categories WHERE pattern = 'luz do vale'");
    expect(row).toMatchObject({ id: 'l1', category: 'LUZ', dirty: 1 });
    expect(db.getLearnedCategories()).toContainEqual({ pattern: 'luz do vale', category: 'LUZ' });
  });

  it('lista em ordem do mais novo', () => {
    const docs = db.getDocuments();
    const dates = docs.map(d => d.createdAt);
    expect([...dates].sort().reverse()).toEqual(dates);
  });
});
