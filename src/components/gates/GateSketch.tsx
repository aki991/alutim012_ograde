import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Maximize2, ZoomIn, ZoomOut } from 'lucide-react';
import type { Gate } from '../../domain/models/types';
import { DIM_BY_KEY, fmt, type GateDesign, type GateResult } from '../../domain/gates/design';

/**
 * Skica kapije uz mere: zatvoren i otvoren položaj, referentne ivice (montažna lica stubova, ivice otvora), kote i zazori.
 * Kota koja nedostaje ima crvenu oznaku „?“ na mestu merenja. Klik na kotu otvara njeno polje u listi mera.
 * Podrazumevano se gleda iz dvorišta; za kliznu se skica preslikava prema smeru otvaranja.
 */
/** zumiranje (točkić ili dugmad) i pomeranje (prevlačenje) skice, da se detalj može razgledati izbliza */
function ZoomPan({ children }: { children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const outer = useRef<HTMLDivElement>(null);
  const [t, setT] = useState({ z: 1, x: 0, y: 0 });
  const drag = useRef<{ px: number; py: number; moved: boolean } | null>(null);
  const zoomAt = (f: number, cx: number, cy: number) => setT((o) => { const z = Math.min(Math.max(o.z * f, 0.3), 12); const r = z / o.z; return { z, x: cx - (cx - o.x) * r, y: cy - (cy - o.y) * r }; });
  useEffect(() => {
    const el = outer.current; if (!el) return;
    // jedan „klik“ točkića = isti korak bez obzira na uređaj (miš, touchpad); gore = uvećaj, dole = umanji
    const h = (e: WheelEvent) => { e.preventDefault(); const d = e.deltaY || e.deltaX; if (!d) return; const r = el.getBoundingClientRect(); zoomAt(Math.exp(-Math.sign(d) * Math.min(Math.abs(d), 100) * 0.0025), e.clientX - r.left, e.clientY - r.top); };
    el.addEventListener('wheel', h, { passive: false });
    return () => el.removeEventListener('wheel', h);
  }, []);
  const center = (f: number) => { const r = box.current!.getBoundingClientRect(); zoomAt(f, r.width / 2, r.height / 2); };
  return (
    <div ref={outer} className="relative" data-testid="sk-zoom" data-zoom={t.z.toFixed(2)}>
      <div ref={box} className="overflow-hidden touch-none select-none" style={{ cursor: t.z !== 1 ? 'grab' : undefined }}
        onPointerDown={(e) => { drag.current = { px: e.clientX, py: e.clientY, moved: false }; }}
        onPointerMove={(e) => { const d = drag.current; if (!d) return; const dx = e.clientX - d.px, dy = e.clientY - d.py; if (!d.moved && Math.hypot(dx, dy) < 4) return; d.moved = true; d.px = e.clientX; d.py = e.clientY; setT((o) => ({ ...o, x: o.x + dx, y: o.y + dy })); }}
        onPointerUp={() => { setTimeout(() => { drag.current = null; }, 0); }} onPointerLeave={() => { drag.current = null; }}
        onClickCapture={(e) => { if (drag.current?.moved) { e.stopPropagation(); e.preventDefault(); } }}>
        <div style={{ transform: `translate(${t.x}px, ${t.y}px) scale(${t.z})`, transformOrigin: '0 0' }}>{children}</div>
      </div>
      <div className="absolute right-2 top-2 flex flex-col gap-1">
        <button className="btn btn-sm !px-1.5" aria-label="Uvećaj" data-testid="sk-zoom-in" onClick={() => center(1.4)}><ZoomIn size={14} /></button>
        <button className="btn btn-sm !px-1.5" aria-label="Umanji" data-testid="sk-zoom-out" onClick={() => center(1 / 1.4)}><ZoomOut size={14} /></button>
        <button className="btn btn-sm !px-1.5" aria-label="Cela kapija" data-testid="sk-zoom-reset" onClick={() => setT({ z: 1, x: 0, y: 0 })}><Maximize2 size={14} /></button>
      </div>
    </div>
  );
}

type SketchProps = { gate: Gate & { design?: GateDesign }; res: GateResult; onPick?: (key: string) => void; width?: number; showDims?: boolean;
  /** visine levog i desnog stuba iz projekta (ako se razlikuju od visine kapije) */
  postHs?: (number | undefined)[];
  /** širine levog i desnog stuba iz projekta */
  postWs?: (number | undefined)[] };

/** skica sa zumiranjem i pomeranjem (ekran) */
export function GateSketch(p: SketchProps) { return <ZoomPan><GateSketchSvg {...p} /></ZoomPan>; }

/** čist SVG skice (bez zumiranja) — i za PDF */
export function GateSketchSvg({ gate, res, onPick, width = 900, showDims = true, postHs, postWs }: SketchProps) {
  const v = (k: string): number | null => res.values[k]?.v ?? null;
  const W = v('W') ?? 0;
  const H = v('H') ?? gate.heightMm;
  const from = gate.design?.viewFrom === 'ulica' ? 'gledano sa ulice' : 'gledano iz dvorišta';
  if (res.system === 'cantilever' || res.system === 'rail') return <SlidingSketch gate={gate} res={res} W={W} H={H} from={from} onPick={onPick} width={width} />;
  return <SwingSketch gate={gate} res={res} W={W} H={H} from={from} onPick={onPick} width={width} showDims={showDims} postHs={postHs} postWs={postWs} />;
}

type P = { gate: Gate & { design?: GateDesign }; res: GateResult; W: number; H: number; from: string; onPick?: (key: string) => void; width: number };

const POST = 120;
const INK = '#1f2937';
const MISS = '#d92d20';

function Dim({ x0, x1, y, k, val, s, onPick, label }: { x0: number; x1: number; y: number; k: string; val: number | null; s: number; onPick?: (key: string) => void; label?: string }) {
  const missing = val === null;
  const c = missing ? MISS : INK;
  const mid = (x0 + x1) / 2;
  const txt = missing ? `${label ?? k} ?` : `${label ?? k} ${fmt(val, '')}`;
  return (
    <g data-testid={`sk-dim-${k}`} data-value={val ?? ''} style={{ cursor: onPick ? 'pointer' : undefined }} onClick={() => onPick?.(k)}>
      <title>{`${DIM_BY_KEY[k]?.label ?? k}: ${missing ? 'nije uneto — mesto merenja' : fmt(val)}${DIM_BY_KEY[k]?.ref ? ` (${DIM_BY_KEY[k].ref})` : ''}`}</title>
      <line x1={x0 * s} y1={y} x2={x1 * s} y2={y} stroke={c} strokeWidth={1} strokeDasharray={missing ? '4 3' : undefined} />
      <line x1={x0 * s} y1={y - 5} x2={x0 * s} y2={y + 5} stroke={c} />
      <line x1={x1 * s} y1={y - 5} x2={x1 * s} y2={y + 5} stroke={c} />
      <rect x={mid * s - 4 - txt.length * 3.1} y={y - 15} width={txt.length * 6.2 + 8} height={13} fill="white" opacity={0.85} />
      <text x={mid * s} y={y - 5} textAnchor="middle" fontSize={11} fill={c} fontWeight={missing ? 700 : 500}>{txt}</text>
    </g>
  );
}

const BLUE = '#2563eb';
const GREEN = '#0f766e';

/** kota u stilu crteža ograde: linija sa kosim crticama na krajevima, podebljan broj iznad linije i sitan opis ispod */
function DimPx({ x, y, len, vertical, text, sub, color = INK, bold, k, missing, onPick, tip, lane = 0 }: { x: number; y: number; len: number; vertical?: boolean; text: string; sub?: string; color?: string; bold?: boolean; k?: string; missing?: boolean; onPick?: (key: string) => void; tip?: string; lane?: number }) {
  const c = missing ? MISS : color;
  const L = Math.max(len, 0);
  const narrow = L < text.length * 7 + 6;
  const ty = -7 - (narrow ? 13 * (lane % 2 + 1) : 0);
  const tr = vertical ? `translate(${x} ${y}) rotate(-90)` : `translate(${x} ${y})`;
  return (
    <g transform={tr} data-testid={k ? `sk-dim-${k}` : undefined} data-value={missing ? '' : text} style={{ cursor: k && onPick ? 'pointer' : undefined }} onClick={k ? () => onPick?.(k) : undefined}>
      {tip && <title>{tip}</title>}
      <line x1={0} y1={0} x2={L} y2={0} stroke={c} strokeWidth={1.2} strokeDasharray={missing ? '4 3' : undefined} />
      <line x1={-4} y1={4} x2={4} y2={-4} stroke={c} strokeWidth={1.4} />
      <line x1={L - 4} y1={4} x2={L + 4} y2={-4} stroke={c} strokeWidth={1.4} />
      {narrow && <line x1={L / 2} y1={0} x2={L / 2} y2={ty + 3} stroke={c} strokeWidth={0.6} />}
      <text x={L / 2} y={ty} textAnchor="middle" fontSize={bold ? 13 : 11.5} fontWeight={bold ? 800 : 700} fill={c}>{text}</text>
      {sub && <text x={L / 2} y={13} textAnchor="middle" fontSize={9.5} fill="#6b7280">{sub}</text>}
    </g>
  );
}

function SwingSketch({ gate, res, W, H, from, onPick, width, showDims, postHs, postWs }: P & { showDims: boolean; postHs?: (number | undefined)[]; postWs?: (number | undefined)[] }) {
  const v = (k: string): number | null => res.values[k]?.v ?? null;
  const pLw = postWs?.[0] ?? POST; const pRw = postWs?.[1] ?? POST;
  const span = W + pLw + pRw;
  // jedinstvena razmera po obe ose: kapija je srazmerna pravoj (širina i visina u istom odnosu kao na crtežu ograde)
  const leftM = showDims ? 120 : 30; const rightM = showDims ? 70 : 30;
  const pL = postHs?.[0] ?? H; const pR = postHs?.[1] ?? H; const Hmax = Math.max(H, pL, pR);
  const s = Math.min((width - leftM - rightM) / Math.max(span, 1), 560 / Math.max(Hmax, 1));
  const ox = leftM + (width - leftM - rightM - span * s) / 2 + pLw * s;
  const elevTop = showDims ? 86 : 34;
  const hPx = H * s;
  const ys = s;
  const groundY = elevTop + Hmax * s + 10;
  // stvarna podloga: kota u odnosu na dogovorenu nulu i pad (pozitivan pad se spušta udesno)
  const gnd = v('ground') ?? 0; const slp = v('slope') ?? 0;
  const floorY = (xmm: number) => groundY - gnd * s + (slp / 100) * xmm * s;
  const double = res.system === 'swing_double';
  const gB = v('gB');
  // tlocrt: otvoren položaj (krila zaokrenuta za ugao otvaranja)
  const ang = ((v('angle') ?? 90) * Math.PI) / 180;
  const inward = gate.swing === 'inward';
  const dir = 1; // na tlocrtu se krila uvek otvaraju naniže; natpis kaže koja je to strana (dvorište ili ulica)
  // crtež prati svaku meru: nepoznat zazor se crta kao 0 (krilo uz stub), nepoznata širina krila popunjava ostatak otvora
  const g0 = (k: string) => v(k) ?? 0;
  const leafRects = res.leaves.map((l, i) => {
    let x0: number | null = l.x; let w: number | null = l.w;
    if (double) {
      const room = W - g0('gL') - g0('gR') - g0('gC');
      const other = i === 0 ? v('WR') : v('WL');
      w = w ?? (other !== null ? room - other : room / 2);
      x0 = i === 0 ? g0('gL') : W - g0('gR') - w;
    } else {
      w = w ?? Math.max(W - g0('gH') - g0('gZ'), 0);
      x0 = l.hinge === 'left' ? g0('gH') : W - g0('gH') - w;
    }
    return { ...l, x0, w, assumed: l.x === null || l.w === null };
  });
  const keys = double ? ['gL', 'WL', 'gC', 'WR', 'gR'] : gate.opening === 'left' ? ['gH', 'Wk', 'gZ'] : ['gZ', 'Wk', 'gH'];
  // lanac kota: početak svake kote = zbir prethodnih (ako su poznate)
  let acc: number | null = 0;
  const chain = keys.map((k) => {
    const val = v(k);
    const x0: number | null = acc;
    acc = acc !== null && val !== null ? acc + val : null;
    return { k, val, x0: x0 as number | null, x1: acc as number | null };
  });
  // kote koje ne mogu da se smeste u lanac (prethodna nepoznata) crtaju se od suprotne strane
  let back: number | null = W;
  for (const c of [...chain].reverse()) {
    if (c.x0 === null || c.x1 === null) {
      const end: number | null = back;
      const start: number | null = end !== null && c.val !== null ? end - c.val : null;
      if (c.x1 === null) c.x1 = end;
      if (c.x0 === null) c.x0 = start;
    }
    back = c.x0;
  }
  const unplaced = chain.filter((c) => c.x0 === null || c.x1 === null);
  const planY = showDims ? groundY + 118 + (unplaced.length ? 24 : 0) + 34 : groundY + 74;
  // tlocrt je umanjen da ne bude viši od pogleda spreda (krilo od 2 m bi inače bilo dvostruko više od crteža)
  const rawDepth = Math.max(...res.leaves.map((l) => (l.w ?? W / 2) * s)) * Math.max(Math.sin(ang), 0.2);
  const k = Math.min(1, 150 / Math.max(rawDepth, 1));
  const ps = s * k;
  const planOx = ((W * s) - W * ps) / 2;
  const swingDepth = rawDepth * k;
  const height = planY + swingDepth + 34;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} xmlns="http://www.w3.org/2000/svg" width="100%" data-testid="gate-sketch" className="bg-white">
      <text x={20} y={16} fontSize={12} fontWeight={700} fill={INK}>Zatvoreno — {from}</text>
      <g transform={`translate(${ox} 0)`}>
        {/* stubovi i teren: terenske širine (gore, sredina, dole) pomeraju unutrašnje lice desnog stuba, a kota i pad podloge naginju pod; sve u pravoj razmeri */}
        {(() => {
          const fill = showDims ? '#e5e7eb' : '#000';
          const fx = (xmm: number) => floorY(xmm);
          const wT = (v('wTop') ?? W) * s; const wM = (v('wMid') ?? W) * s; const wB = (v('wBot') ?? W) * s;
          const outerR = (W + pRw) * s;
          const topR = groundY - pR * s; const midR = groundY - (pR * s) / 2;
          const leftPts = [[-pLw * s, groundY - pL * s], [0, groundY - pL * s], [0, fx(0)], [-pLw * s, fx(-pLw)]];
          const rightPts = [[wT, topR], [outerR, topR], [outerR, fx(W + pRw)], [wB, fx(v('wBot') ?? W)], [wM, midR]];
          const poly = (pts: number[][]) => pts.map((q) => q.join(',')).join(' ');
          return (<>
            {!showDims && <polygon points={poly([[-pLw * s - 30, fx(-pLw - 30 / s)], [(W + pRw) * s + 30, fx(W + pRw + 30 / s)], [(W + pRw) * s + 30, fx(W + pRw + 30 / s) + 16], [-pLw * s - 30, fx(-pLw - 30 / s) + 16]])} fill="#eef0f3" stroke="none" />}
            <polygon data-testid="sk-post-left" points={poly(leftPts)} fill={fill} stroke={INK} />
            <polygon data-testid="sk-post-right" points={poly(rightPts)} fill={fill} stroke={INK} />
            <line x1={-pLw * s - 30} y1={fx(-pLw - 30 / s)} x2={(W + pRw) * s + 30} y2={fx(W + pRw + 30 / s)} stroke={INK} strokeWidth={1.5} />
            {(gnd !== 0 || slp !== 0) && <line x1={-pLw * s - 30} y1={groundY} x2={(W + pRw) * s + 30} y2={groundY} stroke="#9ca3af" strokeDasharray="4 3" />}
          </>);
        })()}
        <text x={-pLw * s} y={groundY + 12 + Math.max(0, floorY(-pLw) - groundY)} fontSize={9.5} fill="#6b7280">{gnd !== 0 || slp !== 0 ? `podloga${gnd !== 0 ? ` ${gnd > 0 ? '+' : ''}${fmt(gnd, '')}` : ''}${slp !== 0 ? ` · pad ${fmt(Math.abs(slp), '%')} ${slp > 0 ? '↘' : '↙'}` : ''}` : 'gotova kota podloge'}</text>
        {leafRects.map((l, i) => {
          const x = (l.x0 ?? 0) * s;
          const w = (l.w ?? 0) * s;
          const bottom = groundY - (gB ?? 0) * ys;
          const top = bottom - hPx;
          const nH = Math.max(1, Math.round(v('hingeCount') ?? 2));
          const spacing = v('hingeSpacing');
          const hTop = v('hingeTop') ?? 150;
          // šarke: gornja na hingeTop od vrha, ostale na razmaku osa (ako nije zadat, ravnomerno do iste mere od dna)
          const hy = Array.from({ length: nH }, (_, j) => {
            const mm = spacing !== null && nH >= 2 ? hTop + spacing * j : nH === 1 ? hTop : hTop + ((H - 2 * hTop) / (nH - 1)) * j;
            return top + mm * ys;
          });
          const ax = (v('hingeAxis') ?? 0) * s;
          const hx = l.hinge === 'left' ? x - ax : x + w + ax;
          const slats = Math.max(Math.floor(hPx / 7), 1);
          const lockX = l.hinge === 'left' ? x + w - 7 : x + 7;
          const edge = l.assumed ? MISS : INK;
          return (
            <g key={i} data-testid={`sk-leaf-${i}`}>
              {showDims ? (<>
                <rect x={x} y={top} width={w} height={hPx} fill={l.assumed ? 'none' : '#fef2f2'} stroke={edge} strokeDasharray={l.assumed ? '5 4' : undefined} strokeWidth={1.5} />
                <text x={x + w / 2} y={top + hPx / 2} textAnchor="middle" fontSize={12} fill={INK}>{l.label}{gate.design?.activeLeaf && ((gate.design.activeLeaf === 'left' && i === 0) || (gate.design.activeLeaf === 'right' && i === 1)) ? ' (aktivno)' : ''}</text>
              </>) : (<>
              <rect x={x} y={top} width={w} height={hPx} fill="#fff" />
              {Array.from({ length: slats }, (_, j) => <rect key={j} x={x + 3} y={top + 3 + j * ((hPx - 6) / slats)} width={Math.max(w - 6, 0)} height={((hPx - 6) / slats) * 0.62} fill="#374151" />)}
              <rect x={x} y={top} width={w} height={hPx} fill="none" stroke={l.assumed ? MISS : '#dc2626'} strokeWidth={2} strokeDasharray={l.assumed ? '5 4' : undefined} />
              {l.hinge && <path d={`M ${l.hinge === 'left' ? x + w : x} ${top} L ${l.hinge === 'left' ? x : x + w} ${top + hPx / 2} L ${l.hinge === 'left' ? x + w : x} ${top + hPx}`} fill="none" stroke="#fff" strokeDasharray="6 4" strokeWidth={1.2} />}
              <rect x={lockX - 2} y={top + hPx / 2 - 14} width={4} height={28} rx={2} fill="#d1d5db" stroke={edge} strokeWidth={0.6} />
              </>)}
              {l.hinge && hy.map((yy, j) => <rect key={j} data-testid={`sk-hinge-${i}-${j}`} data-x={Math.round(hx)} x={hx - 3} y={yy - 6} width={6} height={12} fill={INK} />)}
            </g>
          );
        })}
        {showDims && (<>
          {/* gornji red: zazori i krila u lancu; iznad njega stubovi i svetli otvor */}
          {chain.map((c, n) => (c.x0 !== null && c.x1 !== null ? <DimPx key={c.k} k={c.k} lane={n} x={c.x0 * s} y={elevTop - 22} len={(c.x1 - c.x0) * s} missing={c.val === null} text={c.val === null ? '?' : `${fmt(c.val, '')}`} sub={c.k === 'Wk' || c.k === 'WL' || c.k === 'WR' ? 'krilo' : 'zazor'} onPick={onPick} tip={`${DIM_BY_KEY[c.k]?.label ?? c.k}${DIM_BY_KEY[c.k]?.ref ? ` (${DIM_BY_KEY[c.k].ref})` : ''}`} /> : null))}
          <DimPx x={-pLw * s} y={elevTop - 52} len={pLw * s} color={BLUE} text={fmt(pLw, '')} />
          <DimPx x={W * s} y={elevTop - 52} len={pRw * s} color={BLUE} text={fmt(pRw, '')} />
          <DimPx k="W" x={0} y={elevTop - 52} len={W * s} bold text={`${fmt(W, '')} mm`} sub="svetli otvor" onPick={onPick} tip="Svetli otvor (usvojen)" />
          {/* levo: visina kapije i stubova */}
          <DimPx k="H" vertical x={-pLw * s - 24} y={groundY - (gB ?? 0) * ys} len={hPx} bold text={`Kapija H: ${fmt(H, '')} mm`} onPick={onPick} />
          <DimPx vertical x={-pLw * s - 56} y={groundY} len={Hmax * s} bold text={`Stubovi H: ${pL === pR ? fmt(pL, '') : `${fmt(pL, '')} / ${fmt(pR, '')}`} mm`} />
          {/* dole: osa–osa stubova i ukupna dužina */}
          <DimPx x={-pLw * s / 2} y={groundY + 34} len={(W + (pLw + pRw) / 2) * s} color={GREEN} bold text={`${fmt(W + (pLw + pRw) / 2, '')} mm`} sub="osa–osa" />
          <DimPx x={-pLw * s} y={groundY + 86} len={span * s} bold text={`${fmt(span, '')} (ukupna dužina)`} />
          {/* razmak osa šarki, sa strane šarki */}
          {(() => {
            const hl = res.leaves.find((l) => l.hinge === (double ? 'right' : gate.opening === 'left' ? 'left' : 'right'));
            const sp = v('hingeSpacing'); const nH = Math.max(1, Math.round(v('hingeCount') ?? 2)); const hTop = v('hingeTop') ?? 150;
            if (!hl || sp === null || nH < 2) return null;
            const left = hl.hinge === 'left';
            const top = groundY - (gB ?? 0) * ys - hPx + hTop * ys;
            return <DimPx k="hingeSpacing" vertical x={left ? -pLw * s - 88 : (W + pRw) * s + 26} y={top + sp * ys} len={sp * ys} text={fmt(sp, '')} sub="razmak osa šarki" onPick={onPick} />;
          })()}
          {unplaced.length > 0 && (
            // kote bez poznatog položaja (nedostaju susedne): jedan red, svaka se otvara klikom
            <text x={0} y={groundY + 116} fontSize={11} fill={MISS}>
              <tspan>Nedostaju kote: </tspan>
              {unplaced.map((c, i) => (
                <tspan key={c.k} data-testid={`sk-dim-${c.k}`} data-value="" style={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={() => onPick?.(c.k)}>{i ? ', ' : ''}{DIM_BY_KEY[c.k]?.label ?? c.k}</tspan>
              ))}
            </text>
          )}
        </>)}
        <g data-testid="sk-dim-gB" onClick={() => onPick?.('gB')} style={{ cursor: 'pointer' }}>
          <text x={(W + pRw) * s} y={groundY + 12} fontSize={10} textAnchor="end" fill={gB === null ? MISS : INK}>{gB === null ? 'donji zazor ?' : `donji zazor ${fmt(gB, '')}`}</text>
        </g>
        {/* tlocrt: otvoren položaj */}
        <text x={-pLw * s} y={planY - 30} fontSize={12} fontWeight={700} fill={INK}>Otvoreno (tlocrt) — otvaranje {inward ? 'ka dvorištu' : 'ka ulici'}{v('angle') !== null ? `, ${fmt(v('angle'), '°')}` : ''}</text>
        <rect x={planOx - pLw * ps} y={planY - 5} width={pLw * ps} height={10} fill="#e5e7eb" stroke={INK} />
        <rect x={planOx + W * ps} y={planY - 5} width={pRw * ps} height={10} fill="#e5e7eb" stroke={INK} />
        {res.leaves.map((l, i) => {
          if (l.x === null || l.w === null) return null;
          const px = planOx + (l.hinge === 'right' ? l.x + l.w : l.x) * ps;
          const sign = l.hinge === 'right' ? -1 : 1;
          const r = l.w * ps;
          const ex = px + sign * r * Math.cos(ang);
          const ey = planY + dir * r * Math.sin(ang);
          return (
            <g key={i} data-testid={`sk-plan-leaf-${i}`}>
              <line x1={px} y1={planY} x2={px + sign * r} y2={planY} stroke="#9ca3af" strokeDasharray="4 3" />
              <path d={`M ${px + sign * r} ${planY} A ${r} ${r} 0 0 ${(sign > 0) === (dir > 0) ? 1 : 0} ${ex} ${ey}`} fill="none" stroke="#9ca3af" strokeDasharray="3 3" />
              <line x1={px} y1={planY} x2={ex} y2={ey} stroke={INK} strokeWidth={3} />
            </g>
          );
        })}
        {k < 1 && <text x={(W * s)} y={planY - 12} textAnchor="end" fontSize={9} fill="#6b7280">umanjeno {Math.round(k * 100)}%</text>}
        <text x={(W * s) / 2} y={planY - 12} textAnchor="middle" fontSize={9.5} fill="#6b7280">{inward ? 'ulica' : 'dvorište'}</text>
        <text x={(W * s) / 2} y={planY + swingDepth + 22} textAnchor="middle" fontSize={9.5} fill="#6b7280">{inward ? 'dvorište' : 'ulica'}</text>
      </g>
    </svg>
  );
}

function SlidingSketch({ gate, res, W, H, from, onPick, width }: P) {
  const v = (k: string): number | null => res.values[k]?.v ?? null;
  const a = v('a'); const b = v('b'); const T = res.system === 'cantilever' ? v('T') : 0; const S = v('S'); const P = v('P');
  const right = gate.opening !== 'left';
  const leafW = res.derived.leafFrameW;
  const L = v('L');
  const closedEnd = W + (b ?? 0) + (T ?? 0);
  const openEnd = closedEnd + (S ?? W);
  const extent = Math.max(openEnd, W + (P ?? 0), W + (res.derived.Pmin ?? 0)) + 200;
  const left0 = -(a ?? 0) - POST - 100;
  const span = extent - left0;
  const s = (width - 40) / span;
  // preslikavanje: otvaranje ulevo crta se kao ogledalo (iste dužine, suprotan smer)
  const X = (x: number) => (right ? x - left0 : W - x - left0) * s + 20;
  const xs = (x0: number, x1: number) => [Math.min(X(x0), X(x1)), Math.abs(X(x1) - X(x0))] as const;
  const hPx = Math.min(H * s, 120);
  const row1 = 40; const row2 = row1 + hPx + 110;
  const ground1 = row1 + hPx + 18; const ground2 = row2 + hPx + 18;
  const DimX = ({ x0, x1, y, k, val, label }: { x0: number; x1: number; y: number; k: string; val: number | null; label?: string }) => {
    const [l, w] = xs(x0, x1);
    return <Dim k={k} val={val} x0={(l - 20) / 1} x1={(l + w - 20) / 1} y={y} s={1} onPick={onPick} label={label} />;
  };
  const leafShape = (shift: number, top: number, ground: number, dashed: boolean, tid: string) => {
    const aa = a ?? 0;
    const fx0 = -aa + shift; const fx1 = (leafW ?? W + aa + (b ?? 0)) - aa + shift;
    const [lx, lw] = xs(fx0, fx1);
    const carrierY = ground - 8;
    const endT = fx1 + (T ?? 0);
    const [cx, cw] = xs(fx0, res.system === 'cantilever' ? endT : fx1);
    const stroke = dashed ? '#6b7280' : INK;
    return (
      <g data-testid={tid} strokeDasharray={dashed ? '5 4' : undefined}>
        <rect x={lx} y={top} width={lw} height={carrierY - top - 6} fill={dashed ? 'none' : '#fef2f2'} stroke={stroke} strokeWidth={1.5} />
        <rect x={cx} y={carrierY - 6} width={cw} height={6} fill={dashed ? 'none' : '#cbd5e1'} stroke={stroke} />
        {res.system === 'cantilever' && T !== null && T > 0 && <line x1={X(fx1)} y1={top} x2={X(endT)} y2={carrierY - 6} stroke={stroke} strokeWidth={1.5} />}
      </g>
    );
  };
  const posts = (top: number, ground: number) => (
    <>
      <rect x={xs(-POST, 0)[0]} y={top - 10} width={POST * s} height={ground - top + 10} fill="#e5e7eb" stroke={INK} />
      <rect x={xs(W, W + POST)[0]} y={top - 10} width={POST * s} height={ground - top + 10} fill="#e5e7eb" stroke={INK} />
      <line x1={20} y1={ground} x2={width - 20} y2={ground} stroke={INK} strokeWidth={1.5} />
    </>
  );
  const trolley = (k: string, ground: number) => {
    const t = v(k);
    if (t === null) return null;
    return <g key={k} data-testid={`sk-${k}`}><circle cx={X(W + t)} cy={ground - 4} r={5} fill="white" stroke={INK} strokeWidth={1.5} /><rect x={X(W + t) - 7} y={ground} width={14} height={4} fill={INK} /></g>;
  };
  const obstacle = P !== null ? X(W + P) : null;
  return (
    <svg viewBox={`0 0 ${width} ${ground2 + 110}`} xmlns="http://www.w3.org/2000/svg" width="100%" data-testid="gate-sketch" className="bg-white">
      <text x={20} y={16} fontSize={12} fontWeight={700} fill={INK}>Zatvoreno — {from}, otvaranje {right ? 'udesno' : 'ulevo'}</text>
      {posts(row1, ground1)}
      {leafShape(0, row1, ground1, false, 'sk-closed')}
      {res.system === 'cantilever' ? ['t1', 't2'].map((k) => trolley(k, ground1)) : null}
      {res.system === 'cantilever' && v('guideX') !== null && <rect data-testid="sk-guide" x={X(W + v('guideX')!) - 6} y={row1 - 14} width={12} height={10} fill={INK} />}
      {obstacle !== null && <g data-testid="sk-obstacle"><line x1={obstacle} y1={row1 - 16} x2={obstacle} y2={ground2} stroke={MISS} strokeWidth={2} /><text x={obstacle + (right ? 4 : -4)} y={row1 - 18} fontSize={10} fill={MISS} textAnchor={right ? 'start' : 'end'}>prepreka</text></g>}
      <DimX x0={-(a ?? 0)} x1={0} y={ground1 + 22} k="a" val={a} />
      <DimX x0={0} x1={W} y={ground1 + 22} k="W" val={W} />
      <DimX x0={W} x1={W + (b ?? 0)} y={ground1 + 22} k="b" val={b} />
      {res.system === 'cantilever' && <DimX x0={W + (b ?? 0)} x1={W + (b ?? 0) + (T ?? 0)} y={ground1 + 22} k="T" val={T} />}
      <DimX x0={-(a ?? 0)} x1={-(a ?? 0) + (L ?? 0)} y={ground1 + 48} k="L" val={L} />
      {res.system === 'cantilever' && v('tD') !== null && v('t1') !== null && <DimX x0={W + v('t1')!} x1={W + v('t1')! + v('tD')!} y={ground1 + 74} k="tD" val={v('tD')} label="kolica" />}

      <text x={20} y={row2 - 18} fontSize={12} fontWeight={700} fill={INK}>Otvoreno — hod {S === null ? '?' : fmt(S)}</text>
      {posts(row2, ground2)}
      {leafShape(S ?? W, row2, ground2, true, 'sk-open')}
      {res.system === 'cantilever' ? ['t1', 't2'].map((k) => trolley(k, ground2)) : null}
      <DimX x0={0} x1={S ?? 0} y={ground2 + 22} k="S" val={S} />
      {P !== null && <DimX x0={W} x1={W + P} y={ground2 + 48} k="P" val={P} />}
      <DimX x0={W} x1={W + (res.derived.Pmin ?? 0)} y={ground2 + 74} k="R" val={res.derived.Pmin ?? null} label="potrebno Pmin" />
    </svg>
  );
}
