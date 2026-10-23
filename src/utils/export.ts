import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { SavedDocument } from '../db/database';

function escapeCSV(value: string | null | undefined): string {
  if (!value) return '';
  const str = String(value);
  if (str.includes(';') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

export function generateCSV(documents: SavedDocument[]): string {
  const BOM = '\uFEFF';
  const header = 'ID;Tipo;Emissor;Referencia;Vencimento;Valor (R$);CNPJ;Pago;Data Pagamento;Linha Digitavel\n';
  const rows = documents.map(doc => {
    const valor = doc.totalAmountCents ? (doc.totalAmountCents / 100).toFixed(2).replace('.', ',') : '';
    let data = doc.dueDate || '';
    if (data.includes('-')) {
      const [y, m, d] = data.split('-');
      data = `${d}/${m}/${y}`;
    }
    
    // Formata a data de pagamento se existir
    let pDate = '';
    if (doc.paymentDate && doc.paymentDate.includes('-')) {
      const [y, m, d] = doc.paymentDate.split('-');
      pDate = `${d}/${m}/${y}`;
    }

    return `${escapeCSV(doc.id)};${escapeCSV(doc.documentType)};${escapeCSV(doc.issuer)};${escapeCSV(doc.referenceMonth)};${escapeCSV(data)};${escapeCSV(valor)};${escapeCSV(doc.cnpj)};${doc.isPaid ? 'Sim' : 'Nao'};${escapeCSV(pDate)};${escapeCSV(doc.boletoLine)}`;
  });
  return BOM + header + rows.join('\n');
}

export async function generateCSVFile(documents: SavedDocument[]) {
  if (documents.length === 0) throw new Error('Nenhum documento para exportar.');
  const csvContent = generateCSV(documents);
  const file = new File(Paths.document, 'relatorio_documentos.csv');
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
            const valor = doc.totalAmountCents ? `R$ ${(doc.totalAmountCents / 100).toFixed(2).replace('.', ',')}` : '-';
            let data = doc.dueDate || '-';
            if (data.includes('-')) {
              const [y, m, d] = data.split('-');
              data = `${d}/${m}/${y}`;
            }
            let pDate = '-';
            if (doc.paymentDate && doc.paymentDate.includes('-')) {
              const [y, m, d] = doc.paymentDate.split('-');
              pDate = `${d}/${m}/${y}`;
            }
            return `
              <tr>
                <td style="border: 1px solid #ddd; padding: 8px;">${doc.documentType}</td>
                <td style="border: 1px solid #ddd; padding: 8px;">${doc.issuer || '-'}</td>
                <td style="border: 1px solid #ddd; padding: 8px;">${doc.referenceMonth || '-'}</td>
                <td style="border: 1px solid #ddd; padding: 8px;">${data}</td>
                <td style="border: 1px solid #ddd; padding: 8px;">${valor}</td>
                <td style="border: 1px solid #ddd; padding: 8px;">${doc.isPaid ? 'PAGO' : 'PENDENTE'}</td>
                <td style="border: 1px solid #ddd; padding: 8px;">${pDate}</td>
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
