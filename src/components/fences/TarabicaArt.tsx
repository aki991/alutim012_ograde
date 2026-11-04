import { TARABICA, capTiers, tarabicaCapHeight, tarabicaDomeMm, tarabicaLayout } from '../../domain/models/tarabica';
import type { PostCap } from '../../domain/models/types';

/** Meša boju sa crnom (f < 0) ili belom (f > 0): ivice, senke i svetli odsjaj iste boje. */
export function mixHex(hex: string, f: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const ch = (v: number) => Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f);
  const r = ch((n >> 16) & 255), g = ch((n >> 8) & 255), b = ch(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

const EDGE = { stroke: '#000', strokeOpacity: 0.38 } as const;

/**
 * Polje tarabice u pogledu spreda, prema katalogu Ekoluka Key: iza su dve spojne kvadratne cevi 30 × 30 (vire iza krajnjih
 * tarabica), ispred kvadratne cevi 80 × 20 sa čepom tarabice K100018 (okovratnik i kupola), podignute od poda. Spoj sa
 * spojnim cevima nije potvrđen (zadnja strana ili varenje), pa se spojevi sa prednje strane ne crtaju.
 * Koordinate su u mm; (x, y) je gornji levi ugao polja između stubova.
 */
export function TarabicaArt({ x, y, w, h, barSize, gap, overhang, overhangs, lift, hex }: { x: number; y: number; w: number; h: number; barSize: number; gap: number; overhang: number; /** prepust levo i desno kad se razlikuje (krilo dvokrilne kapije) */ overhangs?: [number, number]; lift?: number; hex: string }) {
  const t = tarabicaLayout(w, h, barSize, gap, overhangs?.[0] ?? overhang, lift, overhangs?.[1] ?? overhang);
  const dome = tarabicaDomeMm(barSize);
  const capH = tarabicaCapHeight(barSize);
  const ex = TARABICA.collarExtraMm;
  const rails = [t.railTopMm, t.railBottomMm];
  const railFill = mixHex(hex, -0.1);
  const rimInset = Math.min(6, barSize * 0.07);
  const slats = Array.from({ length: t.count }, (_, i) => x + t.startMm + i * (barSize + t.gapMm));
  return (
    <g data-testid="tarabica-art">
      {/* spojne cevi 30 × 30 (iza tarabica): ceo svetli otvor, vire iza krajnjih tarabica */}
      {rails.map((ry) => (
        <g key={ry}>
          <rect x={x} y={y + ry} width={w} height={TARABICA.railMm} fill={railFill} />
          <rect x={x} y={y + ry} width={w} height={TARABICA.railMm} fill="url(#shade-h)" />
          <rect x={x} y={y + ry} width={w} height={TARABICA.railMm} fill="none" {...EDGE} strokeWidth={2} />
          {/* senka tarabice na cevi iza nje */}
          {slats.map((sx) => <rect key={sx} x={sx + barSize} y={y + ry} width={Math.min(8, t.gapMm)} height={TARABICA.railMm} fill="#000" fillOpacity={0.22} />)}
        </g>
      ))}
      {slats.map((sx) => {
        const top = y + capH;
        return (
          <g key={sx}>
            {/* cev 80 × 20 */}
            <rect x={sx} y={top} width={barSize} height={t.slatLenMm - capH} fill={hex} />
            <rect x={sx} y={top} width={barSize} height={t.slatLenMm - capH} fill="url(#shade-v)" />
            <rect x={sx} y={top} width={barSize} height={t.slatLenMm - capH} fill="none" {...EDGE} strokeWidth={2} />
            <line x1={sx + barSize * 0.12} y1={top + 6} x2={sx + barSize * 0.12} y2={y + t.slatLenMm - 6} stroke="#fff" strokeOpacity={0.45} strokeWidth={3} />
            {/* čep tarabice pun: okovratnik i kupola */}
            <rect x={sx - ex} y={y + dome} width={barSize + 2 * ex} height={TARABICA.collarMm} rx={1.5} fill={mixHex(hex, -0.04)} />
            <rect x={sx - ex} y={y + dome} width={barSize + 2 * ex} height={TARABICA.collarMm} rx={1.5} fill="url(#shade-h)" />
            <rect x={sx - ex} y={y + dome} width={barSize + 2 * ex} height={TARABICA.collarMm} rx={1.5} fill="none" {...EDGE} strokeWidth={2} />
            <path d={`M${sx} ${y + dome} A${barSize / 2} ${dome} 0 0 1 ${sx + barSize} ${y + dome} Z`} fill={hex} />
            <path d={`M${sx} ${y + dome} A${barSize / 2} ${dome} 0 0 1 ${sx + barSize} ${y + dome} Z`} fill="url(#shade-v)" />
            <path d={`M${sx} ${y + dome} A${barSize / 2} ${dome} 0 0 1 ${sx + barSize} ${y + dome} Z`} fill="none" {...EDGE} strokeWidth={2} />
            <path d={`M${sx + rimInset} ${y + dome} A${barSize / 2 - rimInset} ${dome - rimInset} 0 0 1 ${sx + barSize - rimInset} ${y + dome}`} fill="none" stroke="#fff" strokeOpacity={0.55} strokeWidth={2.5} />
            <path d={`M${sx + rimInset} ${y + dome} A${barSize / 2 - rimInset} ${dome - rimInset} 0 0 1 ${sx + barSize - rimInset} ${y + dome}`} fill="none" stroke="#000" strokeOpacity={0.12} strokeWidth={1} transform="translate(0.8 0.8)" />
          </g>
        );
      })}
    </g>
  );
}

/** Kapa stuba iz kataloga (ravna, pismo, rozetna) od ivice `base` naviše: stepenici su isti kao u 3D. */
export function CapArt({ kind, x, w, base, hex }: { kind: PostCap; x: number; w: number; base: number; hex: string }) {
  let yb = base;
  return (
    <g data-testid={`cap-${kind}`}>
      {capTiers(kind, w).map((tier, i) => {
        const pts = `${x - tier.bottomW / 2},${yb} ${x + tier.bottomW / 2},${yb} ${x + tier.topW / 2},${yb - tier.h} ${x - tier.topW / 2},${yb - tier.h}`;
        const top = yb - tier.h;
        yb = top;
        return (
          <g key={i}>
            <polygon points={pts} fill={hex} />
            <polygon points={pts} fill="url(#shade-v)" />
            <polygon points={pts} fill="none" {...EDGE} strokeWidth={2} strokeLinejoin="round" />
            {kind === 'pyramid' && i === 1 && <polygon points={`${x},${top} ${x + tier.bottomW / 2},${top + tier.h} ${x + tier.topW / 2},${top}`} fill="#000" fillOpacity={0.1} />}
            {kind === 'rosette' && i === 1 && <rect x={x - tier.topW / 2 + 6} y={top + 3} width={tier.topW - 12} height={3} fill="#fff" fillOpacity={0.4} />}
          </g>
        );
      })}
    </g>
  );
}
