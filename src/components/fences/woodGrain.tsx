/**
 * Šara drveta za drvo dekore u SVG prikazima (karta boja, crtež ograde u editoru).
 * SVG filter: dva sloja šuma razvučena duž vlakana (široke pruge i fine linije godova) menjaju svetlinu boje
 * (soft-light), pa svaki dekor dobija svoje svetlije i tamnije pruge, a ton ostaje ton dekora.
 * Mere šuma su u jedinicama crteža (mm): pruge su iste na karti boja i na letvicama ograde.
 */

/** id filtera u zajedničkim definicijama (SvgDefs): vlakna vodoravno (letvice, kapije) ili uspravno (stubovi) */
export const WOOD_FILTER_ID = { h: 'wood-grain-h', v: 'wood-grain-v' } as const;
export const woodFilter = (dir: 'h' | 'v'): string => `url(#${WOOD_FILTER_ID[dir]})`;

/** seme šuma iz naziva, da dekori na karti nemaju iste pruge */
export function grainSeed(key: string): number {
  let h = 7;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) % 997;
  return h + 1;
}

export function GrainFilter({ id, dir = 'h', seed = 3, strength = 1 }: { id: string; dir?: 'h' | 'v'; seed?: number; strength?: number }) {
  // osnovna frekvencija u mm: duž vlakana dugačke pruge (~600 mm), poprečno guste (~18 mm i ~3 mm)
  const f = (along: number, across: number) => (dir === 'h' ? `${along} ${across}` : `${across} ${along}`);
  const k = 2.6 * strength; // kontrast šuma (0,5 je bez promene)
  const lin = { type: 'linear' as const, slope: k, intercept: 0.5 - 0.5 * k };
  return (
    <filter id={id} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency={f(0.0016, 0.055)} numOctaves={4} seed={seed} result="bands" />
      <feTurbulence type="fractalNoise" baseFrequency={f(0.004, 0.32)} numOctaves={2} seed={seed + 11} result="lines" />
      <feComposite in="bands" in2="lines" operator="arithmetic" k1={0} k2={0.62} k3={0.38} k4={0} result="mix" />
      <feColorMatrix in="mix" type="matrix" values="1 0 0 0 0  1 0 0 0 0  1 0 0 0 0  0 0 0 0 1" result="gray" />
      <feComponentTransfer in="gray" result="grain">
        <feFuncR {...lin} /><feFuncG {...lin} /><feFuncB {...lin} />
      </feComponentTransfer>
      <feBlend in="grain" in2="SourceGraphic" mode="soft-light" result="wood" />
      <feComposite in="wood" in2="SourceGraphic" operator="in" />
    </filter>
  );
}

/** filteri za crtež ograde: idu u zajedničke definicije */
export function WoodGrainFilters() {
  return (
    <>
      <GrainFilter id={WOOD_FILTER_ID.h} dir="h" seed={5} />
      <GrainFilter id={WOOD_FILTER_ID.v} dir="v" seed={9} />
    </>
  );
}
