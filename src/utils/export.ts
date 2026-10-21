import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { SavedDocument } from '../db/database';

// Gera uma string CSV com padrao brasileiro
export function generateCSV(documents: SavedDocument[]): string {
  const BOM = '\uFEFF'; // Excel pt-BR precisa do BOM para ler UTF-8
  const header = 'ID;Tipo;Data;Valor (R$);CNPJ;CPF;Linha Digitavel\n';

  const rows = documents.map(doc => {
    const valor = doc.totalAmountCents 
      ? (doc.totalAmountCents / 100).toFixed(2).replace('.', ',') 
      : '';
    
    // Formata data ISO (aaaa-mm-dd) para dd/mm/aaaa
    let data = doc.date || '';
    if (data.includes('-')) {
      const [y, m, d] = data.split('-');
      data = `${d}/${m}/${y}`;
    }

    return `${doc.id};${doc.documentType};${data};${valor};${doc.cnpj || ''};${doc.cpf || ''};${doc.boletoLine || ''}`;
  });

  return BOM + header + rows.join('\n');
}

// Exporta a lista para CSV e abre o menu de compartilhamento
export async function exportToCSV(documents: SavedDocument[]) {
  if (documents.length === 0) throw new Error('Nenhum documento para exportar.');

  const csvContent = generateCSV(documents);
  const file = new File(Paths.document, 'relatorio_documentos.csv');
  
  file.write(csvContent);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'text/csv',
      dialogTitle: 'Exportar CSV',
      UTI: 'public.comma-separated-values-text',
    });
  }
}

// Exporta a lista para PDF e abre o menu de compartilhamento
export async function exportToPDF(documents: SavedDocument[]) {
  if (documents.length === 0) throw new Error('Nenhum documento para exportar.');

  const html = `
    <html>
      <body style="font-family: sans-serif; padding: 20px;">
        <h1>Relatorio de Documentos</h1>
        <p>Gerado em: ${new Date().toLocaleDateString('pt-BR')}</p>
        
        <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
          <tr style="background-color: #f0f0f0;">
            <th style="border: 1px solid #ddd; padding: 8px;">Tipo</th>
            <th style="border: 1px solid #ddd; padding: 8px;">Data</th>
            <th style="border: 1px solid #ddd; padding: 8px;">Valor</th>
            <th style="border: 1px solid #ddd; padding: 8px;">CNPJ/CPF</th>
          </tr>
          ${documents.map(doc => {
            const valor = doc.totalAmountCents 
              ? `R$ ${(doc.totalAmountCents / 100).toFixed(2).replace('.', ',')}` 
              : '-';
            let data = doc.date || '-';
            if (data.includes('-')) {
              const [y, m, d] = data.split('-');
              data = `${d}/${m}/${y}`;
            }
            return `
              <tr>
                <td style="border: 1px solid #ddd; padding: 8px;">${doc.documentType}</td>
                <td style="border: 1px solid #ddd; padding: 8px;">${data}</td>
                <td style="border: 1px solid #ddd; padding: 8px;">${valor}</td>
                <td style="border: 1px solid #ddd; padding: 8px;">${doc.cnpj || doc.cpf || '-'}</td>
              </tr>
            `;
          }).join('')}
        </table>
      </body>
    </html>
  `;

  const { uri } = await Print.printToFileAsync({ html });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: 'Exportar PDF',
      UTI: 'com.adobe.pdf',
    });
  }
}
