import { extractFields } from '../src/utils/extractor';
import { parseBRLToCents } from '../src/utils/money';

jest.mock('expo-sqlite', () => {
  const m = { execSync: jest.fn(), getFirstSync: jest.fn(), getAllSync: jest.fn(), runSync: jest.fn(), closeSync: jest.fn() };
  return { openDatabaseSync: jest.fn(() => m) };
});

describe('Valores entre R$ 1.900 e R$ 2.100', () => {
  it('não descarta R$ 2.000,00 no fallback', async () => {
    const r = await extractFields('Vencimento 10/11/2026 Pagar ate o dia R$ 2.000,00');
    expect(r.totalAmountCents).toBe(200000);
  });

  it('não descarta R$ 1.950,00 no fallback', async () => {
    const r = await extractFields('Vencimento 10/11/2026 R$ 1.950,00');
    expect(r.totalAmountCents).toBe(195000);
  });
});

describe('Emissor por palavra-chave sem falso positivo', () => {
  it('"GASTOS" não vira GAS', async () => {
    const r = await extractFields('Resumo de GASTOS do mes. Vencimento 10/11/2026 R$ 50,00');
    expect(r.issuer).not.toBe('GAS');
  });

  it('"ESTIMADO" e "ULTIMO" não viram TELEFONIA', async () => {
    const a = await extractFields('Consumo ESTIMADO. Vencimento 10/11/2026 R$ 50,00');
    const b = await extractFields('Pagamento ate o ULTIMO dia. R$ 50,00');
    expect(a.issuer).not.toBe('TELEFONIA');
    expect(b.issuer).not.toBe('TELEFONIA');
  });

  it('continua reconhecendo marcas reais', async () => {
    expect((await extractFields('CLARO S.A. Vencimento 10/11/2026')).issuer).toBe('TELEFONIA');
    expect((await extractFields('Conta de GAS natural')).issuer).toBe('GAS');
    expect((await extractFields('LIQUIGAS distribuidora')).issuer).toBe('GAS');
  });
});

describe('Tipo do documento', () => {
  it('nota fiscal com VALOR TOTAL é NOTA_FISCAL', async () => {
    const r = await extractFields('NOTA FISCAL DANFE VALOR TOTAL 50,00');
    expect(r.documentType).toBe('NOTA_FISCAL');
  });

  it('"CHUVA" não é confundido com UVA', async () => {
    const r = await extractFields('Loja Chuva de Prata RECIBO R$ 99,90');
    expect(r.documentType).toBe('RECIBO');
  });

  it('boleto com indicador forte continua BOLETO mesmo citando nota fiscal', async () => {
    const r = await extractFields('NOTA FISCAL/CONTA ENEL Beneficiario AMPLA TOTAL A PAGAR R$ 181,31');
    expect(r.documentType).toBe('BOLETO');
  });

  it('boleto que oferece PIX continua BOLETO', async () => {
    const r = await extractFields('Pague com PIX. TOTAL A PAGAR R$ 80,00 Vencimento 10/11/2026');
    expect(r.documentType).toBe('BOLETO');
  });
});

describe('parseBRLToCents (valor digitado na revisão)', () => {
  it.each([
    ['1.234,56', 123456],
    ['1234,56', 123456],
    ['1234.56', 123456],
    ['R$ 10', 1000],
    ['181,31', 18131],
    ['1.234', 123400],
    ['0,99', 99],
  ])('%s -> %i', (input, expected) => {
    expect(parseBRLToCents(input)).toBe(expected);
  });

  it.each(['', 'abc', '12,3,4', '1.2.3,4,5'])('"%s" é inválido', (input) => {
    expect(parseBRLToCents(input)).toBeNull();
  });
});
