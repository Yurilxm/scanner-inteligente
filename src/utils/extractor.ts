import { ExtractedFields, DocumentType } from '../types/document';

function cleanText(text: string) {
  if (!text) return '';
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ');
}

function extractDateNear(text: string, keywords: string[]): string | null {
  for (const kw of keywords) {
    const regex = new RegExp(`${kw}[^\\d]*(\\d{2})[\\/\\.\\-\\s](\\d{2})[\\/\\.\\-\\s](\\d{4})`, 'i');
    const match = text.match(regex);
    if (match) return `${match[3]}-${match[2]}-${match[1]}`;
  }
  return null;
}

function extractValueNear(text: string, keywords: string[]): number | null {
  for (const kw of keywords) {
    const regex = new RegExp(`${kw}[^\\d]*(?:R\\$\\s*)?(\\d{1,3}(?:\\.\\d{3})*(?:[.,]\\d{2})?|\\d+(?:[.,]\\d{2})?)`, 'i');
    const match = text.match(regex);
    if (match) {
      let val = match[1];
      if (val.includes(',') && val.includes('.')) val = val.replace(/\./g, '').replace(',', '.');
      else if (val.includes(',')) val = val.replace(',', '.');
      return Math.round(parseFloat(val) * 100);
    }
  }
  return null;
}

export function extractFields(
  rawData: any,
  learnedCategories: { pattern: string; category: string }[] = []
): ExtractedFields {
  let textInput = '';
  if (typeof rawData === 'string') {
    textInput = rawData;
  } else if (rawData) {
    const parts: string[] = [];
    if (rawData.text) parts.push(rawData.text);
    if (rawData.blocks && Array.isArray(rawData.blocks)) {
      for (const block of rawData.blocks) if (block.text) parts.push(block.text);
    }
    textInput = parts.join(' ');
  }

  const text = cleanText(textInput);
  if (!text.trim()) {
    return { documentType: 'OUTROS', issuer: null, referenceMonth: null, cnpj: null, cpf: null, totalAmountCents: null, dueDate: null, boletoLine: null };
  }

  let documentType: DocumentType = 'OUTROS';
  if (/BENEFICIARIO|NOSSO NUMERO|LINHA DIGITAVEL|TOTAL A PAGAR|BOLETO/i.test(text)) documentType = 'BOLETO';
  else if (/PIX/i.test(text) && !/BENEFICIARIO/i.test(text)) documentType = 'PIX';
  else if (/NOTA FISCAL|DANFE/i.test(text)) documentType = 'NOTA_FISCAL';
  else if (/RECIBO/i.test(text)) documentType = 'RECIBO';

  // 1. PRIMEIRO: Verifica categorias aprendidas
  let issuer: string | null = null;
  const textLower = text.toLowerCase();
  
  for (const learned of learnedCategories) {
    const patternNorm = learned.pattern.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (patternNorm.length >= 3 && textLower.includes(patternNorm)) {
      issuer = learned.category;
      break;
    }
  }
  
  // 2. SEGUNDO: Lista branca (empresas conhecidas)
  if (!issuer) {
    if (/CONDOMINIO/i.test(text)) issuer = 'CONDOMINIO';
    else if (/IPVA|DETRAN/i.test(text)) issuer = 'IPVA';
    else if (/SEGURO|SEGURADORA|PORTO SEGURO/i.test(text)) issuer = 'SEGURO';
    else if (/GAS|ULTRAGAZ|LIQUIGAS/i.test(text)) issuer = 'GAS';
    else if (/VISTORIA/i.test(text)) issuer = 'VISTORIA';
    else if (/FACULDADE|UNIVERSIDADE|UVA/i.test(text)) issuer = 'FACULDADE';
    else if (/ENEL/i.test(text)) issuer = 'ENEL';
    else if (/PROLAGOS/i.test(text)) issuer = 'PROLAGOS';
    else if (/NETMAXX|GIGA MAIS|FIBRA|TELECOM|INTERNET/i.test(text)) issuer = 'INTERNET';
    else if (/TIM|VIVO|CLARO|OI/i.test(text)) issuer = 'TELEFONIA';
  }
  
  // 3. TERCEIRO: Fallback genérico (Beneficiário)
  if (!issuer) {
    const benMatch = text.match(/(?:BENEFICIARIO|CEDENTE)[^A-Z0-9]+([A-Z0-9\s\.\-]{4,30})/i);
    if (benMatch) {
      const name = benMatch[1].trim().split(' ').slice(0, 3).join(' ');
      if (!/SICOOB|ITAU|BRADESCO|CAIXA|BB|BANCO/i.test(name)) {
        issuer = name.toUpperCase();
      }
    }
  }

  let dueDate = extractDateNear(text, ['Vencimento', 'VENCIMENTO', 'Venc\\.', 'VENC\\.']);
  if (!dueDate) dueDate = extractDateNear(text, ['Data do Documento', 'Data Doc']);

  let totalAmountCents = extractValueNear(text, ['Total a Pagar', 'TOTAL A PAGAR', 'Valor Total', 'VALOR TOTAL', 'Valor do Documento', 'VALOR DO DOCUMENTO', 'Valor', 'VALOR']);
  if (!totalAmountCents) {
    const allValues = text.match(/(\d{1,3}(?:\.\d{3})*(?:[.,]\d{2})?|\d+(?:[.,]\d{2})?)/g);
    if (allValues) {
      const parsed = allValues.map(v => {
        let val = v;
        if (val.includes(',') && val.includes('.')) val = val.replace(/\./g, '').replace(',', '.');
        else if (val.includes(',')) val = val.replace(',', '.');
        return parseFloat(val);
      }).filter(v => v > 0 && v < 10000);
      if (parsed.length > 0) totalAmountCents = Math.round(Math.max(...parsed) * 100);
    }
  }

  let referenceMonth: string | null = null;
  const refMatch = text.match(/(?:MES\/ANO|Referencia|NESANO)[^\d]*(\d{2})[\/\.\-\s](\d{4})/i);
  if (refMatch) referenceMonth = `${refMatch[1]}/${refMatch[2]}`;

  const cnpjMatch = text.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/);
  const cnpjClean = cnpjMatch ? cnpjMatch[0].replace(/\D/g, '') : null;
  const boletoMatch = text.match(/\d{5}\.\d{5}\s+\d{5}\.\d{6}\s+\d{5}\.\d{6}\s+\d\s+\d{14}/);

  return {
    documentType, issuer, referenceMonth, cnpj: cnpjClean, cpf: null, totalAmountCents, dueDate,
    boletoLine: boletoMatch ? boletoMatch[0] : null,
  };
}
