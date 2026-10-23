import { extractFields } from '../src/utils/extractor';

describe('QA Sênior - Testes de Estresse e Edge Cases', () => {
  it('deve lidar com texto vazio (OCR falhou) sem quebrar', () => {
    const fields = extractFields({ text: '' });
    expect(fields.documentType).toBe('OUTROS');
    expect(fields.totalAmountCents).toBeNull();
    expect(fields.dueDate).toBeNull();
  });

  it('deve aceitar "Venc." abreviado', () => {
    const text = 'BOLETO Venc. 15/11/2026 Total a Pagar R$ 100,00';
    const fields = extractFields(text);
    expect(fields.dueDate).toBe('2026-11-15');
  });

  it('deve aceitar valor sem centavos (R$ 100)', () => {
    const text = 'BOLETO Vencimento 15/11/2026 Total a Pagar R$ 100';
    const fields = extractFields(text);
    expect(fields.totalAmountCents).toBe(10000);
  });

  it('deve ignorar valores zerados e pegar o maior valor válido no fallback', () => {
    const text = 'BOLETO Venc 10/10/2026 Taxa: R$ 0,00 Total: R$ 250,50 Desconto: R$ 0,00';
    const fields = extractFields(text);
    expect(fields.totalAmountCents).toBe(25050);
  });

  it('deve classificar boleto com palavra PIX no rodapé como BOLETO', () => {
    const text = 'BENEFICIARIO: CONDOMINIO X NOSSO NUMERO: 123 Pague com PIX';
    const fields = extractFields(text);
    expect(fields.documentType).toBe('BOLETO');
    expect(fields.issuer).toBe('CONDOMINIO');
  });
});
