import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { SavedDocument } from '../db/database';
import { centsToDecimal, formatBRL, isoToBR } from './format';

function escapeCSV(value: string | null | undefined): string {
  if (!value) return '';
  const str = String(value);
  if (str.includes(';') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

// Texto vindo do OCR/usuario entra no HTML do PDF; escapa para nao virar marcacao
export function escapeHTML(value: string | null | undefined): string {
  if (!value) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Perfil vai na ultima coluna: o preview do app le as colunas por posicao
export function generateCSV(documents: SavedDocument[], profile = ''): string {
  const BOM = '\uFEFF';
  const header = 'ID;Tipo;Emissor;Referencia;Vencimento;Valor (R$);CNPJ;Pago;Data Pagamento;Linha Digitavel;Perfil\n';
  const rows = documents.map(doc => {
    const valor = centsToDecimal(doc.totalAmountCents);
    const data = isoToBR(doc.dueDate);
    const pDate = isoToBR(doc.paymentDate);

    return `${escapeCSV(doc.id)};${escapeCSV(doc.documentType)};${escapeCSV(doc.issuer)};${escapeCSV(doc.referenceMonth)};${escapeCSV(data)};${escapeCSV(valor)};${escapeCSV(doc.cnpj)};${doc.isPaid ? 'Sim' : 'Nao'};${escapeCSV(pDate)};${escapeCSV(doc.boletoLine)};${escapeCSV(profile)}`;
  });
  return BOM + header + rows.join('\n');
}

export async function generateCSVFile(documents: SavedDocument[], profile = '') {
  if (documents.length === 0) throw new Error('Nenhum documento para exportar.');
  const csvContent = generateCSV(documents, profile);
  // Um arquivo por perfil, para nao sobrescrever o do outro na pasta do PC
  const safeProfile = profile.replace(/[^a-z0-9_-]/gi, '');
  const file = new File(Paths.document, safeProfile ? `relatorio_${safeProfile}.csv` : 'relatorio_documentos.csv');
  file.write(csvContent);
  return { uri: file.uri, content: csvContent };
}

export async function shareFile(uri: string, mimeType: string, dialogTitle: string, UTI: string) {
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType, dialogTitle, UTI });
  }
}

export async function generatePDFFile(documents: SavedDocument[]) {
  if (documents.length === 0) throw new Error('Nenhum documento para exportar.');
  const html = `
    <html>
      <head><meta charset="utf-8"></head>
      <body style="font-family: sans-serif; padding: 20px;">
        <h1>Relatorio de Contas</h1>
        <p>Gerado em: ${new Date().toLocaleDateString('pt-BR')}</p>
        <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
          <tr style="background-color: #f0f0f0;">
            <th style="border: 1px solid #ddd; padding: 8px;">Tipo</th>
            <th style="border: 1px solid #ddd; padding: 8px;">Emissor</th>
            <th style="border: 1px solid #ddd; padding: 8px;">Referencia</th>
            <th style="border: 1px solid #ddd; padding: 8px;">Vencimento</th>
            <th style="border: 1px solid #ddd; padding: 8px;">Valor</th>
            <th style="border: 1px solid #ddd; padding: 8px;">Status</th>
            <th style="border: 1px solid #ddd; padding: 8px;">Pagamento</th>
          </tr>
          ${documents.map(doc => {
            const valor = formatBRL(doc.totalAmountCents) || '-';
            const data = isoToBR(doc.dueDate) || '-';
            const pDate = isoToBR(doc.paymentDate) || '-';
            return `
              <tr>
                <td style="border: 1px solid #ddd; padding: 8px;">${escapeHTML(doc.documentType)}</td>
                <td style="border: 1px solid #ddd; padding: 8px;">${escapeHTML(doc.issuer) || '-'}</td>
                <td style="border: 1px solid #ddd; padding: 8px;">${escapeHTML(doc.referenceMonth) || '-'}</td>
                <td style="border: 1px solid #ddd; padding: 8px;">${escapeHTML(data)}</td>
                <td style="border: 1px solid #ddd; padding: 8px;">${valor}</td>
                <td style="border: 1px solid #ddd; padding: 8px;">${doc.isPaid ? 'PAGO' : 'PENDENTE'}</td>
                <td style="border: 1px solid #ddd; padding: 8px;">${escapeHTML(pDate)}</td>
              </tr>
            `;
          }).join('')}
        </table>
      </body>
    </html>
  `;
  const { uri } = await Print.printToFileAsync({ html });
  return { uri };
}
