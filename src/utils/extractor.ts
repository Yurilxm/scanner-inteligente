import { ExtractedFields, DocumentType } from '../types/document';
import { getCachedCNPJ, saveCachedCNPJ } from '../db/database';

interface OCRBlock {
  text: string;
  frame: { top: number; left: number; right: number; bottom: number };
}

function cleanText(text: string) {
  if (!text) return '';
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ');
}

function removeNonValuePatterns(text: string): string {
  return text
    .replace(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g, ' [CNPJ] ')
    .replace(/\d{3}\.\d{3}\.\d{3}-\d{2}/g, ' [CPF] ')
    .replace(/\d{5}\.\d{5}\s+\d{5}\.\d{6}\s+\d{5}\.\d{6}\s+\d\s+\d{14}/g, ' [BOLETO] ');
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
  const cleaned = removeNonValuePatterns(text);
  for (const kw of keywords) {
    const regex = new RegExp(`${kw}[^\\d]{0,100}(?:R\\$\\s*)?(\\d{1,3}(?:\\.\\d{3})*(?:[.,]\\d{2})?|\\d+(?:[.,]\\d{2})?)`, 'gi');
    const matches = [...cleaned.matchAll(regex)];
    for (const match of matches) {
      let val = match[1];
      if (!val.includes(',') && /^\d{1,3}\.\d{3}$/.test(val)) continue;
      if (val.includes(',') && val.includes('.')) val = val.replace(/\./g, '').replace(',', '.');
      else if (val.includes(',')) val = val.replace(',', '.');
      const parsed = Math.round(parseFloat(val) * 100);
      if (parsed > 0) return parsed;
    }
  }
  return null;
}

// Extração Posicional: busca o bloco de texto mais próximo da keyword
function extractByProximity(
  blocks: OCRBlock[],
  keywords: string[],
  type: 'value' | 'date'
): string | null {
  if (!blocks || blocks.length === 0) return null;

  // 1. Encontra o bloco da keyword
  let keywordBlock: OCRBlock | null = null;
  for (const block of blocks) {
    const normalized = cleanText(block.text).toLowerCase();
    if (keywords.some(kw => normalized.includes(kw.toLowerCase()))) {
      keywordBlock = block;
      break;
    }
  }
  if (!keywordBlock) return null;

  // 2. Busca blocos que estão ABAIXO ou À DIREITA do bloco da keyword
  const candidates = blocks
    .filter(b => {
      if (b === keywordBlock) return false;
      const isBelow = b.frame.top > keywordBlock!.frame.bottom && b.frame.top - keywordBlock!.frame.bottom < 150;
      const isRight = Math.abs(b.frame.top - keywordBlock!.frame.top) < 30 && b.frame.left > keywordBlock!.frame.right;
      return isBelow || isRight;
    })
    .sort((a, b) => {
      const distA = Math.abs(a.frame.top - keywordBlock!.frame.bottom) + Math.abs(a.frame.left - keywordBlock!.frame.right);
      const distB = Math.abs(b.frame.top - keywordBlock!.frame.bottom) + Math.abs(b.frame.left - keywordBlock!.frame.right);
      return distA - distB;
    });

  // 3. Retorna o primeiro que corresponda ao padrão
  for (const candidate of candidates) {
    const text = cleanText(candidate.text);
    if (type === 'value') {
      const match = text.match(/(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})/);
      if (match) return match[1];
    } else if (type === 'date') {
      const match = text.match(/(\d{2})[\/\.\-](\d{2})[\/\.\-](\d{4})/);
      if (match) return `${match[3]}-${match[2]}-${match[1]}`;
    }
  }
  return null;
}

function mapCNAEToCategory(cnae: string): string | null {
  const code = cnae.replace(/\D/g, '');
  if (code.startsWith('351')) return 'ENERGIA';
  if (code.startsWith('360')) return 'AGUA';
  if (code.startsWith('352')) return 'GAS';
  if (code.startsWith('611')) return 'TELECOM';
  if (code.startsWith('811')) return 'CONDOMINIO';
  if (code.startsWith('853')) return 'FACULDADE';
  if (code.startsWith('651') || code.startsWith('662')) return 'SEGURO';
  if (code.startsWith('9313')) return 'ACADEMIA';
  if (code.startsWith('8630')) return 'SAUDE';
  if (code.startsWith('6911')) return 'JURIDICO';
  return null;
}

async function fetchCNPJData(cnpj: string): Promise<{ razao_social: string; cnae_fiscal: string; cnae_descricao: string; categoria: string } | null> {
  const clean = cnpj.replace(/\D/g, '');
  const cached = getCachedCNPJ(clean);
  if (cached) return cached;

  const tryFetch = async (url: string, source: string): Promise<{ source: string; data: any } | null> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (res.ok) return { source, data: await res.json() };
    } catch (e) {} finally { clearTimeout(timeout); }
    return null;
  };

  const results = await Promise.allSettled([
    tryFetch(`https://brasilapi.com.br/api/cnpj/v1/${clean}`, 'BrasilAPI'),
    tryFetch(`https://api.opencnpj.org/${clean}`, 'OpenCNPJ'),
    tryFetch(`https://publica.cnpj.ws/cnpj/${clean}`, 'PublicaCNPJ'),
  ]);

  for (const settled of results) {
    if (settled.status === 'fulfilled' && settled.value) {
      const { source, data } = settled.value;
      let razao = '', cnae = '', descricao = '';
      if (source === 'BrasilAPI') {
        razao = data.razao_social || ''; cnae = String(data.cnae_fiscal || ''); descricao = data.cnae_fiscal_descricao || '';
      } else if (source === 'OpenCNPJ') {
        razao = data.razao_social || ''; cnae = String(data.cnae_principal || ''); descricao = data.cnae_descricao || '';
      } else if (source === 'PublicaCNPJ') {
        const est = data.estabelecimento || {}; const ativ = est.atividade_principal || {};
        razao = data.razao_social || ''; cnae = String(ativ.subclasse || ''); descricao = ativ.descricao || '';
      }
      const cat = mapCNAEToCategory(cnae) || razao.split(' ').slice(0, 3).join(' ').toUpperCase() || 'OUTROS';
      const finalResult = { razao_social: razao, cnae_fiscal: cnae, cnae_descricao: descricao, categoria: cat };
      saveCachedCNPJ(clean, finalResult.razao_social, finalResult.cnae_fiscal, finalResult.cnae_descricao, finalResult.categoria);
      return finalResult;
    }
  }
  return null;
}

export async function extractFields(
  rawData: any,
  learnedCategories: { pattern: string; category: string }[] = []
): Promise<ExtractedFields> {
  let textInput = '';
  let blocks: OCRBlock[] = [];

  if (typeof rawData === 'string') {
    textInput = rawData;
  } else if (rawData) {
    const parts: string[] = [];
    if (rawData.text) parts.push(rawData.text);
    if (rawData.blocks && Array.isArray(rawData.blocks)) {
      for (const block of rawData.blocks) {
        if (block.text) parts.push(block.text);
        if (block.frame) blocks.push(block);
      }
    }
    textInput = parts.join(' ');
  }

  const text = cleanText(textInput);
  if (!text.trim()) {
    return { documentType: 'OUTROS', issuer: null, referenceMonth: null, cnpj: null, cpf: null, totalAmountCents: null, dueDate: null, boletoLine: null };
  }

  let documentType: DocumentType = 'OUTROS';
  if (/BENEFICIARIO|NOSSO NUMERO|LINHA DIGITAVEL|TOTAL A PAGAR|BOLETO|UVA|FACULDADE|EDUCACIONAL|UNIVERSIDADE/i.test(text)) documentType = 'BOLETO';
  else if (/PIX/i.test(text) && !/BENEFICIARIO/i.test(text)) documentType = 'PIX';
  else if (/NOTA FISCAL|DANFE/i.test(text)) documentType = 'NOTA_FISCAL';
  else if (/RECIBO/i.test(text)) documentType = 'RECIBO';

  // ========== EMISSOR ==========
  let issuer: string | null = null;
  const textLower = text.toLowerCase();

  for (const learned of learnedCategories) {
    const patternNorm = learned.pattern.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (patternNorm.length >= 3 && textLower.includes(patternNorm)) { issuer = learned.category; break; }
  }

  if (!issuer) {
    const benMatch = text.match(/(?:BENEFICIARIO|CEDENTE)[^A-Z0-9]+([A-Z0-9\s\.\-]{4,50})/i);
    if (benMatch) {
      const name = benMatch[1].replace(/\b(SA|S\.A\.|LTDA|ME|EPP|EIRELI|SOCIEDADE|ANONIMA)\b/gi, '').trim();
      if (!/SICOOB|ITAU|BRADESCO|CAIXA|BB|BANCO DO BRASIL/i.test(name)) {
        if (/CONDOMIN/i.test(name)) issuer = 'CONDOMINIO';
        else if (/FACULDADE|UNIVERSIDADE|UVA|ANHANGUERA|ESTACIO|UNIP|EDUCACIONAL/i.test(name)) issuer = 'FACULDADE';
        else if (/SEGURO|SEGURADORA|PORTO/i.test(name)) issuer = 'SEGURO';
        else if (/GAS|ULTRAGAZ|LIQUIGAS/i.test(name)) issuer = 'GAS';
        else if (/NETMAXXI|GIGA|FIBRA|TELECOM|INTERNET/i.test(name)) issuer = 'INTERNET';
        else if (/ENEL|LIGHT|CEMIG|COPEL/i.test(text)) issuer = 'ENERGIA';
        else if (/PROLAGOS|CEDAE|SABESP|COPASA/i.test(text)) issuer = 'AGUA';
        else if (/TIM|VIVO|CLARO|OI/i.test(text)) issuer = 'TELEFONIA';
        else if (/ACADEMIA|FITNESS|SMART FIT|GYM|BOA VIDA|BOM FISICO/i.test(name)) issuer = 'ACADEMIA';
        else {
          const cleanName = name.split(' ').slice(0, 2).join(' ').toUpperCase();
          if (cleanName.length >= 3) issuer = cleanName;
        }
      }
    }
  }

  if (!issuer) {
    if (/CONDOMIN/i.test(text)) issuer = 'CONDOMINIO';
    else if (/IPVA|DETRAN/i.test(text)) issuer = 'IPVA';
    else if (/SEGURO|SEGURADORA|PORTO SEGURO/i.test(text)) issuer = 'SEGURO';
    else if (/GAS|ULTRAGAZ|LIQUIGAS/i.test(text)) issuer = 'GAS';
    else if (/VISTORIA/i.test(text)) issuer = 'VISTORIA';
    else if (/FACULDADE|UNIVERSIDADE|\bUVA\b/i.test(text)) issuer = 'FACULDADE';
    else if (/ENEL/i.test(text)) issuer = 'ENEL';
    else if (/PROLAGOS/i.test(text)) issuer = 'PROLAGOS';
    else if (/NETMAXXI|GIGA MAIS|FIBRA|TELECOM|INTERNET/i.test(text)) issuer = 'INTERNET';
    else if (/TIM|VIVO|CLARO|\bOI\b/i.test(text)) issuer = 'TELEFONIA';
    else if (/ACADEMIA|FITNESS|SMART FIT|GYM/i.test(text)) issuer = 'ACADEMIA';
  }

  const cnpjMatch = text.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/);
  const cnpjClean = cnpjMatch ? cnpjMatch[0].replace(/\D/g, '') : null;

  if (!issuer && cnpjClean) {
    try {
      const cnpjData = await fetchCNPJData(cnpjClean);
      if (cnpjData) issuer = cnpjData.categoria;
    } catch {}
  }

  // ========== VENCIMENTO ==========
  let dueDate = extractDateNear(text, ['Vencimento', 'VENCIMENTO', 'Venc\\.', 'VENC\\.']);
  if (!dueDate) dueDate = extractDateNear(text, ['Data do Documento', 'Data Doc']);
  // Fallback posicional
  if (!dueDate) {
    const posDate = extractByProximity(blocks, ['Vencimento', 'VENCIMENTO', 'Venc'], 'date');
    if (posDate) dueDate = posDate;
  }

  // ========== VALOR ==========
  let totalAmountCents = extractValueNear(text, [
    'Total a Pagar', 'TOTAL A PAGAR', 'Valor Total', 'VALOR TOTAL',
    'Valor do Documento', 'VALOR DO DOCUMENTO', 'Valor do Docimento', 'VALOR DO DOCIMENTO',
    'Valor a Pagar', 'VALOR A PAGAR', 'Valor', 'VALOR'
  ]);

  // Fallback posicional
  if (!totalAmountCents) {
    const posValue = extractByProximity(blocks, ['Valor do Documento', 'VALOR DO DOCUMENTO', 'Total a Pagar', 'Valor'], 'value');
    if (posValue) {
      let val = posValue;
      if (val.includes(',') && val.includes('.')) val = val.replace(/\./g, '').replace(',', '.');
      else if (val.includes(',')) val = val.replace(',', '.');
      totalAmountCents = Math.round(parseFloat(val) * 100);
    }
  }

  // Fallback: maior valor com vírgula
  if (!totalAmountCents) {
    const cleaned = removeNonValuePatterns(text);
    const allValues = cleaned.match(/(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})/g);
    if (allValues) {
      const parsed = allValues.map(v => {
        let val = v;
        if (val.includes(',') && val.includes('.')) val = val.replace(/\./g, '').replace(',', '.');
        else val = val.replace(',', '.');
        return parseFloat(val);
      }).filter(v => v > 0 && v < 10000);
      if (parsed.length > 0) totalAmountCents = Math.round(Math.max(...parsed) * 100);
    }
  }

  // ========== REFERÊNCIA ==========
  let referenceMonth: string | null = null;
  const textWithoutDates = text.replace(/\d{2}\/\d{2}\/\d{4}/g, ' [DATE] ');

  const refMatch = textWithoutDates.match(/(?:MES\/ANO|Referencia|NESANO|PERIODO)[^\d]*(\d{2})[\/\.\-\s](\d{4})/i);
  if (refMatch) referenceMonth = `${refMatch[1]}/${refMatch[2]}`;

  if (!referenceMonth) {
    const looseMatch = textWithoutDates.match(/\b(\d{2})\/(\d{4})\b/);
    if (looseMatch) referenceMonth = `${looseMatch[1]}/${looseMatch[2]}`;
  }

  if (!referenceMonth) {
    const periodMatch = text.match(/(\d{2})\/(\d{2})\/(\d{4})\s*[-\u2013]\s*(\d{2})\/(\d{2})\/(\d{4})/);
    if (periodMatch) referenceMonth = `${periodMatch[5]}/${periodMatch[6]}`;
  }

  const boletoMatch = text.match(/\d{5}\.\d{5}\s+\d{5}\.\d{6}\s+\d{5}\.\d{6}\s+\d\s+\d{14}/);

  return {
    documentType, issuer, referenceMonth, cnpj: cnpjClean, cpf: null, totalAmountCents, dueDate,
    boletoLine: boletoMatch ? boletoMatch[0] : null,
  };
}
