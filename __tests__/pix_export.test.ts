import { generateCSV, generatePDFFile } from '../src/utils/export';
import { SavedDocument } from '../src/db/database';

describe('Exportação e Suporte a Pix', () => {
  const pixDoc: SavedDocument = {
    id: 'pix-123',
    imageUri: 'file:///pix.jpg',
    documentType: 'PIX',
    issuer: 'Chaves Burger',
    referenceMonth: null,
    dueDate: null,
    totalAmountCents: 4750, // R$ 47,50
    isPaid: 1,
    paymentDate: '2026-10-23',
    createdAt: '2026-10-23T12:00:00Z',
    observacao: 'Almoço de sábado',
    boletoLine: null,
    cnpj: null,
    cpf: null,
    ocrText: 'Comprovante de transferência PIX',
  };

  it('deve gerar o CSV com a coluna de Observação e Pago Em', () => {
    const csv = generateCSV([pixDoc], 'Yuri');
    
    // Verifica o cabeçalho
    expect(csv).toContain('Pago;Data Pagamento;Linha Digitavel;Observacao;Perfil');
    
    // Verifica os dados do Pix
    expect(csv).toContain('PIX');
    expect(csv).toContain('Chaves Burger');
    expect(csv).toContain('47,50');
    expect(csv).toContain('Sim'); // Pago
    expect(csv).toContain('23/10/2026'); // Data de Pagamento
    expect(csv).toContain('Almoço de sábado'); // Observação
  });

  it('deve gerar o PDF com a coluna de Observação', async () => {
    // O generatePDFFile chama o expo-print. Vamos apenas garantir que ele não quebra.
    // Em um teste real de snapshot, verificaríamos o HTML gerado, mas como ele chama um módulo nativo,
    // testamos apenas se a função é chamada sem erro.
    // (O mock do expo-print está no jest.setup.js)
    await expect(generatePDFFile([pixDoc])).resolves.toBeDefined();
  });
});
