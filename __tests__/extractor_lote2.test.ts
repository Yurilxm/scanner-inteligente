import { extractFields } from '../src/utils/extractor';

describe('Extrator V2 (Geometria e Prioridade)', () => {
  it('deve ler o Valor Total correto da Prolagos ignorando a tabela e a data errada', () => {
    const mockOcrResult = {
      text: 'PROLAGOS TOTAL A PAGAR R$ 462.06 VENCIMENTO 05/11/2026 REFERÊNCIA 10/2026 178,70 11/08/2026',
      blocks: [
        {
          text: 'PROLAGOS',
          frame: { top: 10, left: 10, right: 100, bottom: 30 },
          lines: [{ text: 'PROLAGOS', frame: { top: 10, left: 10, right: 100, bottom: 30 }, elements: [{ text: 'PROLAGOS', frame: { top: 10, left: 10, right: 100, bottom: 30 } }] }]
        },
        {
          text: 'TOTAL A PAGAR',
          frame: { top: 116, left: 899, right: 990, bottom: 130 },
          lines: [{ text: 'TOTAL A PAGAR', frame: { top: 116, left: 899, right: 990, bottom: 130 }, elements: [{ text: 'TOTAL A PAGAR', frame: { top: 116, left: 899, right: 990, bottom: 130 } }] }]
        },
        {
          text: 'R$ 462.06',
          frame: { top: 138, left: 902, right: 986, bottom: 158 },
          lines: [{ text: 'R$ 462.06', frame: { top: 138, left: 902, right: 986, bottom: 158 }, elements: [{ text: 'R$ 462.06', frame: { top: 138, left: 902, right: 986, bottom: 158 } }] }]
        },
        {
          text: '178,70',
          frame: { top: 327, left: 839, right: 874, bottom: 336 },
          lines: [{ text: '178,70', frame: { top: 327, left: 839, right: 874, bottom: 336 }, elements: [{ text: '178,70', frame: { top: 327, left: 839, right: 874, bottom: 336 } }] }]
        },
        {
          text: 'VENCIMENTO',
          frame: { top: 188, left: 901, right: 976, bottom: 198 },
          lines: [{ text: 'VENCIMENTO', frame: { top: 188, left: 901, right: 976, bottom: 198 }, elements: [{ text: 'VENCIMENTO', frame: { top: 188, left: 901, right: 976, bottom: 198 } }] }]
        },
        {
          text: '05/11/2026',
          frame: { top: 207, left: 904, right: 994, bottom: 224 },
          lines: [{ text: '05/11/2026', frame: { top: 207, left: 904, right: 994, bottom: 224 }, elements: [{ text: '05/11/2026', frame: { top: 207, left: 904, right: 994, bottom: 224 } }] }]
        },
        {
          text: '11/08/2026',
          frame: { top: 942, left: 50, right: 101, bottom: 951 },
          lines: [{ text: '11/08/2026', frame: { top: 942, left: 50, right: 101, bottom: 951 }, elements: [{ text: '11/08/2026', frame: { top: 942, left: 50, right: 101, bottom: 951 } }] }]
        },
        {
          text: 'REFERÊNCIA',
          frame: { top: 128, left: 572, right: 642, bottom: 141 },
          lines: [{ text: 'REFERÊNCIA', frame: { top: 128, left: 572, right: 642, bottom: 141 }, elements: [{ text: 'REFERÊNCIA', frame: { top: 128, left: 572, right: 642, bottom: 141 } }] }]
        },
        {
          text: '10/2026',
          frame: { top: 151, left: 573, right: 636, bottom: 167 },
          lines: [{ text: '10/2026', frame: { top: 151, left: 573, right: 636, bottom: 167 }, elements: [{ text: '10/2026', frame: { top: 151, left: 573, right: 636, bottom: 167 } }] }]
        }
      ]
    };

    const fields = extractFields(mockOcrResult as any);

    expect(fields.documentType).toBe('BOLETO');
    expect(fields.totalAmountCents).toBe(46206);
    expect(fields.dueDate).toBe('2026-11-05');
    expect(fields.referenceMonth).toBe('10/2026');
  });

  it('deve parsear corretamente valores com milhar', () => {
    const mockOcrResult = {
      text: 'VALOR TOTAL R$ 20.000,00',
      blocks: [
        {
          text: 'VALOR TOTAL',
          frame: { top: 10, left: 10, right: 100, bottom: 20 },
          lines: [{ text: 'VALOR TOTAL', frame: { top: 10, left: 10, right: 100, bottom: 20 }, elements: [{ text: 'VALOR TOTAL', frame: { top: 10, left: 10, right: 100, bottom: 20 } }] }]
        },
        {
          text: 'R$ 20.000,00',
          frame: { top: 30, left: 10, right: 120, bottom: 40 },
          lines: [{ text: 'R$ 20.000,00', frame: { top: 30, left: 10, right: 120, bottom: 40 }, elements: [{ text: 'R$ 20.000,00', frame: { top: 30, left: 10, right: 120, bottom: 40 } }] }]
        }
      ]
    };
    
    const fields = extractFields(mockOcrResult as any);
    expect(fields.totalAmountCents).toBe(2000000);
  });
});
