// Formatacao de valores e datas no padrao pt-BR (datas guardadas como YYYY-MM-DD)

// 123456 -> "1234,56" (sem milhar: usado em campos de edicao e no CSV)
export function centsToDecimal(cents: number | null | undefined): string {
  if (!cents) return '';
  return (cents / 100).toFixed(2).replace('.', ',');
}

// 123456 -> "R$ 1.234,56"
export function formatBRL(cents: number | null | undefined): string {
  if (!cents) return '';
  const [int, dec] = (cents / 100).toFixed(2).split('.');
  return `R$ ${int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${dec}`;
}

// "2026-11-10" -> "10/11/2026"
export function isoToBR(iso: string | null | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

// "10/11/2026", "1/11/26" -> "2026-11-10"; null se nao for uma data real
export function brDateToISO(input: string): string | null {
  const parts = input.trim().split('/');
  if (parts.length !== 3) return null;
  const [d, m, rawY] = parts;
  const y = rawY.length === 2 ? `20${rawY}` : rawY;
  if (!/^\d{1,2}$/.test(d) || !/^\d{1,2}$/.test(m) || !/^\d{4}$/.test(y)) return null;

  const day = Number(d), month = Number(m), year = Number(y);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

// Data de hoje no fuso do aparelho (toISOString usaria UTC e viraria o dia apos 21h no Brasil)
export function todayISO(now: Date = new Date()): string {
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${m}-${d}`;
}

// Mascara de digitacao: "10112026" -> "10/11/2026"
export function maskDateInput(text: string): string {
  const cleaned = text.replace(/\D/g, '');
  if (cleaned.length <= 2) return cleaned;
  if (cleaned.length <= 4) return `${cleaned.slice(0, 2)}/${cleaned.slice(2)}`;
  return `${cleaned.slice(0, 2)}/${cleaned.slice(2, 4)}/${cleaned.slice(4, 8)}`;
}
