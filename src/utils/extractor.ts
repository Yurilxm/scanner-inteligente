import { ExtractedFields } from '../types/document';
import { isValidCPF, isValidCNPJ, isValidBoleto, onlyDigits } from './validators';

// Converte valor monetario brasileiro (ex: "1.234,56") para centavos (123456)
function parseMoneyToCents(valueStr: string): number | null {
  const clean = valueStr.replace(/\./g, '').replace(',', '.').replace('R$', '').trim();
  const parsed = parseFloat(clean);
  if (isNaN(parsed)) return null;
  return Math.round(parsed * 100);
}

// Converte data brasileira (dd/mm/aaaa) para ISO (aaaa-mm-dd)
function parseDateToISO(dateStr: string): string | null {
  const parts = dateStr.split(/[\/\-]/);
  if (parts.length !== 3) return null;
  
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const year = parseInt(parts[2], 10);

  if (day < 1 || day > 31 || month < 1 || month > 12 || year < 2000 || year > 2100) return null;

  const mm = month.toString().padStart(2, '0');
  const dd = day.toString().padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

export function extractFields(text: string): ExtractedFields {
  const result: ExtractedFields = {
    documentType: 'DESCONHECIDO',
    cnpj: null,
    cpf: null,
    totalAmountCents: null,
    date: null,
    boletoLine: null,
  };

  if (!text) return result;

  const upperText = text.toUpperCase();

  // 1. Tipo de Documento
  if (upperText.includes('BOLETO') || upperText.includes('BANCO') || upperText.includes('PAGAMENTO')) {
    result.documentType = 'BOLETO';
  } else if (upperText.includes('NOTA FISCAL') || upperText.includes('DANFE') || upperText.includes('NF-E')) {
    result.documentType = 'NOTA_FISCAL';
  } else if (upperText.includes('RECIBO')) {
    result.documentType = 'RECIBO';
  } else if (upperText.includes('CONTA DE') || upperText.includes('ENERGIA') || upperText.includes('AGUA') || upperText.includes('INTERNET')) {
    result.documentType = 'CONTA';
  }

  // 2. CNPJ (Regex para capturar formatado ou nao)
  const cnpjRegex = /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g;
  const cnpjMatches = text.match(cnpjRegex);
  if (cnpjMatches) {
    for (const match of cnpjMatches) {
      if (isValidCNPJ(match)) {
        result.cnpj = onlyDigits(match);
        break;
      }
    }
  }

  // 3. CPF (Regex para capturar formatado ou nao)
  const cpfRegex = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
  const cpfMatches = text.match(cpfRegex);
  if (cpfMatches) {
    for (const match of cpfMatches) {
      if (isValidCPF(match)) {
        result.cpf = onlyDigits(match);
        break;
      }
    }
  }

  // 4. Data (dd/mm/aaaa)
  const dateRegex = /\b(0?[1-9]|[12]\d|3[01])[\/\-](0?[1-9]|1[0-2])[\/\-](\d{4}|\d{2})\b/g;
  const dateMatches = text.match(dateRegex);
  if (dateMatches) {
    for (const match of dateMatches) {
      const iso = parseDateToISO(match);
      if (iso) {
        result.date = iso;
        break;
      }
    }
  }

  // 5. Valor (foca em linhas com "Total" ou "Valor")
  const moneyRegex = /(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*|\d+),\d{2}/g;
  const moneyMatches = text.match(moneyRegex);
  if (moneyMatches) {
    // Logica MVP: procurar valor na mesma linha que "TOTAL". 
    // Se nao achar, pega o maior valor encontrado.
    const lines = text.split('\n');
    let totalLine = lines.find(l => l.toUpperCase().includes('TOTAL') || l.toUpperCase().includes('VALOR A PAGAR'));
    
    if (totalLine) {
      const match = totalLine.match(moneyRegex);
      if (match && match.length > 0) {
        result.totalAmountCents = parseMoneyToCents(match[match.length - 1]); // Pega o ultimo valor da linha do total
      }
    }

    // Fallback: pega o maior valor
    if (result.totalAmountCents === null) {
      let maxCents = 0;
      for (const m of moneyMatches) {
        const cents = parseMoneyToCents(m);
        if (cents && cents > maxCents) maxCents = cents;
      }
      if (maxCents > 0) result.totalAmountCents = maxCents;
    }
  }

  // 6. Linha Digitavel de Boleto (tenta achar sequencias longas de numeros)
  // Remove tudo que nao e numero e espaco para facilitar a busca
  const cleanNumericText = text.replace(/[^\d\n\s]/g, '');
  const lines = cleanNumericText.split('\n');
  
  for (const line of lines) {
    const digits = onlyDigits(line);
    if (digits.length === 47 || digits.length === 48) {
      if (isValidBoleto(digits)) {
        result.boletoLine = digits;
        break;
      }
    }
  }

  return result;
}
