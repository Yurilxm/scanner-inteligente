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

import * as FileSystem from 'expo-file-system/legacy';
import { extractFields } from '../src/utils/extractor';
import { escapeHTML, generatePDFFile } from '../src/utils/export';
import { cleanupDebugFiles } from '../src/utils/files';
import * as Print from 'expo-print';

const mockDb = (require('expo-sqlite') as any).__dbMock;

// Sem marca/beneficiario conhecido: só o CNPJ identificaria o emissor
const TEXT = 'Pagamento CNPJ 11.222.333/0001-81 Vencimento 10/11/2026 R$ 100,00';

describe('Consulta de CNPJ opt-in', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ razao_social: 'EMPRESA TESTE', cnae_fiscal: '3514000' }),
    }) as any;
    mockDb.getFirstSync.mockReturnValue(null);
  });

  it('por padrão não acessa a internet', async () => {
    const r = await extractFields(TEXT);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(r.issuer).toBeNull();
    expect(r.cnpj).toBe('11222333000181');
  });

  it('com consentimento consulta as APIs', async () => {
    const r = await extractFields(TEXT, [], { allowCnpjLookup: true });
    expect(globalThis.fetch).toHaveBeenCalled();
    expect(r.issuer).toBe('ENERGIA');
  });

  it('usa o cache local mesmo sem consentimento', async () => {
    mockDb.getFirstSync.mockReturnValue({
      razao_social: 'EMPRESA TESTE', cnae_fiscal: '3514000', cnae_descricao: '',
      categoria: 'ENERGIA', fetchedAt: new Date().toISOString(),
    });
    const r = await extractFields(TEXT);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(r.issuer).toBe('ENERGIA');
  });

  it('não envia CNPJ inválido (lixo de OCR) para a rede', async () => {
    await extractFields('Pagamento CNPJ 11.222.333/0001-99 R$ 100,00', [], { allowCnpjLookup: true });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

describe('PDF sem injeção de HTML', () => {
  it('escapa caracteres especiais', () => {
    expect(escapeHTML('<img src=x onerror="a()"> & \'b\'')).toBe(
      '&lt;img src=x onerror=&quot;a()&quot;&gt; &amp; &#39;b&#39;'
    );
    expect(escapeHTML(null)).toBe('');
  });

  it('emissor vindo do OCR não vira tag no PDF', async () => {
    await generatePDFFile([{
      id: '1', imageUri: '', ocrText: '', isPaid: 0, createdAt: '', documentType: 'BOLETO',
      issuer: '<script>alert(1)</script>', referenceMonth: null, cnpj: null, cpf: null,
      totalAmountCents: 100, dueDate: '2026-11-10', boletoLine: null,
    }]);
    const html = (Print.printToFileAsync as jest.Mock).mock.calls[0][0].html as string;
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('Limpeza de arquivos de debug', () => {
  it('apaga só os arquivos de OCR exportados', async () => {
    (FileSystem.readDirectoryAsync as jest.Mock).mockResolvedValue([
      'ocr_debug_1.txt', 'debug_ocr_2.json', 'scans', 'relatorio_documentos.csv', 'ocr_input_3.jpg',
    ]);
    await cleanupDebugFiles();
    const deleted = (FileSystem.deleteAsync as jest.Mock).mock.calls.map(c => c[0] as string);
    expect(deleted).toEqual(expect.arrayContaining([
      'file:///cache/ocr_debug_1.txt', 'file:///cache/debug_ocr_2.json',
      'file:///documents/ocr_debug_1.txt', 'file:///documents/debug_ocr_2.json',
    ]));
    expect(deleted.some(p => p.includes('scans') || p.includes('relatorio') || p.includes('ocr_input'))).toBe(false);
  });
});
