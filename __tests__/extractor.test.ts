import { extractFields } from '../src/utils/extractor';

describe('extractor', () => {
  it('extrai campos de um Boleto com Emissor e Referencia', () => {
    const ocrText = `
      ENEL DISTRIBUICAO SAO PAULO
      Referencia: 10/2026
      Vencimento: 15/11/2026
      CNPJ: 11.222.333/0001-81
      Valor do Documento: R$ 1.234,56
      Valor Total: R$ 1.250,00
      Linha Digitavel: 12345.67890 12345.678901 12345.678901 1 12345678901234
    `;

    const fields = extractFields(ocrText);

    expect(fields.documentType).toBe('BOLETO');
    expect(fields.issuer).toBe('ENEL');
    expect(fields.referenceMonth).toBe('10/2026');
    expect(fields.cnpj).toBe('11222333000181');
    expect(fields.dueDate).toBe('2026-11-15');
    expect(fields.totalAmountCents).toBe(125000);
  });

  it('identifica PIX e extrai valor total', () => {
    const ocrText = `
      COMPROVANTE DE PIX
      Valor: R$ 50,00
      Data: 01/10/2026
    `;

    const fields = extractFields(ocrText);

    expect(fields.documentType).toBe('PIX');
    expect(fields.totalAmountCents).toBe(5000);
  });
});
