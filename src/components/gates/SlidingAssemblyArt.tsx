import { useAppStore } from '../../store/useAppStore';
import { placeSliding } from '../../domain/gates/slidingLayout';
import type { Component, Role, Shape } from '../../domain/gates/slidingAssembly';
import type { Gate } from '../../domain/models/types';
import { ramInsets } from '../../domain/models/tubes';
import { InfillArt } from '../fences/InfillArt';

/** Referentne boje priloga: pokretno krilo, pogon/ručni okov, vođenje i prihvat, fiksna podloga. */
export const SLIDING_COLORS = { leaf: '#23415e', infill: '#7694ad', drive: '#b75321', guide: '#08786a', fixed: '#737e8a', foundation: '#e2e7ed', open: '#849bae' } as const;

/** sitan okov se crta od ovog uvećanja (manje mm po pikselu = veće uvećanje) */
export const DETAIL_PX = 4;

const fmt = (n: number) => `${Math.round(n).toLocaleString('sr-RS')} mm`;

interface Props {
  gate: Gate;
  clearStart: number;
  clearEnd: number;
  clearWidth: number;
  /** y tla na crtežu (y raste naniže) */
  floorY: number;
  /** mm po pikselu (za debljine linija i slova) */
  px: number;
  hex: string;
  showDims?: boolean;
  /** simulacija na fotografiji: bez oznaka, kota i konture otvorenog položaja */
  realistic?: boolean;
  /** proba hoda (0–100 %); bez vrednosti iz stanja editora */
  testPct?: number;
  /** klik na deo crteža (ključ dela); u crtežu modela otvara podešavanja tog dela */
  onPartClick?: (compKey: string) => void;
  /** delovi crteža koji se ističu (izabrani deo) */
  highlight?: string[];
  /** krilo iz modela se ne crta (u crtanju modela krilo je sam crtež) */
  noLeaf?: boolean;
  /** bez zone uvlačenja i konture otvorenog položaja */
  noZone?: boolean;
  /**
   * Sloj crteža: „back“ (zona, fiksni delovi, kontura otvorenog položaja) ide ISPOD krila, „front“ (pokretni delovi i kote) IZNAD njega.
   * Fiksni delovi (stub vođice, prihvatnik, šina, kolica) stoje iza krila, pa ga ne smeju zaklanjati; bez vrednosti crta se sve.
   */
  layer?: 'all' | 'back' | 'front';
}

/**
 * Klizni sklop na crtežu projekta. Sve nastaje iz podataka kapije: lokalna osa X (ka strani otvaranja) se preslikava pri otvaranju
 * ulevo, pa se sklop postavlja na mesto elementa. Proba hoda pomera samo pokretne delove za hod × procenat / 100.
 */
export function SlidingAssemblyArt({ gate, clearStart, clearEnd, clearWidth, floorY, px, hex, showDims, realistic, testPct, onPartClick, highlight, noLeaf, noZone, layer = 'all' }: Props) {
  const stored = useAppStore((s) => s.editor.slideTest[gate.id]);
  const tailSel = useAppStore((s) => s.editor.tailSel?.[gate.id]) ?? null;
  const placed = placeSliding(gate, { clearStart, clearEnd, clearWidth });
  if (!placed) return null;
  const { res, X } = placed;
  const spec = res.spec;
  const pct = testPct ?? stored ?? 0;
  const t = (spec.travel * pct) / 100;
  const Y = (y: number) => floorY - y;
  const detail = px <= DETAIL_PX;
  const color = (role: Role): string => (role === 'leaf' ? hex : role === 'infill' ? hex : SLIDING_COLORS[role]);

  const shapeEl = (s: Shape, key: string, dx: number, fill: string, extra: Record<string, unknown> = {}) => {
    if (s.t === 'rect') {
      const a = X(s.x + dx); const b = X(s.x + s.w + dx);
      return <rect key={key} x={Math.min(a, b)} y={Y(s.y + s.h)} width={Math.abs(b - a)} height={s.h} fill={fill} {...extra} />;
    }
    if (s.t === 'circle') return <circle key={key} cx={X(s.cx + dx)} cy={Y(s.cy)} r={s.r} fill="#fff" stroke={fill} strokeWidth={Math.max(6, 2 * px)} {...extra} />;
    if (s.t === 'line') return <line key={key} x1={X(s.x1 + dx)} y1={Y(s.y1)} x2={X(s.x2 + dx)} y2={Y(s.y2)} stroke={fill} strokeWidth={s.sw} strokeLinecap="square" {...extra} />;
    return <polygon key={key} points={s.pts.map(([x, y]) => `${X(x + dx)},${Y(y)}`).join(' ')} fill={fill} {...extra} />;
  };
  const draw = (c: Component) => {
    if (c.detail && !detail) return null;
    const dx = c.moving ? t : 0;
    const fill = c.key === 'foundation' ? SLIDING_COLORS.foundation : color(c.role);
    const op = c.role === 'infill' ? 0.82 : 1;
    return (
      <g key={c.key} data-sliding-part={c.key} data-moving={c.moving ? 'true' : 'false'} opacity={op}
        style={{ ...(onPartClick ? { cursor: 'pointer' } : {}), ...(highlight?.includes(c.key) ? { filter: 'drop-shadow(0 0 5px #d92d20)' } : {}) }}
        onClick={onPartClick ? (e) => { e.stopPropagation(); onPartClick(c.key); } : undefined}>
        <title>{c.label}{c.moving ? ' (pokretno)' : ' (fiksno)'}</title>
        {c.shapes.map((s, i) => {
          // rep: svaka cev je zaseban deo (data-tail-member), pa može da se izabere i uporedi sa krojnom listom
          const m = c.key === 'tail' ? res.tail?.[i] : undefined;
          if (!m) return shapeEl(s, `${c.key}-${i}`, dx, fill);
          const on = tailSel === m.bomKey;
          return shapeEl(s, `${c.key}-${i}`, dx, fill, {
            'data-tail-member': m.bomKey, ...(on ? { 'data-selected': 'true', stroke: '#d92d20', strokeWidth: 4 * px, strokeLinejoin: 'round', style: { filter: 'drop-shadow(0 0 5px #d92d20)' } } : tailSel ? { opacity: 0.45 } : {}),
          });
        })}
      </g>
    );
  };
  const fixed = res.components.filter((c) => !c.moving);
  const moving = res.components.filter((c) => c.moving);
  const W = res.W; const fb = spec.frameBottomY; const top = fb + res.frameHeight;
  const cant = spec.support === 'cantilever';
  const mvEnd = cant ? res.at('carrierLength') : W;
  const T = spec.travel;
  const sw = 1.6 * px;
  const dash = `${7 * px} ${5 * px}`;

  // isprekidana kontura otvorenog položaja (krilo i rep na punom hodu)
  const openOutline = (() => {
    if (realistic || noZone || !spec.showOpenOutline) return null;
    const pts: [number, number][] = cant
      ? [[T, fb], [T, top], [T + W, top], [T + mvEnd, fb + 30], [T + mvEnd, fb - 80], [T, fb - 80]]
      : [[T, fb], [T, top], [T + W, top], [T + W, fb]];
    return <polygon data-testid="sliding-open-outline" points={pts.map(([x, y]) => `${X(x)},${Y(y)}`).join(' ')} fill="none" stroke={SLIDING_COLORS.open} strokeWidth={sw} strokeDasharray={dash} />;
  })();

  // zona uvlačenja: od kraja zatvorenog krila do kraja krila na punom hodu
  const zone = (() => {
    if (realistic || noZone) return null;
    const a = X(W); const b = X(mvEnd + T);
    return (
      <g data-testid="sliding-retract-zone">
        <rect x={Math.min(a, b)} y={Y(top + 60)} width={Math.abs(b - a)} height={top + 60} fill={SLIDING_COLORS.open} fillOpacity={0.07} />
        <text x={(a + b) / 2} y={Y(top + 60) - 6 * px} textAnchor="middle" fontSize={11 * px} fill="#475569">Zona uvlačenja</text>
      </g>
    );
  })();

  // kote ispod tla (ispod kota osa–osa i ukupne dužine): hod, šina ili C-profil, svetli otvor; rep iznad krila
  const dims = (() => {
    if (!showDims || realistic) return null;
    const rows: { a: number; b: number; text: string; key: string }[] = [{ a: 0, b: T, text: `Hod ${fmt(T)}`, key: 'travel' }];
    if (!cant) rows.push({ a: res.at('railStart'), b: res.at('railStart') + res.at('railLength'), text: `Šina ${fmt(res.at('railLength'))}`, key: 'rail' });
    else rows.push({ a: 0, b: res.at('carrierLength'), text: `C-profil ${fmt(res.at('carrierLength'))}`, key: 'carrier' });
    if (spec.clearOpening !== null && spec.clearOpening > 0) rows.push({ a: 0, b: spec.clearOpening, text: `Svetli otvor ${fmt(spec.clearOpening)}`, key: 'clear' });
    const fs = 12 * px;
    const line = (a: number, b: number, y: number, text: string, key: string, textBelow = false) => {
      const x1 = X(a); const x2 = X(b); const lo = Math.min(x1, x2); const hi = Math.max(x1, x2);
      return (
        <g key={key} data-testid={`sliding-dim-${key}`}>
          <line x1={lo} y1={y} x2={hi} y2={y} stroke="#586d80" strokeWidth={px} />
          <line x1={lo} y1={y - 6 * px} x2={lo} y2={y + 6 * px} stroke="#586d80" strokeWidth={px} />
          <line x1={hi} y1={y - 6 * px} x2={hi} y2={y + 6 * px} stroke="#586d80" strokeWidth={px} />
          <text x={(lo + hi) / 2} y={textBelow ? y + 30 * px : y - 4 * px} textAnchor="middle" fontSize={fs} fontWeight={700} fill="#172a3d">{text}</text>
        </g>
      );
    };
    const y0 = floorY + 178 * px;
    // rep: kota tik iznad vrha krila, a natpis ispod linije (iznad repa), da se ne preklapa sa kotom platna i njenim natpisom
    const above = Y(top) - 12 * px;
    return (
      <g data-testid="sliding-dims">
        {/* širina rama se ne kotira ovde: ista je kao kota elementa u projektu (bila bi dvaput, jedna preko druge) */}
        {cant && line(W, mvEnd, above, `Rep ${fmt(mvEnd - W)}`, 'tail', true)}
        {rows.map((r, i) => line(r.a, r.b, y0 + i * 30 * px, r.text, r.key))}
      </g>
    );
  })();

  return (
    <g data-testid="sliding-assembly" data-variant={spec.presetId} data-opening={gate.opening} data-pct={pct}>
      {layer !== 'front' && <>{zone}{fixed.map(draw)}{openOutline}</>}
      {layer === 'all' && spec.drawnLeaf && !noLeaf && (
        // krilo iz modela (nacrtan model ili model ograde), podignuto od tla za odstojanje donje ivice rama; u probi hoda klizi sa okovom
        <g data-sliding-part="leaf" data-moving="true" transform={`translate(${X(t) - X(0)} 0)`}>
          <InfillArt modelId={gate.infillModelId} x={Math.min(X(0), X(W))} y={Y(top)} w={W} h={res.frameHeight} frame={gate.params.frameMm} barSize={gate.params.barSizeMm} gap={gate.params.gapMm} lift={gate.params.liftMm} slats={gate.params.slats} arch={gate.params.archMm} hex={hex} colorKey={gate.color} ram={ramInsets(gate.infillModelId, gate.params)} uid={`${gate.id}-sl`} />
        </g>
      )}
      {layer !== 'back' && <>{moving.map(draw)}{dims}</>}
    </g>
  );
}
