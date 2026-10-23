jest.mock('expo-sqlite', () => {
  const dbMock = {
    execSync: jest.fn(),
    getFirstSync: jest.fn(),
    getAllSync: jest.fn(),
    runSync: jest.fn(),
    closeSync: jest.fn(),
  };
  return { openDatabaseSync: jest.fn(() => dbMock), __dbMock: dbMock };
});

import { extractFields } from '../src/utils/extractor';

describe('QA Senior - Extrator com OCR real (UVA)', () => {
  it('deve extrair valor 183,16 do boleto da UVA (ignorando CNPJ)', async () => {
    // Texto OCR real da imagem da UVA
    const uvaOcr = `nono
Data
Valor do documento
ANTARES EDUCACIONAL SA -UVA- 34.185.306/0001-81
Data do documento
183,16
Valor
183,16`;

    const fields = await extractFields(uvaOcr);
    expect(fields.documentType).toBe('BOLETO');
    expect(fields.issuer).toBe('FACULDADE');
    expect(fields.totalAmountCents).toBe(18316);
    expect(fields.cnpj).toBe('34185306000181');
  });

  it('deve extrair valor 355,00 do boleto do Sicoob (ignorando CNPJ)', async () => {
    const sicoobOcr = `174842-5
10,00
345,00
Fundo Reserva do Mes Atual
Taxa Condominial do Mes Atual
355,00
AUTENTICNCAO MECANICA
-VALOR DO DOCIMENTO`;

    const fields = await extractFields(sicoobOcr);
    expect(fields.totalAmountCents).toBe(35500);
  });

  it('deve extrair valor 134,90 do boleto da NetMax', async () => {
    const netmaxOcr = `7668638 / 7668638
BENEFICIARIO NETMAXXI TELECOMUNICACOES
Vencimento 13/10/2026
Valor do documento 134,90`;

    const fields = await extractFields(netmaxOcr);
    expect(fields.totalAmountCents).toBe(13490);
    expect(fields.dueDate).toBe('2026-10-13');
    expect(fields.issuer).toBe('INTERNET');
  });
});
