import { generateCSV } from '../src/utils/export';
import { SavedDocument } from '../src/db/database';

describe('Export Utils', () => {
  it('generateCSV returns string with BOM and correct format', () => {
    const mockDoc: SavedDocument = {
      id: '1', documentType: 'BOLETO', issuer: 'ENEL', referenceMonth: '10/2026',
      cnpj: '123', cpf: '', totalAmountCents: 18131, dueDate: '2026-11-10',
      boletoLine: '', ocrText: '', isPaid: 0, createdAt: '2026-10-23',
      imageUri: 'file://test.png',
    };
    const csv = generateCSV([mockDoc]);
    expect(csv).toContain('\uFEFF');
    expect(csv).toContain('ENEL;10/2026;10/11/2026;181,31');
  });
});
