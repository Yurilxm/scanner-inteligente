import { extractFields } from '../src/utils/extractor';

jest.mock('expo-sqlite', () => ({
  openDatabaseSync: jest.fn().mockReturnValue({
    execSync: jest.fn(),
    runSync: jest.fn(),
    getAllSync: jest.fn().mockReturnValue([]),
    getFirstSync: jest.fn(),
    closeSync: jest.fn(),
  }),
}));

const PIX_BRADESCO = `
Comprovante de transferência
Pix
23/10/2026 - 21:09:30
Valor: R$ 47,50
Dados de quem recebeu
Nome
Chaves Burguers Sao Pedro
CPF/CNPJ
34.608.704/0001-63
Instituição
BCO C6 S.A.
Chave Pix
+55 22 98838 8484
Dados da transação
Tipo
Pix
Valor
R$ 47,50
Data do débito
23/10/2026 - 21:09:24
Número de Controle
E60746948202610240008A008714ab08
Dados de quem fez a transação
Nome
ANA LUCIA LIMA XAVIER
CPF
***.572.087-**
Telefones de contato
4002 0022 - Capitais e regiões metropolitanas
0800 570 0022 - Demais localidades
SAC - Alô Bradesco
0800 704 8383
Ouvidoria Bradesco
0800 727 9933
`;

describe('Extrator de PIX', () => {
  it('deve identificar o documento como PIX', async () => {
    const result = await extractFields(PIX_BRADESCO);
    expect(result.documentType).toBe('PIX');
  });

  it('deve extrair o nome do emissor (quem recebeu)', async () => {
    const result = await extractFields(PIX_BRADESCO);
    expect(result.issuer).toBe('Chaves Burguers Sao Pedro');
  });

  it('deve extrair o CNPJ corretamente', async () => {
    const result = await extractFields(PIX_BRADESCO);
    expect(result.cnpj).toBe('34608704000163');
  });

  it('deve extrair o valor total em centavos', async () => {
    const result = await extractFields(PIX_BRADESCO);
    expect(result.totalAmountCents).toBe(4750);
  });

  it('não deve extrair data de vencimento nem referência', async () => {
    const result = await extractFields(PIX_BRADESCO);
    expect(result.dueDate).toBeNull();
    expect(result.referenceMonth).toBeNull();
  });
});
