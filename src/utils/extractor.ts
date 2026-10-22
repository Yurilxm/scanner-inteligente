import { ExtractedFields } from '../types/document';
import { isValidCPF, isValidCNPJ, isValidBoleto, onlyDigits } from './validators';

function parseMoneyToCents(valueStr: string): number | null {
  const clean = valueStr.replace(/\./g, '').replace(',', '.').replace('R$', '').trim();
  const parsed = parseFloat(clean);
  if (isNaN(parsed)) return null;
  return Math.round(parsed * 100);
}

function parseDateToISO(dateStr: string): string | null {
  const parts = dateStr.split(/[\/\-]/);
  if (parts.length !== 3) return null;
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const year = parseInt(parts[2], 10);
  if (day < 1 || day > 31 || month < 1 || month > 12 || year < 2000 || year > 2100) return null;
  return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
}

export function extractFields(text: string): ExtractedFields {
  const result: ExtractedFields = {
    documentType: 'DESCONHECIDO',
    issuer: null,
    referenceMonth: null,
    cnpj: null,
    cpf: null,
    totalAmountCents: null,
    dueDate: null,
    boletoLine: null,
  };

  if (!text) return result;
  const upperText = text.toUpperCase();
  const lines = text.split('\n');

  // 1. Tipo (Prioriza Boleto/Conta sobre PIX)
  if (upperText.includes('BOLETO') || upperText.includes('LINHA DIGITAVEL') || upperText.includes('PAGAMENTO DE TITULO')) result.documentType = 'BOLETO';
  else if (upperText.includes('NOTA FISCAL') || upperText.includes('DANFE')) result.documentType = 'NOTA_FISCAL';
  else if (upperText.includes('CONTA DE') || upperText.includes('ENERGIA') || upperText.includes('AGUA') || upperText.includes('SANEAMENTO') || upperText.includes('DISTRIBUIDORA')) result.documentType = 'CONTA';
  else if (upperText.includes('RECIBO')) result.documentType = 'RECIBO';
  else if (upperText.includes('PIX') || upperText.includes('TRANSFERENCIA')) result.documentType = 'PIX';

  // 2. Emissor
  const issuers = ['ENEL', 'PROLAGOS', 'SABESP', 'CLARO', 'VIVO', 'TIM', 'OI', 'LIGHT', 'CEDAE', 'COMGAS'];
  for (const iss of issuers) {
    if (upperText.includes(iss)) { result.issuer = iss; break; }
  }

  // 3. Referência (MM/AAAA)
  const refRegex = /(?:REFERENCIA|REF\.|MES|COMPETENCIA)[:\s]*([A-Z]{3}\/?\d{4}|\d{2}\/\d{4})/i;
  const refMatch = text.match(refRegex);
  if (refMatch) result.referenceMonth = refMatch[1];

  // 4. Data de Vencimento (Força achar na linha de Vencimento)
  const dateRegex = /\b(0?[1-9]|[12]\d|3[01])[\/\-](0?[1-9]|1[0-2])[\/\-](\d{4}|\d{2})\b/g;
  const vencLine = lines.find(l => l.toUpperCase().includes('VENCIMENTO'));
  
  if (vencLine) {
    const match = vencLine.match(dateRegex);
    if (match) result.dueDate = parseDateToISO(match[0]);
  }
  
  // Fallback: se não achou na linha específica, procura no texto todo
  if (!result.dueDate) {
    const dateMatches = text.match(dateRegex);
    if (dateMatches) {
      // Ignora datas que parecem ser de emissão (geralmente o primeiro match do texto é a emissão)
      for (const dt of dateMatches) {
        if (!upperText.includes(`EMISSAO: ${dt}`) && !upperText.includes(`EMISSAO ${dt}`)) {
          result.dueDate = parseDateToISO(dt);
          break;
        }
      }
    }
  }

  // 5. CNPJ e CPF
  const cnpjRegex = /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g;
  const cnpjMatches = text.match(cnpjRegex);
  if (cnpjMatches) for (const m of cnpjMatches) { if (isValidCNPJ(m)) { result.cnpj = onlyDigits(m); break; } }

  const cpfRegex = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
  const cpfMatches = text.match(cpfRegex);
  if (cpfMatches) for (const m of cpfMatches) { if (isValidCPF(m)) { result.cpf = onlyDigits(m); break; } }

  // 6. Valor Total (Busca "TOTAL A PAGAR" e depois "VALOR TOTAL")
  const moneyRegex = /(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*|\d+),\d{2}/g;
  let totalLine = lines.find(l => l.toUpperCase().includes('TOTAL A PAGAR'));
  if (!totalLine) totalLine = lines.find(l => l.toUpperCase().includes('VALOR TOTAL'));
  if (!totalLine) totalLine = lines.find(l => l.toUpperCase().includes('VALOR A PAGAR'));
  if (!totalLine) totalLine = lines.find(l => l.toUpperCase().includes('VALOR DO DOCUMENTO'));

  if (totalLine) {
    const match = totalLine.match(moneyRegex);
    if (match) result.totalAmountCents = parseMoneyToCents(match[match.length - 1]);
  }

  // Fallback: pega o maior valor que encontrar
  if (result.totalAmountCents === null) {
    const allMoney = text.match(moneyRegex);
    if (allMoney) {
      let maxCents = 0;
      for (const m of allMoney) {
        const cents = parseMoneyToCents(m);
        if (cents && cents > maxCents) maxCents = cents;
      }
      if (maxCents > 0) result.totalAmountCents = maxCents;
    }
  }

  // 7. Linha Digitavel
  const cleanNumericText = text.replace(/[^\d\n\s]/g, '');
  for (const line of cleanNumericText.split('\n')) {
    const digits = onlyDigits(line);
    if ((digits.length === 47 || digits.length === 48) && isValidBoleto(digits)) {
      result.boletoLine = digits; break;
    }
  }

  return result;
}
