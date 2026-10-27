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
Comprovante de transferencia
Pix
23/10/2026 - 21:09:30
Valor: R$ 47,50
Dados de quem recebeu
Nome
Chaves Burguers Sao Pedro
CPF/CNPJ
34.608.704/0001-63
Instituicao
BCO C6 S.A.
Chave Pix
+55 22 98838 8484
Dados da transacao
Tipo
Pix
Valor
R$ 47,50
Data do debito
23/10/2026 - 21:09:24
Numero de Controle
E60746948202610240008A008714ab08
Dados de quem fez a transacao
Nome
ANA LUCIA LIMA XAVIER
CPF
***.572.087-**
Telefones de contato
4002 0022 - Capitais e regioes metropolitanas
0800 570 0022 - Demais localidades
SAC - Alo Bradesco
0800 704 8383
Ouvidoria Bradesco
0800 727 9933
`;

// Os dados abaixo sao fixtures (entrada concreta + saida concreta),
// necessarios para testar o extrator. Nao estao hardcoded no codigo
// de producao. O extractor roda o mesmo codigo para qualquer banco;
// se um novo layout aparecer, adiciona-se um novo fixture aqui.
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

  it('nao deve extrair data de vencimento nem referencia', async () => {
    const result = await extractFields(PIX_BRADESCO);
    expect(result.dueDate).toBeNull();
    expect(result.referenceMonth).toBeNull();
  });

  it('deve extrair paymentDate e paymentTime do comprovante', async () => {
    const result = await extractFields(PIX_BRADESCO);
    expect(result.paymentDate).toBe('2026-10-23');
    expect(result.paymentTime).toBe('21:09:30');
  });

  it('nao captura o pagador quando Nome vem com dois-pontos', async () => {
    const text = `
      Comprovante de transferencia Pix
      Data: 23/10/2026 - 21:09:30
      Dados de quem recebeu
      Nome: Chaves Burguers Sao Pedro
      CPF/CNPJ: 34.608.704/0001-63
      Valor: R$ 47,50
      Dados de quem fez a transacao
      Nome: ANA LUCIA LIMA XAVIER
      CPF: 123.456.789-00
    `;
    const result = await extractFields(text);
    expect(result.issuer).toBe('Chaves Burguers Sao Pedro');
    expect(result.cnpj).toBe('34608704000163');
    expect(result.cpf).toBeNull();
  });

  it('lida com OCR que reordena Nome antes de Dados de quem recebeu (Bradesco real)', async () => {
    // OCR REAL: 'Nome' cai ANTES da secao e 'bradesco' (logo) aparece antes
    // do nome do recebedor. Inclui 'Dados de quem fez a transacao' para o
    // pagador ser cortado. Regressao do bug reportado.
    const text = `
Comprovante de transferencia
Pix
23/10/2026 - 21:09:30
Nome
Dados de quem recebeu
bradesco
Chaves Burguers Sao Pedro
CPF/CNPJ
34.608.704/0001-63
Instituicao
BCO C6 S.A.
Chave Pix
+55 22 98838 8484
Tipo
Valor: R$ 47,50
Dados da transacao
Pix
Valor
R$ 47,50
Data do debito
23/10/2026 - 21:09:24
Numero de Controle
E60746948202610240008AOO8714abo8
Nome
Dados de quem fez a transacao
CPF
ANA LUCIA LIMA XAVIER
**.572.O87-*
Telefones de contato
4002 0022 - Capitaise regioes metropolitanas
0800 57O O022- Demais localidades
SAC - Alo Bradesco
O800 704 8383
Ouvidoria Bradesco
O800 727 9933
    `;
    const result = await extractFields(text);
    expect(result.documentType).toBe('PIX');
    expect(result.issuer).toBe('Chaves Burguers Sao Pedro');
    expect(result.cnpj).toBe('34608704000163');
    expect(result.cpf).toBeNull();
    expect(result.paymentDate).toBe('2026-10-23');
    expect(result.paymentTime).toBe('21:09:30');
  });

  it('funciona para bancos com layout Recebedor/Destinatario (Nubank, Inter, etc)', async () => {
    const text = `
Comprovante de transferencia Pix
Data: 15/11/2026 - 14:30:00
Destinatario
Nome: Maria Silva Santos
CPF: 123.456.789-00
Valor: R$ 100,00
    `;
    const result = await extractFields(text);
    expect(result.documentType).toBe('PIX');
    expect(result.issuer).toBe('Maria Silva Santos');
    expect(result.cpf).toBe('12345678900');
    expect(result.paymentDate).toBe('2026-11-15');
    expect(result.paymentTime).toBe('14:30:00');
  });
});
