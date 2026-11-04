import type { ReactNode } from 'react';
import { computeInfill, panelRepeat } from '../../domain/geometry/infill';
import { PANEL_IMAGES } from '../../assets/panels';
import { MODEL_IMAGES } from '../../assets/models';
import { FENCE_MODELS, panelArt, panelTiles, railArt, railBands, RAIL_POST_MM } from '../../domain/models/catalog';
import type { FenceModelId } from '../../domain/models/types';
import { TarabicaArt } from './TarabicaArt';

export const GAP_TINT = '#cdd7d0';

/** Zajedničke definicije (gradijenti, uzorci) koje svi SVG prikazi koriste. */
export function SvgDefs() {
  return (
    <defs>
      <linearGradient id="shade-h" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#fff" stopOpacity="0.24" />
        <stop offset="0.45" stopColor="#fff" stopOpacity="0" />
        <stop offset="1" stopColor="#000" stopOpacity="0.28" />
      </linearGradient>
      <linearGradient id="shade-v" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#fff" stopOpacity="0.22" />
        <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
        <stop offset="1" stopColor="#000" stopOpacity="0.28" />
      </linearGradient>
      <linearGradient id="glass-grad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#d6ecef" stopOpacity="0.78" />
        <stop offset="1" stopColor="#9fc9d2" stopOpacity="0.55" />
      </linearGradient>
      <pattern id="decor-holes" width="220" height="220" patternUnits="userSpaceOnUse">
        <g fill={GAP_TINT} fillOpacity="0.9">
          <path d="M110 22C152 62 152 98 110 110C68 98 68 62 110 22Z" />
          <path d="M110 198C152 158 152 122 110 110C68 122 68 158 110 198Z" />
          <path d="M22 110C62 68 98 68 110 110C98 152 62 152 22 110Z" />
          <path d="M198 110C158 68 122 68 110 110C122 152 158 152 198 110Z" />
          <circle cx="0" cy="0" r="16" />
          <circle cx="220" cy="0" r="16" />
          <circle cx="0" cy="220" r="16" />
          <circle cx="220" cy="220" r="16" />
          <circle cx="110" cy="110" r="9" />
        </g>
      </pattern>
      <pattern id="ground-hatch" width="60" height="60" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <line x1="0" y1="0" x2="0" y2="60" stroke="#b9c2cc" strokeWidth="6" />
      </pattern>
      <marker id="arrow-end" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M0 0L10 5L0 10z" fill="#17212e" />
      </marker>
    </defs>
  );
}

interface InfillProps {
  modelId: FenceModelId;
  x: number;
  y: number;
  w: number;
  h: number;
  frame: number;
  barSize: number;
  gap: number;
  hex: string;
  /** ključ boje elementa; dok je boja modela, polje se crta po slici modela */
  colorKey?: string;
  /** levi stub je zajednički sa prethodnim poljem i već je nacrtan */
  skipLeftPost?: boolean;
  /** desni stub se crta posebno (uspravan stub uz stepenište) */
  skipRightPost?: boolean;
  /** stepenište: polje se iskosi, pa se crta samo rukohvat i prečke (bez slike sa stubovima) */
  sloped?: boolean;
  /** osa levog i desnog stuba (x, širina); ograde sa rukohvatom se crtaju od ose do ose */
  axis?: { x: number; w: number };
  /** broj prečki (modeli sa izborom broja prečki) */
  rodCount?: number;
  /** tarabica: razmak od poda (mm) */
  lift?: number;
  /** tarabica: prepust levo i desno kad se razlikuje (krilo dvokrilne kapije nema prepust uz sredinu) */
  edgeOverhang?: [number, number];
  /** jedinstveni sufiks za clipPath */
  uid: string;
}

const ACCENT_HEX = '#cdd3d9';

/** Horizontalna letvica sa senčenjem (izgled profila). */
function Bar({ x, y, w, h, hex }: { x: number; y: number; w: number; h: number; hex: string }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill={hex} />
      <rect x={x} y={y} width={w} height={h} fill="url(#shade-h)" />
    </g>
  );
}

/** Vertikalna letvica sa zaobljenim gornjim krajem. */
function RoundedPicket({ x, y, w, h, hex }: { x: number; y: number; w: number; h: number; hex: string }) {
  const r = Math.min(w / 2, h);
  const d = `M${x} ${y + h} L${x} ${y + r} A${r} ${r} 0 0 1 ${x + w} ${y + r} L${x + w} ${y + h} Z`;
  return (
    <g>
      <path d={d} fill={hex} />
      <path d={d} fill="url(#shade-v)" />
      <line x1={x + w / 2} y1={y + r * 0.5} x2={x + w / 2} y2={y + h} stroke="#000" strokeOpacity="0.12" strokeWidth={Math.max(2, w / 40)} />
    </g>
  );
}

/** Crta ispunu jednog polja (ram + model ispune) kao pravi SVG oblici. Koordinate u mm. */
export function InfillArt({ modelId, x, y, w, h, frame, barSize, gap, hex, colorKey, skipLeftPost, skipRightPost, sloped, axis, rodCount, lift, edgeOverhang, uid }: InfillProps) {
  // tarabica: detaljan crtež delova iz kataloga (u mestu „debljine rama“ je prepust spojnih cevi)
  if (FENCE_MODELS[modelId].style === 'tarabica') return <TarabicaArt x={x} y={y} w={w} h={h} barSize={barSize} gap={gap} overhang={frame} overhangs={edgeOverhang} lift={lift} hex={hex} />;
  // stepenište: nema slike sa stubovima (iskosila bi se i stub); crta se samo rukohvat i prečke, stubovi su uspravni
  const rail = colorKey !== undefined && !sloped ? railArt(modelId, colorKey) : null;
  if (rail && MODEL_IMAGES[rail.id]) {
    // slika modela u tri dela: stub sa stezaljkama (stalna širina) levo i desno, srednji deo se razvlači
    const k = RAIL_POST_MM / rail.postPx;
    const a = rail.a * k;
    const ax = axis?.x ?? x;
    const aw = axis?.w ?? w;
    const parts = [
      { u0: rail.cL - rail.a, u1: rail.cL + rail.a, px: ax - a, pw: 2 * a },
      { u0: rail.cL + rail.a, u1: rail.cR - rail.a, px: ax + a, pw: Math.max(0, aw - 2 * a) },
      { u0: rail.cR - rail.a, u1: rail.cR + rail.a, px: ax + aw - a, pw: 2 * a },
    ];
    const bands = rodCount ? railBands(rail, h, rodCount) : null;
    if (bands) {
      // slika se slaže od traka: vrat i ploča stuba imaju stalnu visinu, deo između prečki se ponavlja
      let yy = y;
      const rows = bands.map((b) => { const r = { ...b, y: yy }; yy += b.hMm; return r; });
      return (
        <g>
          {rows.flatMap((b, bi) => parts.filter((_, i) => !(skipLeftPost && i === 0) && !(skipRightPost && i === 2)).map((p, i) => (
            <svg key={`${bi}-${i}`} x={p.px} y={b.y} width={p.pw} height={b.hMm + 0.6} viewBox={`${p.u0} ${b.v0} ${p.u1 - p.u0} ${b.v1 - b.v0}`} preserveAspectRatio="none" overflow="hidden">
              <image href={MODEL_IMAGES[rail.id]} x={0} y={0} width={rail.imgW} height={rail.imgH} />
            </svg>
          )))}
        </g>
      );
    }
    return (
      <g>
        {parts.filter((_, i) => !(skipLeftPost && i === 0) && !(skipRightPost && i === 2)).map((p, i) => (
          <svg key={i} x={p.px} y={y} width={p.pw} height={h} viewBox={`${p.u0} 0 ${p.u1 - p.u0} ${rail.imgH}`} preserveAspectRatio="none" overflow="hidden">
            <image href={MODEL_IMAGES[rail.id]} x={0} y={0} width={rail.imgW} height={rail.imgH} />
          </svg>
        ))}
      </g>
    );
  }
  const art = colorKey !== undefined ? panelArt(modelId, colorKey) : null;
  if (art && PANEL_IMAGES[art.id]) {
    const rep = panelRepeat(modelId, art, h, { frameMm: frame, barSizeMm: barSize, gapMm: gap });
    if (rep) {
      // horizontalne letvice stalne debljine: slika se slaže iz perioda od tla naviše, ostatak na vrhu je presečen red
      const dv = rep.v1 - rep.v0;
      return (
        <g>
          {Array.from({ length: rep.n }, (_, i) => (
            <svg key={i} x={x} y={y + h - (i + 1) * rep.periodMm} width={w} height={rep.periodMm + 0.4} viewBox={`0 ${rep.v0} 1 ${dv}`} preserveAspectRatio="none" overflow="hidden">
              <image href={PANEL_IMAGES[art.id]} x={0} y={0} width={1} height={1} preserveAspectRatio="none" />
            </svg>
          ))}
          {rep.remMm > 1 && (
            <svg x={x} y={y} width={w} height={rep.remMm + 0.4} viewBox={`0 ${rep.v1 - (dv * rep.remMm) / rep.periodMm} 1 ${(dv * rep.remMm) / rep.periodMm}`} preserveAspectRatio="none" overflow="hidden">
              <image href={PANEL_IMAGES[art.id]} x={0} y={0} width={1} height={1} preserveAspectRatio="none" />
            </svg>
          )}
        </g>
      );
    }
    const tiles = panelTiles(art, w, h);
    return (
      <g>
        {Array.from({ length: tiles }, (_, i) => (
          <image key={i} href={PANEL_IMAGES[art.id]} x={x + (i * w) / tiles} y={y} width={w / tiles} height={h} preserveAspectRatio="none" />
        ))}
      </g>
    );
  }
  const geo = computeInfill(modelId, w, h, frame, barSize, gap);
  const style = FENCE_MODELS[modelId].style;
  const f = geo.frame;
  const ix = x + geo.inner.x;
  const iy = y + geo.inner.y;
  const iw = geo.inner.w;
  const ih = geo.inner.h;
  const clipId = `clip-${uid}`;
  // redosled: prvo nosači (iza), zatim letvice, na kraju srebrne linije
  const order: Record<string, number> = { rail: 0, main: 1, accent: 2 };
  const sorted = [...geo.bars].sort((a, b) => order[a.tone] - order[b.tone]);
  const bars: ReactNode[] = sorted.map((bar, i) => {
    const bx = x + bar.x;
    const by = y + bar.y;
    if (bar.tone === 'accent') {
      return <Bar key={i} x={bx} y={by} w={bar.w} h={bar.h} hex={ACCENT_HEX} />;
    }
    if (bar.round) return <RoundedPicket key={i} x={bx} y={by} w={bar.w} h={bar.h} hex={hex} />;
    if (style === 'louver' && bar.tone === 'main') {
      return (
        <g key={i}>
          <rect x={bx} y={by} width={bar.w} height={bar.h} fill={hex} />
          <rect x={bx} y={by} width={bar.w} height={bar.h * 0.45} fill="#fff" fillOpacity="0.2" />
          <rect x={bx} y={by + bar.h * 0.45} width={bar.w} height={bar.h * 0.55} fill="#000" fillOpacity="0.2" />
          <rect x={bx} y={by + bar.h - 4} width={bar.w} height={4} fill="#000" fillOpacity="0.35" />
        </g>
      );
    }
    if (bar.h > bar.w) {
      return (
        <g key={i}>
          <rect x={bx} y={by} width={bar.w} height={bar.h} fill={hex} />
          <rect x={bx} y={by} width={bar.w} height={bar.h} fill="url(#shade-v)" />
        </g>
      );
    }
    return <Bar key={i} x={bx} y={by} w={bar.w} h={bar.h} hex={hex} />;
  });

  if (style === 'rods' || style === 'glass_rail') {
    const clampW = Math.max(60, barSize * 3);
    return (
      <g>
        {geo.glass && (
          <g>
            <rect x={x + geo.glass.x} y={y + geo.glass.y} width={geo.glass.w} height={geo.glass.h} fill="url(#glass-grad)" />
            <polygon points={`${ix + iw * 0.12},${y + geo.glass.y + geo.glass.h} ${ix + iw * 0.3},${y + geo.glass.y} ${ix + iw * 0.4},${y + geo.glass.y} ${ix + iw * 0.22},${y + geo.glass.y + geo.glass.h}`} fill="#fff" fillOpacity="0.28" />
            <polygon points={`${ix + iw * 0.5},${y + geo.glass.y + geo.glass.h} ${ix + iw * 0.62},${y + geo.glass.y} ${ix + iw * 0.66},${y + geo.glass.y} ${ix + iw * 0.54},${y + geo.glass.y + geo.glass.h}`} fill="#fff" fillOpacity="0.18" />
          </g>
        )}
        {sorted.map((bar, i) =>
          bar.tone === 'rail' ? (
            <g key={i}>
              <rect x={x + bar.x} y={y + bar.y} width={bar.w} height={bar.h} rx={bar.h / 5} fill={hex} />
              <rect x={x + bar.x} y={y + bar.y} width={bar.w} height={bar.h} rx={bar.h / 5} fill="url(#shade-h)" />
            </g>
          ) : (
            <g key={i}>
              <rect x={x + bar.x} y={y + bar.y} width={bar.w} height={bar.h} rx={bar.h / 2} fill={hex} />
              <rect x={x + bar.x} y={y + bar.y} width={bar.w} height={bar.h} rx={bar.h / 2} fill="url(#shade-h)" />
              {[x + bar.x, x + bar.x + bar.w - clampW].map((cx) => (
                <rect key={cx} x={cx} y={y + bar.y - bar.h * 0.7} width={clampW} height={bar.h * 2.4} rx="6" fill="#16181b" />
              ))}
            </g>
          ),
        )}
        {geo.glass && (
          <g fill="#2b3036">
            {[0.2, 0.85].map((t) => (
              <g key={t}>
                <rect x={x} y={y + geo.glass!.y + geo.glass!.h * t - 23} width={36} height={46} />
                <rect x={x + w - 36} y={y + geo.glass!.y + geo.glass!.h * t - 23} width={36} height={46} />
              </g>
            ))}
          </g>
        )}
      </g>
    );
  }

  if (style === 'tubes') {
    // kvadratne cevi 20 × 20 u bočnim U profilima (krajevi cevi ulaze u kanal): U profil se vidi kao traka širine „širina U" po celoj visini
    const sh = Math.max(1.5, f / 14);
    return (
      <g data-testid="tubes-art">
        <rect x={ix} y={iy} width={iw} height={ih} fill={GAP_TINT} fillOpacity="0.42" />
        {geo.bars.filter((b) => b.tone === 'main').map((b, i) => (
          <g key={i}>
            <rect x={x + b.x} y={y + b.y} width={b.w} height={b.h} fill={hex} />
            <rect x={x + b.x} y={y + b.y} width={b.w} height={b.h} fill="url(#shade-h)" fillOpacity="0.6" />
            <rect x={x + b.x} y={y + b.y} width={b.w} height={Math.max(sh, b.h * 0.08)} fill="#fff" fillOpacity="0.16" />
          </g>
        ))}
        {[x, x + w - f].map((ux, i) => (
          <g key={`u${i}`}>
            <rect x={ux} y={y} width={f} height={h} fill={hex} />
            <rect x={ux} y={y} width={f} height={h} fill="url(#shade-v)" fillOpacity="0.55" />
            <rect x={ux} y={y} width={f} height={h} fill="none" stroke="#000" strokeOpacity="0.4" strokeWidth={sh} />
            <line x1={i === 0 ? ux + f - sh * 2 : ux + sh * 2} y1={y} x2={i === 0 ? ux + f - sh * 2 : ux + sh * 2} y2={y + h} stroke="#fff" strokeOpacity="0.14" strokeWidth={sh} />
          </g>
        ))}
      </g>
    );
  }

  const backdrop = style === 'panel_lines' ? hex : GAP_TINT;
  return (
    <g>
      <defs>
        <clipPath id={clipId}>
          <rect x={ix} y={iy} width={iw} height={ih} />
        </clipPath>
      </defs>
      <rect x={ix} y={iy} width={iw} height={ih} fill={backdrop} fillOpacity={style === 'panel_lines' ? 1 : 0.42} />
      <g clipPath={`url(#${clipId})`}>
        {geo.glass && (
          <g>
            <rect x={x + geo.glass.x} y={y + geo.glass.y} width={geo.glass.w} height={geo.glass.h} fill="url(#glass-grad)" />
            <polygon points={`${ix + iw * 0.12},${y + geo.glass.y + geo.glass.h} ${ix + iw * 0.3},${y + geo.glass.y} ${ix + iw * 0.4},${y + geo.glass.y} ${ix + iw * 0.22},${y + geo.glass.y + geo.glass.h}`} fill="#fff" fillOpacity="0.28" />
            <polygon points={`${ix + iw * 0.5},${y + geo.glass.y + geo.glass.h} ${ix + iw * 0.62},${y + geo.glass.y} ${ix + iw * 0.66},${y + geo.glass.y} ${ix + iw * 0.54},${y + geo.glass.y + geo.glass.h}`} fill="#fff" fillOpacity="0.18" />
          </g>
        )}
        {bars}
      </g>
      {/* ram */}
      <g fill={hex}>
        <rect x={x} y={y} width={w} height={f} />
        <rect x={x} y={y + h - f} width={w} height={f} />
        <rect x={x} y={y} width={f} height={h} />
        <rect x={x + w - f} y={y} width={f} height={h} />
      </g>
      <rect x={x} y={y} width={w} height={h} fill="none" stroke="#000" strokeOpacity="0.35" strokeWidth={Math.max(2, f / 10)} />
      <rect x={x} y={y} width={w} height={h} fill="url(#shade-h)" fillOpacity="0.5" />
      {geo.glass && (
        <g fill="#2b3036">
          {[0.2, 0.85].map((t) => (
            <g key={t}>
              <rect x={x} y={y + geo.glass!.y + geo.glass!.h * t - 23} width={f + 36} height={46} />
              <rect x={x + w - f - 36} y={y + geo.glass!.y + geo.glass!.h * t - 23} width={f + 36} height={46} />
            </g>
          ))}
        </g>
      )}
    </g>
  );
}
