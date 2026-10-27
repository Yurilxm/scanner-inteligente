import { ExtractedFields, DocumentType } from '../types/document';
import { getCachedCNPJ, saveCachedCNPJ } from '../db/database';
import { isValidCNPJ } from './validators';
import { validateBoletoLine, decodeBoletoLine } from './boleto';

export type ExtractOptions = {
  // Consulta o CNPJ em APIs publicas (BrasilAPI, OpenCNPJ, PublicaCNPJ). Desligado por padrao.
  allowCnpjLookup?: boolean;
};

function cleanText(text: string) {
  if (!text) return '';
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ');
}

function removeNoiseForValues(text: string): string {
  return text
    .replace(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g, ' [CNPJ] ')
    .replace(/\b\d{14}\b/g, ' [CNPJ] ')
    .replace(/\d{3}\.\d{3}\.\d{3}-\d{2}/g, ' [CPF] ')
    .replace(/\d{5}\.\d{5}\s+\d{5}\.\d{6}\s+\d{5}\.\d{6}\s+\d\s+\d{14}/g, ' [BOLETO] ')
    .replace(/\d{2}\/\d{2}\/\d{4}/g, ' [DATE] ')
    .replace(/\b\d{2}\/\d{4}\b/g, ' [MY] ');
}

// Normaliza valor (BR/EUA) -> centavos
function parseToCents(raw: string): number | null {
  let val = raw.trim();
  if (val.includes(',') && val.includes('.')) {
    val = val.replace(/\./g, '').replace(',', '.');
  } else if (val.includes(',')) {
    val = val.replace(',', '.');
  }
  const num = parseFloat(val);
  if (!isFinite(num) || num <= 0) return null;
  return Math.round(num * 100);
}

// VENCIMENTO tolerante: Vencimento, Venc, Vencirmanto, VENCIWENTO, NESANO...
function extractDueDate(text: string): string | null {
  const keywords = [
    'Vencimento', 'VENCIMENTO', 'Vencirmanto', 'VENCIWENTO',
    'Venclmento', 'Venciment0', 'Vencimento',
  ];
  // Com separadores explícitos
  for (const kw of keywords) {
    const regex = new RegExp(`${kw}[^\\d]{0,60}?(\\d{2})[\\/\\-\\.](\\d{2})[\\/\\-\\.](\\d{4})`, 'i');
    const m = text.match(regex);
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  }
  // Sem separador entre mês e ano (ex: 15/102026)
  for (const kw of keywords) {
    const regex = new RegExp(`${kw}[^\\d]{0,60}?(\\d{2})[\\/\\-\\.](\\d{2})(\\d{4})`, 'i');
    const m = text.match(regex);
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  }
  // Totalmente sem barras (ex: 5102026) — próxima de "Venc" com OCR ruim
  const noSlash = text.match(/(?:Venc|VENC|Vencirm)[a-z]*[^\d]{0,40}(\d{1,2})(\d{2})(\d{4})/);
  if (noSlash) {
    const day = noSlash[1].padStart(2, '0');
    return `${noSlash[3]}-${noSlash[2]}-${day}`;
  }
  // Venc. abreviado (teste)
  const abrev = text.match(/\bVenc\.[^\d]{0,20}?(\d{2})[\/\-](\d{2})[\/\-](\d{4})/i);
  if (abrev) return `${abrev[3]}-${abrev[2]}-${abrev[1]}`;

  // Fallback: primeira data DD/MM/AAAA ou DD/MMYYYY do texto
  // (ignora "Data do Documento" e "Data de Emissão")
  const textWithoutDates = text.replace(/(?:Data do Documento|Data de Emissao|Data de Emissão|Data Doc)[^\d]{0,40}\d{2}[\/\-.]\d{2}[\/\-.]\d{4}/gi, ' [DOC_DATE] ');
  const looseDate = textWithoutDates.match(/\b(\d{2})[\/\-](\d{2})(?:[\/\-]?)(\d{4})\b/);
  if (looseDate) {
    return `${looseDate[3]}-${looseDate[2]}-${looseDate[1]}`;
  }
  return null;
}

// VALOR priorizando TOTAL A PAGAR / TOTAL
function extractValue(text: string): number | null {
  const cleaned = removeNoiseForValues(text);

  // 1. Procura por "TOTAL A PAGAR" ou "TOTAL (R$)" ou "TOTAL APAGAR" — pega o ÚLTIMO match
  const totalPatterns = [
    'TOTAL\\s*A\\s*PAGAR', 'TOTAL\\s*APAGAR',
    'TOTAL\\s*\\(R\\$\\)', 'Total a Pagar',
  ];
  for (const pat of totalPatterns) {
    const regex = new RegExp(`(?:${pat})[^\\d]{0,150}?(?:R\\$\\s*)?(\\d{1,3}(?:\\.\\d{3})*[.,]\\d{2})`, 'gi');
    const matches = [...cleaned.matchAll(regex)];
    for (let i = matches.length - 1; i >= 0; i--) {
      const cents = parseToCents(matches[i][1]);
      if (cents && cents < 100000000) return cents;
    }
  }

  // 2. VALOR TOTAL (prioridade sobre Valor do Documento)
  const valorTotalPatterns = ['VALOR TOTAL', 'Valor Total', 'VALOR TOTAL A PAGAR'];
  for (const pat of valorTotalPatterns) {
    const regex = new RegExp(`(?:${pat})[^\\d]{0,150}?(?:R\\$\\s*)?(\\d{1,3}(?:\\.\\d{3})*[.,]\\d{2})`, 'gi');
    const matches = [...cleaned.matchAll(regex)];
    for (let i = matches.length - 1; i >= 0; i--) {
      const cents = parseToCents(matches[i][1]);
      if (cents && cents < 100000000) return cents;
    }
  }

  // 3. VALOR DO DOCUMENTO
  const valPatterns = ['Valor do documento', 'VALOR DO DOCUMENTO', 'VALOR DO DOCIMEN', 'Vaor do Docutmenta'];
  for (const pat of valPatterns) {
    const regex = new RegExp(`(?:${pat})[^\\d]{0,150}?(?:R\\$\\s*)?(\\d{1,3}(?:\\.\\d{3})*[.,]\\d{2})`, 'gi');
    const matches = [...cleaned.matchAll(regex)];
    for (let i = matches.length - 1; i >= 0; i--) {
      const cents = parseToCents(matches[i][1]);
      if (cents && cents < 100000000) return cents;
    }
  }

  // 3. Fallback: último valor decimal (anos não chegam aqui: a regex exige centavos)
  const decimals = cleaned.match(/(\d{1,3}(?:\.\d{3})*[.,]\d{2})/g);
  if (decimals) {
    const parsed = decimals
      .map(parseToCents)
      .filter((v): v is number => v !== null);
    if (parsed.length > 0) return parsed[parsed.length - 1];
  }

  // 4. Fallback final: valores com "R$" explícito, sem decimais
  const rsInts = [...cleaned.matchAll(/R\$\s*(\d{3,})/g)].map(m => parseInt(m[1], 10));
  if (rsInts.length > 0) return Math.max(...rsInts) * 100;

  return null;
}

// REFERÊNCIA
function extractReference(text: string): string | null {
  // 1. Período DD/MM/AAAA - DD/MM/AAAA (tolerante a O→0 no meio)
  const normalized = text
    // "1 O/" ou "1O/" ou "1 O " (próximo de barra/espaço) → "10"
    .replace(/(\d)\s*[Oo](?=\s*[\/\s])/g, '$10')
    // "1O2" (dígito O dígito) → "102"
    .replace(/(\d)[Oo](\d)/g, '$10$2')
    // "O/2026" isolado → "0/2026"
    .replace(/\b[Oo](\/\d{4})/g, '0$1');
  const periodMatch = normalized.match(/(\d{2})[\/\-](\d{2})[\/\-](\d{4})\s*[-\u2013]\s*(\d{2})[\/\-](\d{1,2})[\/\s]?(\d{4})/);
  if (periodMatch) {
    const month = periodMatch[5].padStart(2, '0');
    return `${month}/${periodMatch[6]}`;
  }

  // 2. Keywords (tolerante a erros do OCR)
  const keywords = ['MES\\/ANO', 'Referencia', 'REFERENCIUA', 'REFERENCIA', 'NESANO', 'PERIODO DE REFERENCIA'];
  for (const kw of keywords) {
    const regex = new RegExp(`(?:${kw})[^\\d]{0,60}?(\\d{2})[\\/\\.\\-\\s](\\d{4})`, 'i');
    const m = text.match(regex);
    if (m) return `${m[1]}/${m[2]}`;
  }
  return null;
}

// CNPJ (com fallback para OCR ruim)
function extractCNPJ(text: string): string | null {
  const masked = text.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/);
  if (masked) return masked[0].replace(/\D/g, '');

  const contextMatch = text.match(/(?:CNPJ|BENEFICIARIO|CEDENTE)[^\d]{0,40}(\d{14})/i);
  if (contextMatch) return contextMatch[1];

  return null;
}

// Linha digitavel: tolera pontos, espacos e hifens do OCR; descarta leituras com DV errado
const BOLETO_LINE_PATTERNS = [
  /\d{5}[.\s]?\d{5}\s*\d{5}[.\s]?\d{6}\s*\d{5}[.\s]?\d{6}\s*\d\s*\d{14}/g,  // bancario (47)
  /\d{11}[\s-]?\d\s*\d{11}[\s-]?\d\s*\d{11}[\s-]?\d\s*\d{11}[\s-]?\d/g,     // arrecadacao (48)
];

function extractBoletoLine(text: string): string | null {
  for (const pattern of BOLETO_LINE_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      const digits = match[0].replace(/\D/g, '');
      if (validateBoletoLine(digits)) return digits;
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
  return null;
}

let cnpjFetchDisabledUntil = 0;

async function fetchCNPJData(cnpj: string, allowNetwork: boolean): Promise<{ razao_social: string; categoria: string } | null> {
  const clean = cnpj.replace(/\D/g, '');
  // Cache local primeiro: funciona offline e sem enviar nada para fora
  let cached: any = null;
  try { cached = getCachedCNPJ(clean); } catch {}
  if (cached) return cached;

  // Rede só com consentimento do usuario e para CNPJ valido
  if (!allowNetwork || !isValidCNPJ(clean)) return null;
  if (Date.now() < cnpjFetchDisabledUntil) return null;

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
      if (source === 'BrasilAPI') { razao = data.razao_social || ''; cnae = String(data.cnae_fiscal || ''); }
      else if (source === 'OpenCNPJ') { razao = data.razao_social || ''; cnae = String(data.cnae_principal || ''); }
      else if (source === 'PublicaCNPJ') {
        const est = data.estabelecimento || {}; const ativ = est.atividade_principal || {};
        razao = data.razao_social || ''; cnae = String(ativ.subclasse || '');
      }
      const cat = mapCNAEToCategory(cnae) || razao.split(' ').slice(0, 2).join(' ').toUpperCase() || 'OUTROS';
      try { saveCachedCNPJ(clean, razao, cnae, '', cat); } catch {}
      return { razao_social: razao, categoria: cat };
    }
  }
  cnpjFetchDisabledUntil = Date.now() + 60000;
  return null;
}

// EMISSOR por palavra-chave (prioridade para marcas conhecidas)
function extractIssuerFromKeywords(text: string): string | null {
  if (/NETMAXX/i.test(text)) return 'NETMAXXI';
  if (/PROLAGOS/i.test(text)) return 'PROLAGOS';
  if (/\bENEL\b/i.test(text) || /AMPLA\s*ENERGIA/i.test(text)) return 'ENEL';
  if (/GIGA\s*MAIS|GIGA\+/i.test(text)) return 'GIGA MAIS';
  if (/CONDOMIN|CISNE\s*BRANC/i.test(text)) return 'CONDOMINIO';
  if (/\bUVA\b|ANTARES|EDUCACIONAL|FACULDADE|UNIVERSIDADE/i.test(text)) return 'FACULDADE';
  if (/IPVA|DETRAN/i.test(text)) return 'IPVA';
  if (/SEGURO|SEGURADORA|PORTO SEGURO/i.test(text)) return 'SEGURO';
  // \b evita falsos positivos como GASTOS, ESTIMADO, ULTIMO, DECLAROU
  if (/\bGAS\b|ULTRAGAZ|LIQUIGAS|COMGAS/i.test(text)) return 'GAS';
  if (/VISTORIA/i.test(text)) return 'VISTORIA';
  if (/\b(?:TIM|VIVO|CLARO)\b/i.test(text)) return 'TELEFONIA';
  if (/ACADEMIA|FITNESS|SMART FIT|\bGYM\b/i.test(text)) return 'ACADEMIA';
  return null;
}

function extractIssuerFromBeneficiary(text: string): string | null {
  // Boleto: Beneficiario/Cedente. Nota fiscal: Emitente/Razao Social. (Pagador é o cliente, não o emissor)
  const benMatch = text.match(/(?:BENEFICIARIO|CEDENTE|EMITENTE|RAZAO SOCIAL)[^A-Z0-9]+([A-Z0-9\s\.\-]{4,50})/i);
  if (!benMatch) return null;
  const name = benMatch[1]
    .replace(/\b(SA|S\.A\.|LTDA|ME|EPP|EIRELI|SOCIEDADE|ANONIMA|S\/A)\b/gi, '')
    .trim();
  if (/SICOOB|ITAU|BRADESCO|CAIXA|BB|BANCO DO BRASIL/i.test(name)) return null;
  const clean = name.split(' ').slice(0, 2).join(' ').toUpperCase();
  return clean.length >= 3 ? clean : null;
}


  export async function extractFields(
  rawData: any,
  learnedCategories: {

   pattern: string; category: string }[] = [],
  options: ExtractOptions = {}
): Promise<ExtractedFields> {
  let textInput = '';
  if (typeof rawData === 'string') textInput = rawData;
  else if (rawData) {
    const parts: string[] = [];
    if (rawData.text) parts.push(rawData.text);
    if (rawData.blocks && Array.isArray(rawData.blocks)) {
      for (const block of rawData.blocks) if (block.text) parts.push(block.text);
    }
    textInput = parts.join(' ');
  }

  const text = cleanText(textInput);
  // Logica especifica para PIX
  if (text.includes('Comprovante de transferencia Pix') || text.includes('Dados de quem recebeu')) {
    const r: ExtractedFields = {
      documentType: 'PIX',
      issuer: null,
      referenceMonth: null,
      cnpj: null,
      cpf: null,
      totalAmountCents: null,
      dueDate: null,
      boletoLine: null,
    };

    const nameMatch = text.match(/Dados de quem recebeu[\s\S]*?Nome\s+([\s\S]*?)(?=CPF\/CNPJ|CPF|CNPJ)/i);
    if (nameMatch) r.issuer = nameMatch[1].trim();

    const docMatch = text.match(/CPF\/CNPJ\s*([\d\.\-\/]+)/i);
    if (docMatch) {
      const docClean = docMatch[1].replace(/\D/g, '');
      if (docClean.length === 14) r.cnpj = docClean;
      if (docClean.length === 11) r.cpf = docClean;
    }

    const valMatch = text.match(/Valor:\s*R\$\s*([\d\.,]+)/i);
    if (valMatch) r.totalAmountCents = parseToCents(valMatch[1]);

    return r;
  }

  if (!text.trim()) {
    return { documentType: 'OUTROS', issuer: null, referenceMonth: null, cnpj: null, cpf: null, totalAmountCents: null, dueDate: null, boletoLine: null };
  }

  // 1. TIPO
  // Indicadores fortes de boleto vencem; os fracos (VALOR TOTAL etc.) também aparecem em notas fiscais
  const strongBoleto = /BENEFICIARIO|NOSSO NUMERO|LINHA DIGITAVEL|\bBOLETO\b|\bUVA\b|FACULDADE|EDUCACIONAL|UNIVERSIDADE|\bENEL\b|PROLAGOS|NETMAXX|SICOOB|CONDOMIN|CISNE BRANC/i;
  const weakBoleto = /TOTAL A PAGAR|VALOR DO DOCUMENTO|VALOR TOTAL/i;
  let documentType: DocumentType = 'OUTROS';
  if (strongBoleto.test(text)) documentType = 'BOLETO';
  else if (/NOTA FISCAL|DANFE/i.test(text)) documentType = 'NOTA_FISCAL';
  else if (weakBoleto.test(text)) documentType = 'BOLETO';
  else if (/\bPIX\b/i.test(text)) documentType = 'PIX';
  else if (/RECIBO/i.test(text)) documentType = 'RECIBO';

  // 2. CNPJ
  const cnpjClean = extractCNPJ(text);

  // 3. EMISSOR
  let issuer: string | null = null;
  const textLower = text.toLowerCase();

  // 3.1 Aprendido
  for (const learned of learnedCategories) {
    const patternNorm = learned.pattern.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (patternNorm.length >= 3 && textLower.includes(patternNorm)) {
      issuer = learned.category;
      break;
    }
  }

  // 3.2 Keyword (marcas conhecidas)
  if (!issuer) issuer = extractIssuerFromKeywords(text);

  // 3.3 Beneficiário
  if (!issuer) issuer = extractIssuerFromBeneficiary(text);

  // 3.4 CNPJ: cache local e, se permitido, API (último recurso)
  if (!issuer && cnpjClean) {
    try {
      let timeoutHandle: any = null;
      const timeoutPromise = new Promise<null>(r => {
        timeoutHandle = setTimeout(() => r(null), 5000);
        if (timeoutHandle && typeof timeoutHandle.unref === 'function') timeoutHandle.unref();
      });
      const cnpjData = await Promise.race([fetchCNPJData(cnpjClean, options.allowCnpjLookup === true), timeoutPromise]);
      if (timeoutHandle) clearTimeout(timeoutHandle);
      if (cnpjData) issuer = cnpjData.categoria;
    } catch {}
  }

  // 4. LINHA DIGITÁVEL (só aceita se os dígitos verificadores conferirem)
  const boletoLine = extractBoletoLine(text);
  const boleto = boletoLine ? decodeBoletoLine(boletoLine) : null;
  if (boleto && documentType === 'OUTROS') documentType = 'BOLETO';

  // 5. VENCIMENTO e 6. VALOR: a linha validada é mais confiável que o texto do OCR
  const dueDate = boleto?.dueDate ?? extractDueDate(text);
  const totalAmountCents = boleto?.amountCents ?? extractValue(text);

  // 7. REFERÊNCIA
  const referenceMonth = extractReference(text);

  return {
    documentType, issuer, referenceMonth, cnpj: cnpjClean, cpf: null, totalAmountCents, dueDate, boletoLine,
  };
}
