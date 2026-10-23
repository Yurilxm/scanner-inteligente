import { extractFields } from '../src/utils/extractor';

describe('Extrator V3 (Casos robustos e Enel)', () => {
  it('deve ler a referencia da Enel mesmo com erro de OCR (NESANO)', async () => {
    const enelMock = {
      text: 'enel 10/2026 VENCIMENTO 10/11/2026 TOTAL A PAGAR R$ 181,31',
      blocks: [
        { text: 'NESANO', frame: { top: 413, left: 407, right: 453, bottom: 423 }, lines: [{ text: 'NESANO', frame: { top: 413, left: 407, right: 453, bottom: 423 }, elements: [{ text: 'NESANO', frame: { top: 413, left: 407, right: 453, bottom: 423 } }] }] },
        { text: '10/2026', frame: { top: 439, left: 393, right: 456, bottom: 453 }, lines: [{ text: '10/2026', frame: { top: 439, left: 393, right: 456, bottom: 453 }, elements: [{ text: '10/2026', frame: { top: 439, left: 393, right: 456, bottom: 453 } }] }] },
        { text: 'VENCIMENTO', frame: { top: 480, left: 400, right: 460, bottom: 488 }, lines: [{ text: 'VENCIMENTO', frame: { top: 480, left: 400, right: 460, bottom: 488 }, elements: [{ text: 'VENCIMENTO', frame: { top: 480, left: 400, right: 460, bottom: 488 } }] }] },
        { text: '10/11/2026', frame: { top: 501, left: 379, right: 467, bottom: 515 }, lines: [{ text: '10/11/2026', frame: { top: 501, left: 379, right: 467, bottom: 515 }, elements: [{ text: '10/11/2026', frame: { top: 501, left: 379, right: 467, bottom: 515 } }] }] },
        { text: 'TOTAL A PAGAR', frame: { top: 544, left: 392, right: 471, bottom: 552 }, lines: [{ text: 'TOTAL A PAGAR', frame: { top: 544, left: 392, right: 471, bottom: 552 }, elements: [{ text: 'TOTAL A PAGAR', frame: { top: 544, left: 392, right: 471, bottom: 552 } }] }] },
        { text: 'R$ 181,31', frame: { top: 561, left: 384, right: 463, bottom: 580 }, lines: [{ text: 'R$ 181,31', frame: { top: 561, left: 384, right: 463, bottom: 580 }, elements: [{ text: 'R$ 181,31', frame: { top: 561, left: 384, right: 463, bottom: 580 } }] }] }
      ]
    };

    const fields = await extractFields(enelMock as any);
    expect(fields.issuer).toBe('ENEL');
    expect(fields.referenceMonth).toBe('10/2026');
    expect(fields.dueDate).toBe('2026-11-10');
    expect(fields.totalAmountCents).toBe(18131);
  });

  it('deve ignorar CPF no texto e focar no CNPJ', async () => {
    const cnpjMock = 'CPF: 123.456.789-00 CNPJ: 33.050.071/0001-58';
    const fields = await extractFields(cnpjMock);
    expect(fields.cnpj).toBe('33050071000158');
  });

  it('deve classificar comprovante de PIX corretamente', async () => {
    const pixMock = 'COMPROVANTE DE PIX\nValor: R$ 50,00\nData: 01/10/2026';
    const fields = await extractFields(pixMock);
    expect(fields.documentType).toBe('PIX');
    expect(fields.totalAmountCents).toBe(5000);
  });
});
