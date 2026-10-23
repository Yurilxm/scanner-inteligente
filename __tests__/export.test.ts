import { generateCSV } from '../src/utils/export';
import { SavedDocument } from '../src/db/database';

describe('export util', () => {
  it('gera o CSV com BOM, ponto e virgula e formato brasileiro', () => {
    const mockDocs: SavedDocument[] = [
      {
        id: '1',
        imageUri: 'file:///1.jpg',
        documentType: 'BOLETO',
        issuer: 'ENEL',
        referenceMonth: '05/2026',
        cnpj: '11222333000181',
        cpf: null,
        totalAmountCents: 123456,
        dueDate: '2026-05-15',
        boletoLine: null,
        ocrText: '',
        isPaid: 0,
        createdAt: '2026-10-21T10:00:00Z',
      },
    ];

    const csv = generateCSV(mockDocs);

    // Verifica BOM (\uFEFF)
    expect(csv.charCodeAt(0)).toBe(0xFEFF);
    // Verifica cabecalho
    expect(csv).toContain('ID;Tipo;Emissor;Referencia;Vencimento;Valor (R$);CNPJ;Pago;Linha Digitavel');
    // Verifica formatacao da data e do valor
    expect(csv).toContain('1;BOLETO;ENEL;05/2026;15/05/2026;1234,56;11222333000181;Nao;');
  });
});
