// Converte valor digitado pelo usuario (pt-BR) em centavos.
// Aceita: "1.234,56", "1234,56", "1234.56", "R$ 10", "1.234" (milhar). Retorna null se invalido.
export function parseBRLToCents(input: string): number | null {
  let val = input.replace(/R\$/gi, '').replace(/\s/g, '');
  if (!val) return null;

  if (val.includes(',')) {
    val = val.replace(/\./g, '').replace(',', '.');
  } else if (!/^\d+\.\d{1,2}$/.test(val)) {
    // Sem virgula: ponto so e decimal se for unico e seguido de 1-2 digitos
    val = val.replace(/\./g, '');
  }

  if (!/^\d+(\.\d{1,2})?$/.test(val)) return null;
  const num = parseFloat(val);
  if (!isFinite(num)) return null;
  return Math.round(num * 100);
}
