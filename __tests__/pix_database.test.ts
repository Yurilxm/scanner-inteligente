import { initDatabase, saveDocument, getDocumentById, updateDocument } from '../src/db/database';

jest.mock('expo-sqlite', () => require('../test-utils/nodeSqlite'));

describe('Banco de Dados - PIX', () => {
  let db: typeof import('../src/db/database');
  let testProfileId: string;

  beforeAll(() => {
    testProfileId = require('../src/db/profiles').createProfile({ name: 'TestePix', color: '#000', icon: 'account' });
    require('../src/db/profiles').setActiveProfileId(testProfileId);
    db = require('../src/db/database');
    db.initDatabase();
  });

  it('deve salvar um PIX com data de pagamento e observacao', () => {
    const id = db.saveDocument(
      'file:///pix.jpg',
      'texto ocr',
      { documentType: 'PIX', issuer: 'Chaves Burguers', referenceMonth: null, cnpj: '34608704000163', cpf: null, totalAmountCents: 4750, dueDate: null, boletoLine: null },
      '2026-10-23',
      'Almoco de sabado'
    );

    const doc = db.getDocumentById(id);
    expect(doc).toMatchObject({
      documentType: 'PIX',
      issuer: 'Chaves Burguers',
      totalAmountCents: 4750,
      isPaid: 1,
      paymentDate: '2026-10-23',
      observacao: 'Almoco de sabado',
    });
  });

  it('deve atualizar um PIX mantendo a data de pagamento', () => {
    const id = db.saveDocument(
      'file:///pix.jpg',
      'texto ocr',
      { documentType: 'PIX', issuer: 'Chaves Burguers', referenceMonth: null, cnpj: '34608704000163', cpf: null, totalAmountCents: 4750, dueDate: null, boletoLine: null },
      null,
      null
    );

    // Atualiza com data de pagamento
    db.updateDocument(id, 'file:///pix2.jpg', 'novo texto', { documentType: 'PIX', issuer: 'Chaves Burguers', referenceMonth: null, cnpj: '34608704000163', cpf: null, totalAmountCents: 4750, dueDate: null, boletoLine: null }, '2026-10-23', 'Pago no sabado');

    const doc = db.getDocumentById(id);
    expect(doc).toMatchObject({
      isPaid: 1,
      paymentDate: '2026-10-23',
      observacao: 'Pago no sabado',
    });
  });
});
