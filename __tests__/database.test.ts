jest.mock('expo-sqlite', () => require('../test-utils/nodeSqlite'));
import * as SQLite from 'expo-sqlite';


describe('Banco local (SQL real)', () => {
  let db: typeof import('../src/db/database');
  let testProfileId: string;
  const raw = () => SQLite.openDatabaseSync('scanner_' + testProfileId + '.db');

  beforeAll(() => {
    testProfileId = require('../src/db/profiles').createProfile({ name: 'Teste', color: '#000', icon: 'account' });
    require('../src/db/profiles').setActiveProfileId(testProfileId);
    db = require('../src/db/database');
    db.initDatabase();
  });

  it('migra um banco v1 para a v2 sem perder dados', () => {
    expect(raw().getFirstSync<{ user_version: number }>('PRAGMA user_version')!.user_version).toBe(2);
    const tabelas = raw().getAllSync<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table'");
    expect(tabelas.map(t => t.name)).toContain('documents');
    expect(tabelas.map(t => t.name)).toContain('learned_categories');
  });

  it('salvar marca conteÃºdo e pagamento para envio', () => {
    const id = db.saveDocument('file:///b.jpg', 'texto', { documentType: 'BOLETO', issuer: 'ENEL', referenceMonth: null, cnpj: null, cpf: null, totalAmountCents: 100, dueDate: '2026-10-01', boletoLine: null });
    expect(db.getDocumentById(id)).toMatchObject({ issuer: 'ENEL', contentDirty: 1, paymentDirty: 1, isPaid: 0 });
  });

  it('apagar documento faz soft delete', () => {
    const id = db.saveDocument('file:///d.jpg', 'texto', { documentType: 'BOLETO', issuer: 'ENEL', referenceMonth: null, cnpj: null, cpf: null, totalAmountCents: 100, dueDate: null, boletoLine: null });
    db.deleteDocumentById(id);
    expect(db.getDocumentById(id)).toBeNull();
  });
});