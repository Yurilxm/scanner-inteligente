jest.mock('expo-sqlite', () => {
  const dbMock = {
    execSync: jest.fn(), getFirstSync: jest.fn(), getAllSync: jest.fn(),
    runSync: jest.fn(), closeSync: jest.fn(),
  };
  return { openDatabaseSync: jest.fn(() => dbMock), __dbMock: dbMock };
});

import { extractFields } from '../src/utils/extractor';

describe('QA Senior - Escalabilidade (Academias e Desconhecidos)', () => {
  it('deve classificar Smart Fit como ACADEMIA se aparecer no texto', async () => {
    const text = 'BOLETO BENEFICIARIO: SMART FIT ACADEMIA Vencimento 10/11/2026 Total R$ 150,00';
    const fields = await extractFields(text);
    expect(fields.issuer).toBe('ACADEMIA');
  });

  it('deve extrair o nome do beneficiario como emissor se for totalmente desconhecido', async () => {
    // Boleto de uma empresa que nao esta na lista (ex: Pet Shop)
    const text = 'BOLETO BENEFICIARIO: PETZ COMERCIO DE ANIMAIS Vencimento 10/11/2026 Total R$ 80,00';
    const fields = await extractFields(text);
    // Como nao tem regra fixa, ele extrai o nome (PETZ)
    expect(fields.issuer).toBe('PETZ COMERCIO');
  });
});
