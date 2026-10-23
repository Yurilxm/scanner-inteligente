import { extractFields } from '../src/utils/extractor';

jest.mock('expo-sqlite', () => {
  const m = { execSync: jest.fn(), getFirstSync: jest.fn(), getAllSync: jest.fn(), runSync: jest.fn(), closeSync: jest.fn() };
  return { openDatabaseSync: jest.fn(() => m) };
});

const ENEL = `enel
NESANO
10/2026
VENCIWENTO
10/11/2026
TOTAL A PAGAR
R$ 181,31
Beneficiário: AMPLA Energia e Senviços SAJAv`;

const PROLAGOS = `Ce PROLAGOS
REFERENCIUA
10/2026
VENCIMENTO
05/11/2026
TOTAL (R$)
R$ 462.06
VALOR
R
460.70
LETURA NORMAL
462.06
TOTAL APAGAR
R$ 462.06`;

const UVA = `UVA
ANTARES EDUCACIONAL SA -UVA- 34.185.306/0001-81
Vencirmanto
5102026
Valor do documento
183,16
Valor
183,16`;

const SICOOB = `sICOOB
CONDOMINIO CISNE B BRANGO
15/102026
Vaor do Docutmenta
355,00
174842-5
10,00
345,00
Fundo Reserva
355,00
-vALOR Do DOCIMEN TO`;

const NETMAXXI = `Vencimento
13/10/2026
Valor
134,90
Periodo de Referência
10/09/2026 - 09/1 O/2026
Beneficiário
NETMAXXI TELECOMUNICACOESE
BANCO Do BRASIL
Valor do documento
134,90`;

describe('QA - Boletos reais do usuario (inline)', () => {
  it('ENEL: valor 181,31 / venc 2026-11-10 / ref 10/2026 / emissor ENEL', async () => {
    const f = await extractFields(ENEL);
    expect(f.documentType).toBe('BOLETO');
    expect(f.issuer).toBe('ENEL');
    expect(f.totalAmountCents).toBe(18131);
    expect(f.dueDate).toBe('2026-11-10');
    expect(f.referenceMonth).toBe('10/2026');
  });

  it('PROLAGOS: valor 462,06 / venc 2026-11-05 / ref 10/2026 / emissor PROLAGOS', async () => {
    const f = await extractFields(PROLAGOS);
    expect(f.documentType).toBe('BOLETO');
    expect(f.issuer).toBe('PROLAGOS');
    expect(f.totalAmountCents).toBe(46206);
    expect(f.dueDate).toBe('2026-11-05');
    expect(f.referenceMonth).toBe('10/2026');
  });

  it('UVA: valor 183,16 / venc 2026-10-05 / emissor FACULDADE', async () => {
    const f = await extractFields(UVA);
    expect(f.documentType).toBe('BOLETO');
    expect(f.issuer).toBe('FACULDADE');
    expect(f.totalAmountCents).toBe(18316);
    expect(f.dueDate).toBe('2026-10-05');
  });

  it('SICOOB: valor 355,00 / venc 2026-10-15 / emissor CONDOMINIO', async () => {
    const f = await extractFields(SICOOB);
    expect(f.documentType).toBe('BOLETO');
    expect(f.issuer).toBe('CONDOMINIO');
    expect(f.totalAmountCents).toBe(35500);
    expect(f.dueDate).toBe('2026-10-15');
  });

  it('NETMAXXI: valor 134,90 / venc 2026-10-13 / ref 10/2026 / emissor NETMAXXI', async () => {
    const f = await extractFields(NETMAXXI);
    expect(f.documentType).toBe('BOLETO');
    expect(f.issuer).toBe('NETMAXXI');
    expect(f.totalAmountCents).toBe(13490);
    expect(f.dueDate).toBe('2026-10-13');
    expect(f.referenceMonth).toBe('10/2026');
  });
});
