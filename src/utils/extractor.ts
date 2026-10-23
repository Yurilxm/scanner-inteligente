import { ExtractedFields, DocumentType } from '../types/document';
import { getCachedCNPJ, saveCachedCNPJ } from '../db/database';

function cleanText(text: string) {
  if (!text) return '';
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ');
}

// Remove CNPJ, CPF, boleto, datas e mes/ano para evitar falsos positivos em valores
function removeNoiseForValues(text: string): string {
  return text
    .replace(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g, ' [CNPJ] ')
    .replace(/\b\d{14}\b/g, ' [CNPJ] ')
    .replace(/\d{3}\.\d{3}\.\d{3}-\d{2}/g, ' [CPF] ')
    .replace(/\d{5}\.\d{5}\s+\d{5}\.\d{6}\s+\d{5}\.\d{6}\s+\d\s+\d{14}/g, ' [BOLETO] ')
    .replace(/\d{2}\/\d{2}\/\d{4}/g, ' [DATE] ')
    .replace(/\b\d{2}\/\d{4}\b/g, ' [MONTHYEAR] ');
}

// ============ VALOR ============
function extractValueNear(text: string, keywords: string[]): number | null {
  const cleaned = removeNoiseForValues(text);
  for (const kw of keywords) {
    // 1. Prefere decimais (462,06 ou 462.06)
    const regexDecimal = new RegExp(`${kw}[^\\d]{0,80}?(?:R\\$\\s*)?(\\d{1,3}(?:\\.\\d{3})*[.,]\\d{2})`, 'gi');
    for (const match of cleaned.matchAll(regexDecimal)) {
      let val = match[1];
      if (val.includes(',') && val.includes('.')) val = val.replace(/\./g, '').replace(',', '.');
      else if (val.includes(',')) val = val.replace(',', '.');
      const parsed = Math.round(parseFloat(val) * 100);
      if (parsed > 0) return parsed;
    }
    // 2. Inteiros exigem R$ explicito (evita pegar ano)
    const regexInt = new RegExp(`${kw}[^\\d]{0,40}(?:R\\$\\s*)(\\d{3,})`, 'gi');
    for (const match of cleaned.matchAll(regexInt)) {
      const num = parseInt(match[1], 10);
      if (num > 0 && num < 10000) return num * 100;
    }
  }
  return null;
}

function extractValueFallback(text: string): number | null {
  const cleaned = removeNoiseForValues(text);
  // 1. Prefere decimais, exclui anos (1900-2100)
  const decimalMatches = cleaned.match(/(\d{1,3}(?:\.\d{3})*[.,]\d{2})/g);
  if (decimalMatches) {
    const parsed = decimalMatches
      .map(v => {
        let val = v;
        if (val.includes(',') && val.includes('.')) val = val.replace(/\./g, '').replace(',', '.');
        else if (val.includes(',')) val = val.replace(',', '.');
        return parseFloat(val);
      })
      .filter(v => v > 0 && v < 10000 && !(v >= 1900 && v <= 2100));
    if (parsed.length > 0) return Math.round(Math.max(...parsed) * 100);
  }
  // 2. Inteiros apenas com R$
  const ints: number[] = [];
  for (const m of cleaned.matchAll(/R\$\s*(\d{3,})/g)) {
    const num = parseInt(m[1], 10);
    if (num > 0 && num < 10000) ints.push(num);
  }
  if (ints.length > 0) return Math.max(...ints) * 100;
  return null;
}

// ============ DATA ============
function extractDateNear(text: string, keywords: string[]): string | null {
  for (const kw of keywords) {
    const regex = new RegExp(`${kw}[^\\d]{0,50}?(\\d{2})[\\/\\.\\-](\\d{2})[\\/\\.\\-](\\d{4})`, 'i');
    const match = text.match(regex);
    if (match) return `${match[3]}-${match[2]}-${match[1]}`;
  }
  return null;
}

// ============ REFERÊNCIA ============
function extractReference(text: string): string | null {
  // 1. Período: "10/09/2026 - 09/10/2026" (pega o MM/YYYY da data final)
  const periodMatch = text.match(/(\d{2})\/(\d{2})\/(\d{4})\s*[-\u2013]\s*(\d{2})\/(\d{2})\/(\d{4})/);
  if (periodMatch) {
    return `${periodMatch[5]}/${periodMatch[6]}`;
  }

  // 2. Keyword "Referência" ou "Mês/Ano" seguido de MM/AAAA
  const keywordMatch = text.match(/(?:MES\/ANO|Referencia|NESANO|PERIODO DE REFERENCIA)[^\d]{0,40}(\d{2})[\/\.\-\s](\d{4})/i);
  if (keywordMatch) {
    return `${keywordMatch[1]}/${keywordMatch[2]}`;
  }

  return null;
}

// ============ CNPJ ============
function extractCNPJ(text: string): string | null {
  // Formato com máscara: 34.185.306/0001-81
  const masked = text.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/);
  if (masked) return masked[0].replace(/\D/g, '');

  // Formato sem máscara (14 dígitos seguidos, mas só se estiver perto de "CNPJ" ou "Beneficiário")
  const contextMatch = text.match(/(?:CNPJ|BENEFICIARIO|CEDENTE)[^\d]{0,30}(\d{14})/i);
  if (contextMatch) return contextMatch[1];

  return null;
}

// ============ CNAE ============
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
  return null;
}

// ============ CONSULTA CNPJ (paralela, 4s timeout) ============
async function fetchCNPJData(cnpj: string): Promise<{ razao_social: string; categoria: string } | null> {
  const clean = cnpj.replace(/\D/g, '');
  let cached: any = null;
  try { cached = getCachedCNPJ(clean); } catch {}
  if (cached) return cached;

  const tryFetch = async (url: string, source: string) => {
    const controller = new AbortController();
    const timeout: any = setTimeout(() => controller.abort(), 4000);
    if (timeout && typeof timeout.unref === 'function') timeout.unref();
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (res.ok) return { source, data: await res.json() };
    } catch {} finally { clearTimeout(timeout); }
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
      let razao = '', cnae = '';
      if (source === 'BrasilAPI') {
        razao = data.razao_social || ''; cnae = String(data.cnae_fiscal || '');
      } else if (source === 'OpenCNPJ') {
        razao = data.razao_social || ''; cnae = String(data.cnae_principal || '');
      } else if (source === 'PublicaCNPJ') {
        const est = data.estabelecimento || {}; const ativ = est.atividade_principal || {};
        razao = data.razao_social || ''; cnae = String(ativ.subclasse || '');
      }
      const cat = mapCNAEToCategory(cnae) || razao.split(' ').slice(0, 2).join(' ').toUpperCase() || 'OUTROS';
      const result = { razao_social: razao, categoria: cat };
      try { saveCachedCNPJ(clean, razao, cnae, '', cat); } catch {}
      return result;
    }
  }
  return null;
}

// ============ FALLBACK DE EMISSOR POR BENEFICIÁRIO ============
function extractIssuerFromBeneficiary(text: string): string | null {
  const benMatch = text.match(/(?:BENEFICIARIO|CEDENTE)[^A-Z0-9]+([A-Z0-9\s\.\-]{4,50})/i);
  if (!benMatch) return null;
  
  const name = benMatch[1]
    .replace(/\b(SA|S\.A\.|LTDA|ME|EPP|EIRELI|SOCIEDADE|ANONIMA|S\/A)\b/gi, '')
    .trim();
  
  if (/SICOOB|ITAU|BRADESCO|CAIXA|BB|BANCO DO BRASIL/i.test(name)) return null;
  
  // Regras por palavra-chave
  if (/CONDOMIN/i.test(name)) return 'CONDOMINIO';
  if (/FACULDADE|UNIVERSIDADE|UVA|ANHANGUERA|ESTACIO|UNIP|EDUCACIONAL/i.test(name)) return 'FACULDADE';
  if (/SEGURO|SEGURADORA|PORTO/i.test(name)) return 'SEGURO';
  if (/GAS|ULTRAGAZ|LIQUIGAS/i.test(name)) return 'GAS';
  if (/NETMAXXI|GIGA|FIBRA|TELECOM|INTERNET/i.test(name)) return 'INTERNET';
  if (/TIM|VIVO|CLARO/i.test(name)) return 'TELEFONIA';
  if (/ACADEMIA|FITNESS|SMART FIT|GYM/i.test(name)) return 'ACADEMIA';
  
  // Fallback: 2 primeiras palavras do nome
  const clean = name.split(' ').slice(0, 2).join(' ').toUpperCase();
  return clean.length >= 3 ? clean : null;
}

// ============ EXTRAÇÃO PRINCIPAL ============
export async function extractFields(
  rawData: any,
  learnedCategories: { pattern: string; category: string }[] = []
): Promise<ExtractedFields> {
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

  // 1. TIPO DE DOCUMENTO
  let documentType: DocumentType = 'OUTROS';
  if (/BENEFICIARIO|NOSSO NUMERO|LINHA DIGITAVEL|TOTAL A PAGAR|BOLETO|UVA|FACULDADE|EDUCACIONAL|UNIVERSIDADE/i.test(text)) documentType = 'BOLETO';
  else if (/PIX/i.test(text) && !/BENEFICIARIO/i.test(text)) documentType = 'PIX';
  else if (/NOTA FISCAL|DANFE/i.test(text)) documentType = 'NOTA_FISCAL';
  else if (/RECIBO/i.test(text)) documentType = 'RECIBO';

  // 2. CNPJ (extrair sempre, é útil para classificação)
  const cnpjClean = extractCNPJ(text);

  // 3. EMISSOR (ordem de prioridade)
  let issuer: string | null = null;
  const textLower = text.toLowerCase();

  // 3.1 Categorias aprendidas (usuário ensinou)
  for (const learned of learnedCategories) {
    const patternNorm = learned.pattern.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (patternNorm.length >= 3 && textLower.includes(patternNorm)) {
      issuer = learned.category;
      break;
    }
  }

  // 3.2 Beneficiário (extração inteligente)
  if (!issuer) {
    issuer = extractIssuerFromBeneficiary(text);
  }

  // 3.3 Lista fixa (palavras-chave no texto)
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
    else if (/TIM|VIVO|CLARO/i.test(text)) issuer = 'TELEFONIA';
    else if (/ACADEMIA|FITNESS|SMART FIT|GYM/i.test(text)) issuer = 'ACADEMIA';
  }

  // 3.4 CNPJ API (só se ainda não classificou e temos internet)
  if (!issuer && cnpjClean) {
    try {
      let timeoutHandle: any = null;
      const timeoutPromise = new Promise<null>(r => {
        timeoutHandle = setTimeout(() => r(null), 5000);
        if (timeoutHandle && typeof timeoutHandle.unref === 'function') timeoutHandle.unref();
      });
      const cnpjData = await Promise.race([fetchCNPJData(cnpjClean), timeoutPromise]);
      if (timeoutHandle) clearTimeout(timeoutHandle);
      if (cnpjData) issuer = cnpjData.categoria;
    } catch {}
  }

  // 4. VENCIMENTO
  let dueDate = extractDateNear(text, ['Vencimento', 'VENCIMENTO', 'Venc\\.', 'VENC\\.']);
  if (!dueDate) dueDate = extractDateNear(text, ['Data do Documento', 'Data Doc']);

  // 5. VALOR (prioriza keywords, depois maior valor)
  let totalAmountCents = extractValueNear(text, [
    'Total a Pagar', 'TOTAL A PAGAR',
    'Valor Total', 'VALOR TOTAL',
    'Valor do Documento', 'VALOR DO DOCUMENTO',
    'Valor do Docimento', 'VALOR DO DOCIMENTO',
    'Valor a Pagar', 'VALOR A PAGAR',
    'Valor', 'VALOR'
  ]);
  if (!totalAmountCents) {
    totalAmountCents = extractValueFallback(text);
  }

  // 6. REFERÊNCIA
  const referenceMonth = extractReference(text);

  // 7. LINHA DIGITÁVEL
  const boletoMatch = text.match(/\d{5}\.\d{5}\s+\d{5}\.\d{6}\s+\d{5}\.\d{6}\s+\d\s+\d{14}/);

  return {
    documentType,
    issuer,
    referenceMonth,
    cnpj: cnpjClean,
    cpf: null,
    totalAmountCents,
    dueDate,
    boletoLine: boletoMatch ? boletoMatch[0] : null,
  };
}
