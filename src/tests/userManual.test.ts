import { describe, expect, it } from 'vitest';
import { MANUAL, manualRuns } from '../data/userManual';

describe('uputstvo za upotrebu', () => {
  it('poglavlja imaju jedinstvene oznake, naslove i sadržaj', () => {
    expect(MANUAL.length).toBeGreaterThan(15);
    expect(new Set(MANUAL.map((c) => c.id)).size).toBe(MANUAL.length);
    for (const ch of MANUAL) {
      expect(ch.title.trim()).not.toBe('');
      expect(ch.sections.length).toBeGreaterThan(0);
      for (const s of ch.sections) expect(s.blocks.length, `${ch.title} / ${s.title}`).toBeGreaterThan(0);
    }
  });
  it('podebljan tekst: **tekst** i zatvorene zvezdice u svakom bloku', () => {
    expect(manualRuns('Kliknite **Sačuvaj** pa **Zatvori**.')).toEqual([{ text: 'Kliknite ', bold: false }, { text: 'Sačuvaj', bold: true }, { text: ' pa ', bold: false }, { text: 'Zatvori', bold: true }, { text: '.', bold: false }]);
    const texts = MANUAL.flatMap((c) => [c.intro ?? '', ...c.sections.flatMap((s) => s.blocks.flatMap((b) => ('p' in b ? [b.p] : 'tip' in b ? [b.tip] : 'warn' in b ? [b.warn] : 'steps' in b ? b.steps : b.list)))]);
    for (const t of texts) expect((t.match(/\*\*/g) ?? []).length % 2, t).toBe(0);
  });
  it('ne pominje obrisane stvari (stari modeli iz kataloga, „Specifikacija“ modela)', () => {
    const all = JSON.stringify(MANUAL);
    expect(all).not.toMatch(/Specifikacija modela|model 04|model 08/i);
  });
});
