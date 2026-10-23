import { generateCSV } from '../src/utils/export';
import { SavedDocument } from '../src/db/database';

describe('export util', () => {
  it('gera o CSV com BOM, ponto e virgula e formato brasileiro', () => {
    const mockDocs: SavedDocument[] = [
      {
        id: '1',
        imageUri: 'file:///1.jpg',
        documentType: 'BOLETO',
        issuer: 'ENEL',
        referenceMonth: '05/2026',
        cnpj: '11222333000181',
        cpf: null,
        totalAmountCents: 123456,
        dueDate: '2026-05-15',
        boletoLine: null,
        ocrText: '',
        isPaid: 0,
        createdAt: '2026-10-21T10:00:00Z',
      },
    ];

    const csv = generateCSV(mockDocs);

    // Verifica BOM (\uFEFF)
    expect(csv.charCodeAt(0)).toBe(0xFEFF);
    // Verifica cabecalho
    expect(csv).toContain('ID;Tipo;Emissor;Referencia;Vencimento;Valor (R$);CNPJ;Pago;Data Pagamento;Linha Digitavel');
    // Verifica formatacao da data e do valor
    expect(csv).toContain('1;BOLETO;ENEL;05/2026;15/05/2026;1234,56;11222333000181;Nao;;');
  });
});

describe('generateCSV com perfil', () => {
  it('acrescenta a coluna Perfil no fim, sem mudar a posição das demais', () => {
    const doc = {
      id: '1', imageUri: '', ocrText: '', isPaid: 0, createdAt: '', documentType: 'BOLETO',
      issuer: 'ENEL', referenceMonth: '10/2026', cnpj: null, cpf: null,
      totalAmountCents: 18131, dueDate: '2026-11-10', boletoLine: null,
    } as any;
    const [header, row] = generateCSV([doc], 'yuri').replace('﻿', '').split('\n');
    expect(header.split(';').at(-1)).toBe('Perfil');
    const cols = row.split(';');
    expect(cols[2]).toBe('ENEL');
    expect(cols[5]).toBe('181,31');
    expect(cols.at(-1)).toBe('yuri');
  });
});
