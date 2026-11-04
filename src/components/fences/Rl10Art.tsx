import type { FenceParams } from '../../domain/models/types';
import { rl10Geometry, type Rl10End, type Rl10PostInfo } from '../../domain/models/rl10';

/**
 * 2D crtež sistema RL10 (pogled spreda, mere u mm). Inox delovi su svetli metal sa senkom (gradijenti iz SvgDefs).
 * Polje crta rukohvat i prečke (ispred stubova, sa završecima na slobodnim krajevima ili zglobom AK-5020K / AK-5022Y na spoju
 * sa stepeništem); stub crta stopu, čauru, cev sa lajsnom, prsten, vezu sa rukohvatom (podesiva AK-5001 pod nagibom) i nosače
 * prečki AK-5011Y.
 */
const INOX = '#c9d0d8';
const INOX_DARK = '#8b939d';
const EDGE = '#5d6670';


/** Rukohvat i prečke jednog polja: od ose do ose stubova (slobodan kraj sa prepustom i završetkom, spoj sa zglobom). */
export function Rl10FieldArt({ x0, x1, floorY, heightMm, params, left, right, tan = 0 }: {
  /** ose levog i desnog stuba (mm) */
  x0: number; x1: number;
  /** y nivoa poda (linije nagiba) kod levog stuba; polje stepeništa iskosi pozivalac */
  floorY: number; heightMm: number; params: FenceParams; left: { rail: Rl10End; rod: Rl10End }; right: { rail: Rl10End; rod: Rl10End };
  /** nagib polja (tangens) — za skraćenje cevi uz zglob */
  tan?: number;
}) {
  const g = rl10Geometry(heightMm, params);
  const d = g.dims;
  const k = Math.sqrt(1 + tan * tan);
  const railY = floorY - g.railAxisMm;
  // skraćenje (+) ili prepust (−) kraja duž cevi, preračunato na vodoravnu projekciju
  const ra = x0 + left.rail.insetMm / k;
  const rb = x1 - right.rail.insetMm / k;
  const pa = x0 + left.rod.insetMm / k;
  const pb = x1 - right.rod.insetMm / k;
  const rr = d.railDiaMm / 2;
  const cap = Math.max(6, d.railDiaMm * 0.16);
  return (
    <g data-rl10="field">
      {g.rodHeightsMm.map((h) => {
        const y = floorY - h;
        const r = g.rodDiaMm / 2;
        return (
          <g key={h}>
            <rect x={pa} y={y - r} width={pb - pa} height={2 * r} fill={INOX} />
            <rect x={pa} y={y - r} width={pb - pa} height={2 * r} fill="url(#shade-h)" />
            {/* završetak prečke AK-5012A */}
            {left.rod.kind === 'cap' && <rect x={pa - r * 0.7} y={y - r * 1.1} width={r * 1.4} height={r * 2.2} rx={r} fill={INOX_DARK} />}
            {right.rod.kind === 'cap' && <rect x={pb - r * 0.7} y={y - r * 1.1} width={r * 1.4} height={r * 2.2} rx={r} fill={INOX_DARK} />}
          </g>
        );
      })}
      {/* rukohvat P-1033 */}
      <rect x={ra} y={railY - rr} width={rb - ra} height={2 * rr} fill={INOX} />
      <rect x={ra} y={railY - rr} width={rb - ra} height={2 * rr} fill="url(#shade-h)" />
      <line x1={ra} y1={railY - rr * 0.45} x2={rb} y2={railY - rr * 0.45} stroke="#fff" strokeOpacity="0.55" strokeWidth={Math.max(2, rr * 0.18)} />
      {/* završetak rukohvata AK-5009 */}
      {left.rail.kind === 'cap' && <rect x={ra - cap} y={railY - rr * 1.04} width={cap * 1.6} height={rr * 2.08} rx={cap * 0.6} fill={INOX_DARK} />}
      {right.rail.kind === 'cap' && <rect x={rb - cap * 0.6} y={railY - rr * 1.04} width={cap * 1.6} height={rr * 2.08} rx={cap * 0.6} fill={INOX_DARK} />}
    </g>
  );
}

/** Stub RL10 na mestu `x`: stopa AK-5036X, cev P-1054 sa lajsnom P-AL2647, prsten AK-5062, veza i nosači prečki AK-5011Y. */
export function Rl10PostArt({ x, footY, lineY, heightMm, params, info }: {
  x: number;
  /** y mesta na kome stub stoji (gazište ili pod) */
  footY: number;
  /** y linije poda/nagiba na mestu stuba (od nje se mere visine prečki i rukohvata) */
  lineY: number;
  heightMm: number; params: FenceParams;
  info: Rl10PostInfo;
}) {
  const g = rl10Geometry(heightMm, params);
  const d = g.dims;
  const pr = d.postDiaMm / 2;
  const topY = lineY - g.postTopMm;
  const railAxisY = lineY - g.railAxisMm;
  const railBotY = lineY - (heightMm - d.railDiaMm);
  const sr = d.sleeveDiaMm / 2;
  const fr = d.flangeDiaMm / 2;
  const neck = Math.max(8, d.postDiaMm * 0.45);
  const cradleH = Math.min(Math.max(10, (railBotY - topY) * 0.3), 18);
  const tiltDeg = (info.tilt * 180) / Math.PI;
  const holderW = d.holderDiaMm;
  const holderH = d.holderDiaMm * 1.2;
  return (
    <g data-rl10="post" data-tilt={Math.round(tiltDeg)} data-joint={info.joint ? 'true' : 'false'}>
      {/* cev stuba P-1054 sa lajsnom u kanalu */}
      <rect x={x - pr} y={topY} width={2 * pr} height={footY - topY} fill={INOX} />
      <rect x={x - pr} y={topY} width={2 * pr} height={footY - topY} fill="url(#shade-v)" />
      <rect x={x - pr * 0.22} y={topY + d.ringMm} width={pr * 0.44} height={Math.max(0, footY - topY - d.ringMm - d.sleeveMm)} fill={INOX_DARK} fillOpacity="0.55" />
      {/* stopa AK-5036X: ploča i čaura */}
      <rect x={x - sr} y={footY - d.flangeMm - d.sleeveMm} width={2 * sr} height={d.sleeveMm} rx={Math.min(6, sr * 0.2)} fill={INOX} />
      <rect x={x - sr} y={footY - d.flangeMm - d.sleeveMm} width={2 * sr} height={d.sleeveMm} rx={Math.min(6, sr * 0.2)} fill="url(#shade-v)" />
      <rect x={x - fr} y={footY - d.flangeMm} width={2 * fr} height={d.flangeMm} rx={Math.min(4, d.flangeMm / 2)} fill={INOX_DARK} />
      {/* prsten AK-5062 na vrhu stuba */}
      {d.ringMm > 0 && <rect x={x - d.ringDiaMm / 2} y={topY} width={d.ringDiaMm} height={d.ringMm} rx={2} fill={INOX_DARK} />}
      {/* veza sa rukohvatom: vrat iz stuba; ležište (AK-5039N ravno, AK-5001 podesiva) prati nagib rukohvata; na spoju — kuglasti zglob */}
      {railBotY < topY && (
        <g>
          <rect x={x - neck / 2} y={railAxisY + d.railDiaMm / 2 * 0.6} width={neck} height={Math.max(0, topY - railAxisY - d.railDiaMm / 2 * 0.6)} fill={INOX} />
          <rect x={x - neck / 2} y={railAxisY + d.railDiaMm / 2 * 0.6} width={neck} height={Math.max(0, topY - railAxisY - d.railDiaMm / 2 * 0.6)} fill="url(#shade-v)" />
          {(
            <g transform={tiltDeg ? `rotate(${-tiltDeg} ${x} ${railBotY + cradleH * 0.5})` : undefined}>
              <path d={`M${x - d.railDiaMm * 0.42} ${railBotY - 2} L${x + d.railDiaMm * 0.42} ${railBotY - 2} L${x + neck * 0.6} ${railBotY + cradleH} L${x - neck * 0.6} ${railBotY + cradleH} Z`} fill={INOX_DARK} />
              {info.adjustable && <circle cx={x} cy={railBotY + cradleH} r={neck * 0.55} fill={INOX} stroke={EDGE} strokeWidth={1.5} />}
            </g>
          )}
        </g>
      )}
      {/* nosači prečki AK-5011Y: valjak sa otvorom za prečku (vidi se iznad i ispod prečke) i dva zavrtnja */}
      {g.rodHeightsMm.map((h) => (
        <g key={h}>
          <rect x={x - holderW / 2} y={lineY - h - holderH / 2} width={holderW} height={holderH} rx={holderW * 0.3} fill={INOX_DARK} stroke={EDGE} strokeWidth={Math.max(1.2, holderW * 0.05)} />
          <rect x={x - holderW * 0.34} y={lineY - h - holderH / 2 + 2} width={holderW * 0.2} height={holderH - 4} rx={holderW * 0.1} fill="#fff" fillOpacity="0.35" />
          <circle cx={x + holderW * 0.28} cy={lineY - h - holderH * 0.32} r={holderW * 0.07} fill="#2b3036" />
          <circle cx={x + holderW * 0.28} cy={lineY - h + holderH * 0.32} r={holderW * 0.07} fill="#2b3036" />
        </g>
      ))}
    </g>
  );
}

/** Zglob rukohvata AK-5020K i zglobovi prečki AK-5022Y na spoju ravnog dela i stepeništa: stoje sami, ne nosi ih stub. */
export function Rl10JointArt({ x, lineY, heightMm, params, joint }: {
  x: number; lineY: number; heightMm: number; params: FenceParams; joint: { left: number; right: number };
}) {
  const g = rl10Geometry(heightMm, params);
  const d = g.dims;
  const railAxisY = lineY - g.railAxisMm;
  const rr = d.railDiaMm * 0.58;
  const collar = (tan: number, dir: 1 | -1) => {
    const a = Math.atan(tan);
    const len = d.railJointMm * 0.5;
    return <rect key={dir} x={dir === 1 ? x + rr * 0.5 : x - rr * 0.5 - len} y={railAxisY - d.railDiaMm * 0.54} width={len} height={d.railDiaMm * 1.08} rx={d.railDiaMm * 0.12} fill={INOX_DARK} transform={`rotate(${(-a * 180) / Math.PI} ${x} ${railAxisY})`} />;
  };
  return (
    <g data-rl10="joint" data-testid="rl10-joint">
      {collar(joint.left, -1)}
      {collar(joint.right, 1)}
      <circle cx={x} cy={railAxisY} r={rr} fill={INOX} stroke={EDGE} strokeWidth={2} />
      <circle cx={x - rr * 0.3} cy={railAxisY - rr * 0.3} r={rr * 0.28} fill="#fff" fillOpacity="0.65" />
      {/* zglobovi prečki: isto kao rukohvat, samo sa manjom kuglom */}
      {g.rodHeightsMm.map((h) => {
        const y = lineY - h;
        const r = g.rodDiaMm * 0.8;
        const c = (tan: number, dir: 1 | -1) => {
          const a = Math.atan(tan);
          const len = d.rodJointMm * 0.5;
          return <rect key={dir} x={dir === 1 ? x + r * 0.5 : x - r * 0.5 - len} y={y - g.rodDiaMm * 0.54} width={len} height={g.rodDiaMm * 1.08} rx={g.rodDiaMm * 0.2} fill={INOX_DARK} transform={`rotate(${(-a * 180) / Math.PI} ${x} ${y})`} />;
        };
        return (
          <g key={`rj-${h}`}>
            {c(joint.left, -1)}
            {c(joint.right, 1)}
            <circle cx={x} cy={y} r={r} fill={INOX} stroke={EDGE} strokeWidth={1.2} />
          </g>
        );
      })}
    </g>
  );
}
