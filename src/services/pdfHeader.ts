import markUrl from '../assets/logo.png';
import wideUrl from '../assets/logo-wide.png';

/* eslint-disable @typescript-eslint/no-explicit-any */
export const BRAND_DARK = '#4a0810';
export const BRAND_RED = '#d71920';
export const AMBER = '#ffc247';

export async function toDataUrl(url: string): Promise<string> {
  const blob = await (await fetch(url)).blob();
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(new Error('Logotip nije učitan.'));
    r.readAsDataURL(blob);
  });
}

export interface HeaderLogos {
  /** okrugli znak firme (skroz levo) */
  mark: string;
  /** logotip ALU TIM 012 (natpis) */
  wide: string;
}

export async function loadHeaderLogos(): Promise<HeaderLogos> {
  const [mark, wide] = await Promise.all([toDataUrl(markUrl), toDataUrl(wideUrl)]);
  return { mark, wide };
}

/**
 * Zaglavlje dokumenata (krojna lista, radni nalog, ponuda): tamnocrvena traka sa okruglim znakom skroz levo, pa logotipom
 * ALU TIM 012, podacima firme i naslovom dokumenta sa desne strane.
 */
export function docHeader(title: string, subtitle: string, companyName: string, contact: string, logos: HeaderLogos): any {
  return {
    table: {
      widths: [68, 150, '*', 'auto'],
      body: [[
        { image: logos.mark, width: 52, margin: [10, 8, 0, 8] },
        { image: logos.wide, width: 138, margin: [4, 13, 0, 13] },
        // naziv firme se piše samo ako se razlikuje od logotipa
        { stack: [...(/alu\s*tim/i.test(companyName) ? [] : [{ text: companyName, fontSize: 15, bold: true, color: '#ffffff' }]), { text: contact || 'Ograde i kapije po meri', fontSize: 8.5, color: '#e5c9cc', margin: [0, 2, 0, 0] }], margin: [6, 22, 6, 0] },
        { stack: [{ text: title, fontSize: 22, bold: true, color: AMBER, alignment: 'right' }, { text: subtitle, fontSize: 9, color: '#ffffff', alignment: 'right', margin: [0, 2, 0, 0] }], margin: [0, 10, 12, 0] },
      ]],
    },
    layout: { hLineWidth: () => 0, vLineWidth: () => 0, fillColor: () => BRAND_DARK, paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0 },
  };
}
