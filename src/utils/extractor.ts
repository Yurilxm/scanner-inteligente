import { ExtractedFields } from '../types/document';
import { isValidCPF, isValidCNPJ, isValidBoleto, onlyDigits } from './validators';

type Frame = { top: number; right: number; left: number; bottom: number };
type Element = { text: string; frame: Frame };
type OcrResult = { text: string; blocks?: any[] };

function parseMoneyToCents(valueStr: string): number | null {
  let str = valueStr.replace(/R\$/gi, '').replace(/\s/g, '');
  if (str.includes(',')) {
    str = str.replace(/\./g, '').replace(',', '.');
  } else {
    const parts = str.split('.');
    if (parts.length === 2 && parts[1].length === 3) {
      str = str.replace('.', '');
    }
  }
  const parsed = parseFloat(str);
  return isNaN(parsed) ? null : Math.round(parsed * 100);
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

function findValueNearLabel(
  elements: Element[],
  labelKeywords: string[],
  valueRegex: RegExp
): string | null {
  let labelEl: Element | undefined;
  for (const kw of labelKeywords) {
    labelEl = elements.find((el) => el.text.toUpperCase().includes(kw));
    if (labelEl) break;
  }
  if (!labelEl) return null;

  const candidates = elements.filter((el) => valueRegex.test(el.text));
  if (candidates.length === 0) return null;

  const validCandidates = candidates.filter((el) => {
    // Ignora numeros muito longos (ex: codigo de barras)
    const cleanNum = el.text.replace(/\D/g, '');
    if (cleanNum.length > 8) return false;

    const isBelow = el.frame.top > labelEl!.frame.top - 20 && el.frame.top < labelEl!.frame.top + 150;
    const isRightOrBelow = el.frame.left > labelEl!.frame.left - 50 || el.frame.top > labelEl!.frame.top + 20;
    return isBelow && isRightOrBelow;
  });

  if (validCandidates.length === 0) return null;

  validCandidates.sort((a, b) => {
    const distA = Math.sqrt(Math.pow(a.frame.left - labelEl!.frame.left, 2) + Math.pow(a.frame.top - labelEl!.frame.top, 2));
    const distB = Math.sqrt(Math.pow(b.frame.left - labelEl!.frame.left, 2) + Math.pow(b.frame.top - labelEl!.frame.top, 2));
    return distA - distB;
  });

  return validCandidates[0].text;
}

export function extractFields(data: string | OcrResult): ExtractedFields {
  let text = '';
  let elements: Element[] = [];

  if (typeof data === 'string') {
    text = data;
  } else {
    text = data.text;
    if (data.blocks) {
      for (const block of data.blocks) {
        for (const line of block.lines) {
          for (const el of line.elements) {
            elements.push(el);
          }
        }
      }
    }
  }

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

  // 1. Tipo
  if (upperText.includes('BOLETO') || upperText.includes('LINHA DIGITAVEL') || upperText.includes('PAGAMENTO DE TITULO') || upperText.includes('TOTAL A PAGAR') || upperText.includes('TOTAL APAGAR') || upperText.includes('AGENCIA/CÓDIGO')) result.documentType = 'BOLETO';
  else if (upperText.includes('NOTA FISCAL') || upperText.includes('DANFE')) result.documentType = 'NOTA_FISCAL';
  else if (upperText.includes('RECIBO')) result.documentType = 'RECIBO';
  else if (upperText.includes('PIX') || upperText.includes('TRANSFERENCIA')) result.documentType = 'PIX';

  // 2. Emissor
  const issuers = ['ENEL', 'PROLAGOS', 'SABESP', 'CLARO', 'VIVO', 'TIM', 'LIGHT', 'CEDAE', 'COMGAS', 'AMPLA'];
  for (const iss of issuers) {
    if (upperText.includes(iss)) { result.issuer = iss; break; }
  }

  // 3. CNPJ (CPF removido a pedido do usuario)
  const cnpjRegex = /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g;
  const cnpjMatches = text.match(cnpjRegex);
  if (cnpjMatches) {
    for (const m of cnpjMatches) { if (isValidCNPJ(m)) { result.cnpj = onlyDigits(m); break; } }
  }

  // 4. Linha Digitavel
  const cleanNumericText = text.replace(/[^\d\n\s]/g, '');
  for (const line of cleanNumericText.split('\n')) {
    const digits = onlyDigits(line);
    if ((digits.length === 47 || digits.length === 48) && isValidBoleto(digits)) {
      result.boletoLine = digits; break;
    }
  }

  // 5. Extracao por Coordenadas
  if (elements.length > 0) {
    const moneyRegex = /\b(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*|\d+)[.,](\d{2})\b/g;
    const dateRegex = /\b(0?[1-9]|[12]\d|3[01])[\/\-](0?[1-9]|1[0-2])[\/\-](\d{4}|\d{2})\b/g;
    const refRegex = /\b(0?[1-9]|1[0-2])[\/\-](\d{4}|\d{2})\b/g;

    const totalVal = findValueNearLabel(elements, ['TOTAL A PAGAR', 'VALOR TOTAL', 'VALOR A PAGAR', 'TOTAL APAGAR', 'TOTAL (R$)', 'TOTAL'], moneyRegex);
    if (totalVal) result.totalAmountCents = parseMoneyToCents(totalVal);

    const dueDateVal = findValueNearLabel(elements, ['VENCIMENTO'], dateRegex);
    if (dueDateVal) result.dueDate = parseDateToISO(dueDateVal);

    let refVal = findValueNearLabel(elements, ['REFERÊNCIA', 'REFERENCIA', 'MÊS REF', 'MES REF', 'MÊS/ANO', 'MÉSANO', 'NESANO', 'MÊS'], refRegex);
    
    // Fallback: se nao achou pelo label, busca qualquer padrao MM/AAAA no topo da imagem
    if (!refVal) {
      const standaloneRefRegex = /\b(0?[1-9]|1[0-2])\/(\d{4})\b/g;
      const allRefs = text.match(standaloneRefRegex);
      if (allRefs) {
        // Evita pegar a data de vencimento (ex: 10/11/2026 tem 10/11, nao 10/2026)
        const validRefs = allRefs.filter(r => !text.includes(`/${r.split('/')[1]}`)); 
        if (validRefs.length > 0) refVal = validRefs[0]; 
      }
    }

    if (refVal) result.referenceMonth = refVal;

    // Fallbacks
    if (!result.dueDate) {
      const match = text.match(dateRegex);
      if (match) result.dueDate = parseDateToISO(match[0]);
    }
    if (!result.totalAmountCents) {
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
  } else {
    // Fallback Linear (quando nao temos as coordenadas dos blocos)
    const refRegex = /(?:REFERENCIA|REF\.|MES|COMPETENCIA)[:\s]*([A-Z]{3}\/?\d{4}|\d{2}\/\d{4})/i;
    const refMatch = text.match(refRegex);
    if (refMatch) result.referenceMonth = refMatch[1];

    const dateRegex = /\b(0?[1-9]|[12]\d|3[01])[\/\-](0?[1-9]|1[0-2])[\/\-](\d{4}|\d{2})\b/g;
    const vencLine = text.split('\n').find(l => l.toUpperCase().includes('VENCIMENTO'));
    if (vencLine) {
      const match = vencLine.match(dateRegex);
      if (match) result.dueDate = parseDateToISO(match[0]);
    }

    const moneyRegex = /(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*|\d+),\d{2}/g;
    let totalLine = text.split('\n').find(l => {
      const u = l.toUpperCase();
      return u.includes('TOTAL A PAGAR') || u.includes('VALOR TOTAL') || u.includes('VALOR A PAGAR') || u.includes('VALOR:');
    });
    
    if (totalLine) {
      const match = totalLine.match(moneyRegex);
      if (match) result.totalAmountCents = parseMoneyToCents(match[match.length - 1]);
    }

    // Fallback final: se nao achou a linha exata, pega o maior valor do texto
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
  }

  return result;
}
