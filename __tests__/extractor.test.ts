import { extractFields } from '../src/utils/extractor';

describe('extractor', () => {
  it('extrai campos de um Boleto', () => {
    const ocrText = `
      BANCO DO BRASIL
      Vencimento: 15/05/2026
      Beneficiario: Empresa Teste LTDA
      CNPJ: 11.222.333/0001-81
      Valor do Documento: R$ 1.234,56
      Valor Total: R$ 1.250,00
      Linha Digitavel: 12345.67890 12345.678901 12345.678901 1 12345678901234
    `;

    const fields = extractFields(ocrText);

    expect(fields.documentType).toBe('BOLETO');
    expect(fields.cnpj).toBe('11222333000181');
    expect(fields.date).toBe('2026-05-15');
    expect(fields.totalAmountCents).toBe(125000); // Pegou o valor da linha "Total"
  });

  it('extrai campos de uma Nota Fiscal', () => {
    const ocrText = `
      DANFE - NOTA FISCAL ELETRONICA
      Data de Emissao: 01/10/2026
      CPF do Consumidor: 529.982.247-25
      Valor Total da Nota: 50,00
    `;

    const fields = extractFields(ocrText);

    expect(fields.documentType).toBe('NOTA_FISCAL');
    expect(fields.cpf).toBe('52998224725');
    expect(fields.date).toBe('2026-10-01');
    expect(fields.totalAmountCents).toBe(5000);
  });

  it('ignora CNPJ e CPF invalidos', () => {
    const ocrText = `
      CNPJ invalido: 11.111.111/1111-11
      CPF invalido: 123.456.789-00
    `;

    const fields = extractFields(ocrText);

    expect(fields.cnpj).toBeNull();
    expect(fields.cpf).toBeNull();
  });

  it('retorna nulos se o texto estiver vazio', () => {
    const fields = extractFields('');
    expect(fields.documentType).toBe('DESCONHECIDO');
    expect(fields.totalAmountCents).toBeNull();
  });
});
