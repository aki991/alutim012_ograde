import type { Gate } from '../../domain/models/types';
import { DIM_BY_KEY, fmt, type GateDesign, type GateResult } from '../../domain/gates/design';

/**
 * Skica kapije uz mere: zatvoren i otvoren položaj, referentne ivice (montažna lica stubova, ivice otvora), kote i zazori.
 * Kota koja nedostaje ima crvenu oznaku „?“ na mestu merenja. Klik na kotu otvara njeno polje u listi mera.
 * Podrazumevano se gleda iz dvorišta; za kliznu se skica preslikava prema smeru otvaranja.
 */
export function GateSketch({ gate, res, onPick, width = 900 }: { gate: Gate & { design?: GateDesign }; res: GateResult; onPick?: (key: string) => void; width?: number }) {
  const v = (k: string): number | null => res.values[k]?.v ?? null;
  const W = v('W') ?? 0;
  const H = v('H') ?? gate.heightMm;
  const from = gate.design?.viewFrom === 'ulica' ? 'gledano sa ulice' : 'gledano iz dvorišta';
  if (res.system === 'cantilever' || res.system === 'rail') return <SlidingSketch gate={gate} res={res} W={W} H={H} from={from} onPick={onPick} width={width} />;
  return <SwingSketch gate={gate} res={res} W={W} H={H} from={from} onPick={onPick} width={width} />;
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

function SwingSketch({ gate, res, W, H, from, onPick, width }: P) {
  const v = (k: string): number | null => res.values[k]?.v ?? null;
  const span = W + 2 * POST;
  const s = (width - 40) / Math.max(span, 1);
  const ox = 20 + POST * s;
  const elevTop = 34;
  const hPx = Math.min(H * s, 220);
  const ys = hPx / H;
  const groundY = elevTop + hPx + 10;
  const double = res.system === 'swing_double';
  const gB = v('gB');
  // tlocrt: otvoren položaj (krila zaokrenuta za ugao otvaranja)
  const ang = ((v('angle') ?? 90) * Math.PI) / 180;
  const inward = gate.swing === 'inward';
  const dir = 1; // na tlocrtu se krila uvek otvaraju naniže; natpis kaže koja je to strana (dvorište ili ulica)
  const chainY = groundY + 30;
  const leafRects = res.leaves.map((l) => ({ ...l, x0: l.x, w: l.w }));
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
  const planY = chainY + 24 + (unplaced.length ? 20 : 0) + 48;
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
        {/* stubovi i montažna lica */}
        <rect x={-POST * s} y={elevTop - 10} width={POST * s} height={hPx + 20} fill="#e5e7eb" stroke={INK} />
        <rect x={W * s} y={elevTop - 10} width={POST * s} height={hPx + 20} fill="#e5e7eb" stroke={INK} />
        <line x1={-POST * s - 10} y1={groundY} x2={(W + POST) * s + 10} y2={groundY} stroke={INK} strokeWidth={1.5} />
        <text x={-POST * s} y={groundY + 12} fontSize={9.5} fill="#6b7280">gotova kota podloge</text>
        {leafRects.map((l, i) => {
          const known = l.x0 !== null && l.w !== null;
          const x = (l.x0 ?? (i === 0 ? 0 : W / 2)) * s;
          const w = (l.w ?? W / 2) * s;
          const bottom = groundY - (gB ?? 0) * ys;
          return (
            <g key={i} data-testid={`sk-leaf-${i}`}>
              <rect x={x} y={bottom - hPx} width={w} height={hPx} fill={known ? '#fef2f2' : 'none'} stroke={known ? INK : MISS} strokeDasharray={known ? undefined : '5 4'} strokeWidth={1.5} />
              <text x={x + w / 2} y={bottom - hPx / 2} textAnchor="middle" fontSize={11} fill={INK}>{l.label}{gate.design?.activeLeaf && ((gate.design.activeLeaf === 'left' && i === 0) || (gate.design.activeLeaf === 'right' && i === 1)) ? ' (aktivno)' : ''}</text>
              {/* šarke na strani ose */}
              {l.hinge && [0.18, 0.82].map((f) => <rect key={f} x={(l.hinge === 'left' ? x : x + w) - 3} y={bottom - hPx * f - 6} width={6} height={12} fill={INK} />)}
            </g>
          );
        })}
        {chain.map((c) => (c.x0 !== null && c.x1 !== null ? <Dim key={c.k} k={c.k} val={c.val} x0={c.x0} x1={c.x1} y={chainY} s={s} onPick={onPick} /> : null))}
        {unplaced.length > 0 && (
          // kote bez poznatog položaja (nedostaju susedne): jedan red, svaka se otvara klikom
          <text x={0} y={chainY + 44} fontSize={11} fill={MISS}>
            <tspan>Nedostaju kote: </tspan>
            {unplaced.map((c, i) => (
              <tspan key={c.k} data-testid={`sk-dim-${c.k}`} data-value="" style={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={() => onPick?.(c.k)}>{i ? ', ' : ''}{DIM_BY_KEY[c.k]?.label ?? c.k}</tspan>
            ))}
          </text>
        )}
        <Dim k="W" val={W} x0={0} x1={W} y={chainY + 24} s={s} onPick={onPick} label="W" />
        {/* visina i donji zazor */}
        <g data-testid="sk-dim-H" onClick={() => onPick?.('H')} style={{ cursor: 'pointer' }}>
          <line x1={(W + POST) * s + 8} y1={groundY - (gB ?? 0) * ys} x2={(W + POST) * s + 8} y2={groundY - (gB ?? 0) * ys - hPx} stroke={INK} />
          <text x={(W + POST) * s + 2} y={elevTop + hPx / 2} fontSize={11} fill={INK} textAnchor="end" transform={`rotate(-90 ${(W + POST) * s + 2} ${elevTop + hPx / 2})`}>H {fmt(H, '')}</text>
        </g>
        <g data-testid="sk-dim-gB" onClick={() => onPick?.('gB')} style={{ cursor: 'pointer' }}>
          <text x={(W + POST) * s} y={groundY + 12} fontSize={10} textAnchor="end" fill={gB === null ? MISS : INK}>{gB === null ? 'donji zazor ?' : `donji zazor ${fmt(gB, '')}`}</text>
        </g>
        {/* tlocrt: otvoren položaj */}
        <text x={-POST * s} y={planY - 30} fontSize={12} fontWeight={700} fill={INK}>Otvoreno (tlocrt) — otvaranje {inward ? 'ka dvorištu' : 'ka ulici'}{v('angle') !== null ? `, ${fmt(v('angle'), '°')}` : ''}</text>
        <rect x={planOx - POST * ps} y={planY - 5} width={POST * ps} height={10} fill="#e5e7eb" stroke={INK} />
        <rect x={planOx + W * ps} y={planY - 5} width={POST * ps} height={10} fill="#e5e7eb" stroke={INK} />
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
