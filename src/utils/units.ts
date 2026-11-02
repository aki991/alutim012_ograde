/** Centralne konverzije jedinica i formatiranje. Osnovna jedinica je mm. */
export const mmToM = (mm: number): number => mm / 1000;
export const mToMm = (m: number): number => Math.round(m * 1000);
export const mm2ToM2 = (mm2: number): number => mm2 / 1_000_000;

const nf = (digits: number) => new Intl.NumberFormat('sr-Latn-RS', { minimumFractionDigits: digits, maximumFractionDigits: digits });

export const fmtMm = (mm: number): string => `${nf(0).format(Math.round(mm))} mm`;
export const fmtM = (mm: number, digits = 2): string => `${nf(digits).format(mm / 1000)} m`;
export const fmtNum = (n: number, digits = 2): string => nf(digits).format(n);
export const fmtMoney = (n: number, currency = 'RSD', rateToEur = 117.2): string => {
  if (currency === 'EUR') return `${nf(2).format(n / rateToEur)} €`;
  return `${nf(0).format(Math.round(n))} ${currency}`;
};
export const fmtDate = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}.`;
};

/** Inicijali: prva slova reči (najviše dva); za jednu reč (npr. deo emaila) prva dva slova bez brojeva. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/[\s._-]+/).map((w) => w.replace(/[^\p{L}]/gu, '')).filter(Boolean);
  if (words.length === 0) return '';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
