// Linha digitavel (padrao Febraban)
// - 47 digitos: boleto bancario (cobranca). 3 campos com DV modulo 10 + DV geral modulo 11.
// - 48 digitos: arrecadacao (contas de consumo, tributos). 4 blocos de 11 digitos + DV,
//   modulo 10 ou 11 conforme o 3o digito (6/7 = mod10, 8/9 = mod11).

export type BoletoInfo = {
  kind: 'BANCARIO' | 'ARRECADACAO';
  amountCents: number | null; // null quando a linha nao traz valor (zerado ou so referencia)
  dueDate: string | null;     // YYYY-MM-DD; so boleto bancario traz vencimento
};

function mod10(digits: string): number {
  let sum = 0;
  let weight = 2;
  for (let i = digits.length - 1; i >= 0; i--) {
    const product = Number(digits[i]) * weight;
    sum += Math.floor(product / 10) + (product % 10);
    weight = weight === 2 ? 1 : 2;
  }
  return (10 - (sum % 10)) % 10;
}

// Soma ponderada com pesos 2..9 da direita para a esquerda
function sum11(digits: string): number {
  let sum = 0;
  let weight = 2;
  for (let i = digits.length - 1; i >= 0; i--) {
    sum += Number(digits[i]) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  return sum;
}

function mod11Bancario(digits: string): number {
  const dv = 11 - (sum11(digits) % 11);
  return dv === 0 || dv === 10 || dv === 11 ? 1 : dv;
}

function mod11Arrecadacao(digits: string): number {
  const rest = sum11(digits) % 11;
  return rest === 0 || rest === 1 ? 0 : 11 - rest;
}

function isValidBancario(line: string): boolean {
  const field1 = line.slice(0, 9);
  const field2 = line.slice(10, 20);
  const field3 = line.slice(21, 31);
  if (mod10(field1) !== Number(line[9])) return false;
  if (mod10(field2) !== Number(line[20])) return false;
  if (mod10(field3) !== Number(line[31])) return false;

  // Codigo de barras sem o DV geral: banco+moeda, fator+valor, campo livre
  const barcodeWithoutDv = line.slice(0, 4) + line.slice(33, 47) + field1.slice(4) + field2 + field3;
  return mod11Bancario(barcodeWithoutDv) === Number(line[32]);
}

function arrecadacaoModule(line: string): ((digits: string) => number) | null {
  if (line[0] !== '8') return null;
  if (line[2] === '6' || line[2] === '7') return mod10;
  if (line[2] === '8' || line[2] === '9') return mod11Arrecadacao;
  return null;
}

function isValidArrecadacao(line: string): boolean {
  const mod = arrecadacaoModule(line);
  if (!mod) return false;

  let barcode = '';
  for (let i = 0; i < 48; i += 12) {
    const block = line.slice(i, i + 11);
    if (mod(block) !== Number(line[i + 11])) return false;
    barcode += block;
  }
  // DV geral fica na 4a posicao do codigo de barras
  return mod(barcode.slice(0, 3) + barcode.slice(4)) === Number(barcode[3]);
}

export function validateBoletoLine(line: string): boolean {
  const digits = line.replace(/\D/g, '');
  if (digits.length === 47) return isValidBancario(digits);
  if (digits.length === 48) return isValidArrecadacao(digits);
  return false;
}

const DAY_MS = 24 * 60 * 60 * 1000;
// Fator 1000 = 03/07/2000 no ciclo original; em 22/02/2025 o fator passou de 9999 e voltou a 1000.
const FATOR_BASE_ORIGINAL = Date.UTC(1997, 9, 7);
const FATOR_BASE_NOVO = Date.UTC(2022, 4, 29);

function fatorToDate(fator: number, reference: Date): string | null {
  if (fator === 0) return null;
  const candidates = [FATOR_BASE_ORIGINAL + fator * DAY_MS];
  if (fator >= 1000) candidates.push(FATOR_BASE_NOVO + fator * DAY_MS);
  // O mesmo fator se repete a cada ciclo: fica com a data mais proxima da referencia
  const ref = reference.getTime();
  const best = candidates.reduce((a, b) => (Math.abs(b - ref) < Math.abs(a - ref) ? b : a));
  return new Date(best).toISOString().slice(0, 10);
}

// Extrai valor e vencimento de uma linha valida. Retorna null se a linha for invalida.
export function decodeBoletoLine(line: string, reference: Date = new Date()): BoletoInfo | null {
  const digits = line.replace(/\D/g, '');
  if (!validateBoletoLine(digits)) return null;

  if (digits.length === 47) {
    const amount = Number(digits.slice(37, 47));
    return {
      kind: 'BANCARIO',
      amountCents: amount > 0 ? amount : null,
      dueDate: fatorToDate(Number(digits.slice(33, 37)), reference),
    };
  }

  // Arrecadacao: 3o digito 6/8 = valor efetivo em reais; 7/9 = valor de referencia (nao e o valor a pagar)
  const barcode = [0, 12, 24, 36].map(i => digits.slice(i, i + 11)).join('');
  const isRealValue = digits[2] === '6' || digits[2] === '8';
  const amount = Number(barcode.slice(4, 15));
  return {
    kind: 'ARRECADACAO',
    amountCents: isRealValue && amount > 0 ? amount : null,
    dueDate: null,
  };
}
