/** Isto pretraživanje naziva i šifri u svim listama: bez dijakritika, x = ×, tačka = zarez. */
export const normalizeSearch = (s: string): string => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'dj').replace(/×/g, 'x').replace(/,/g, '.');
