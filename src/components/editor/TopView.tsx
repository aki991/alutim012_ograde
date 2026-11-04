import { isStair, stairGroupAt } from '../../domain/geometry/stair';
import { computeLayout, isSpacer, outerWidthMm, type LaidOutItem } from '../../domain/geometry/layout';
import { computePlan, planRuns, type Plan } from '../../domain/geometry/plan';
import { colorHex } from '../../domain/models/catalog';
import type { Project } from '../../domain/models/types';
import { fmtMm } from '../../utils/units';
import { itemLabel, itemNumber } from '../../utils/labels';
import { SvgDefs } from '../fences/InfillArt';

const deg = (rad: number) => (rad * 180) / Math.PI;
/** širina stepenica u osnovi (samo za crtež; stvarna širina stepenica nije deo ograde) */
const STAIR_PLAN_WIDTH_MM = 1000;

/** Razmak oko crteža u pikselima ekrana: tu su kote, brojevi pozicija i uglovi; ne zavisi od zuma. */
export const TOP_MARGIN_PX = 84;
/** najmanja širina crteža (px): legenda mora da stane */
const MIN_WIDTH_PX = 520;
const LEGEND_LINE_PX = 16;
const LEGEND_MAX = 14;

interface Pt { x: number; z: number }
const world = (origin: Pt, heading: number, along: number, side: number): Pt => ({
  x: origin.x + along * Math.cos(heading) - side * Math.sin(heading),
  z: origin.z + along * Math.sin(heading) + side * Math.cos(heading),
});

/** Tačke koje određuju okvir crteža: stubovi i prostor koji kapije zauzimaju (zamah krila, klizanje). */
function drawingPoints(project: Project, plan: Plan): Pt[] {
  const layout = computeLayout(project);
  const pts: Pt[] = [];
  const maxPost = Math.max(100, ...layout.posts.map((p) => p.widthMm));
  for (const lp of layout.posts) {
    const at = plan.posts[lp.index]?.at;
    if (at) pts.push({ x: at.x - maxPost / 2, z: at.z - maxPost / 2 }, { x: at.x + maxPost / 2, z: at.z + maxPost / 2 });
  }
  layout.items.forEach((li) => {
    const it = li.item;
    const pi = plan.items[li.index];
    if (pi && isStair(it)) for (const al of [0, li.axisEnd - li.axisStart]) pts.push(world(pi.start, pi.heading, al, STAIR_PLAN_WIDTH_MM + 60));
    if (it.kind !== 'gate' || !pi) return;
    const a = li.clearStart - li.axisStart;
    const b = li.clearEnd - li.axisStart;
    if (it.gateType === 'sliding') {
      const [s0, s1] = it.opening === 'right' ? [b, b + li.clearWidth] : [a - li.clearWidth, a];
      for (const al of [s0, s1]) for (const sd of [0, 160]) pts.push(world(pi.start, pi.heading, al, sd));
    } else {
      const r = it.gateType === 'double' ? li.clearWidth / 2 : li.clearWidth;
      const sd = (it.swing === 'inward' ? 1 : -1) * r;
      for (const al of [a, b]) for (const s of [0, sd]) pts.push(world(pi.start, pi.heading, al, s));
    }
  });
  return pts;
}

/** Okvir crteža (mm) i dodatni prostor (px) potreban za kote i legendu; koristi se i za uklapanje zuma. */
export function topViewLayout(project: Project): { x0: number; x1: number; z0: number; z1: number; marginPx: number; legendPx: number } {
  const plan = computePlan(project, true);
  const pts = drawingPoints(project, plan);
  const xs = pts.map((p) => p.x);
  const zs = pts.map((p) => p.z);
  const n = Math.min(project.items.length, LEGEND_MAX + 1) + 2;
  return { x0: Math.min(0, ...xs), x1: Math.max(1, ...xs), z0: Math.min(0, ...zs), z1: Math.max(1, ...zs), marginPx: TOP_MARGIN_PX, legendPx: n * LEGEND_LINE_PX + 24 };
}

const niceLength = (scale: number): number => {
  for (const l of [100, 200, 500, 1000, 2000, 5000, 10000]) if (l * scale >= 70) return l;
  return 20000;
};

/**
 * Pogled odozgo (tlocrt trase) u obliku tehničkog crteža: stubovi kao kvadrati, polja i kapije sa pravcima otvaranja,
 * kote duž trase (po elementu i zbirno po nizu), ugao skretanja na stubu, brojevi pozicija sa legendom i razmernik.
 * Sve linije, slova i oznake imaju stalnu veličinu na ekranu, pa crtež ostaje čitljiv pri svakom zumu.
 */
export function TopView({ project, scale, selectedId, selectedPostId, onSelect, onSelectPost }: {
  project: Project; scale: number; selectedId?: string | null; selectedPostId?: string | null;
  onSelect?: (id: string) => void; onSelectPost?: (id: string) => void;
}) {
  const layout = computeLayout(project);
  const plan = computePlan(project, true);
  const px = 1 / scale;
  const box = topViewLayout(project);
  const realItems = layout.items.filter((li) => !isSpacer(li.item));
  const legendItems = realItems.slice(0, LEGEND_MAX);
  const extraX = Math.max(0, (MIN_WIDTH_PX * px - (box.x1 - box.x0 + 2 * box.marginPx * px)) / 2);
  const vx = box.x0 - box.marginPx * px - extraX;
  const vy = box.z0 - box.marginPx * px;
  const vw = box.x1 - box.x0 + 2 * box.marginPx * px + 2 * extraX;
  const vh = box.z1 - box.z0 + 2 * box.marginPx * px + box.legendPx * px;
  const halo = { stroke: '#fff', strokeWidth: 3.5 * px, paintOrder: 'stroke' as const, strokeLinejoin: 'round' as const };
  const runs = planRuns(plan);

  /** Kota duž pravca `heading` između tačaka a i b, pomerena na stranu ulice (normala −y) za `off` px. */
  const dim = (key: string, a: Pt, b: Pt, heading: number, off: number, text: string, bold = false) => {
    const nx = Math.sin(heading) * off * px;
    const nz = -Math.cos(heading) * off * px;
    const A = { x: a.x + nx, z: a.z + nz };
    const B = { x: b.x + nx, z: b.z + nz };
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const mx = (A.x + B.x) / 2;
    const mz = (A.z + B.z) / 2;
    let ang = deg(heading);
    if (ang > 90 || ang <= -90) ang += 180; // tekst ostaje čitljiv (ne naopako)
    const tick = 5 * px;
    const ux = Math.cos(heading);
    const uz = Math.sin(heading);
    const fits = len * scale > text.length * 6.6 + 10;
    const un = { x: Math.sin(heading), z: -Math.cos(heading) };
    return (
      <g key={key} pointerEvents="none" stroke="#475569" strokeWidth={1 * px} fill="none">
        <line x1={a.x} y1={a.z} x2={A.x + un.x * 3 * px} y2={A.z + un.z * 3 * px} stroke="#94a3b8" />
        <line x1={b.x} y1={b.z} x2={B.x + un.x * 3 * px} y2={B.z + un.z * 3 * px} stroke="#94a3b8" />
        <line x1={A.x} y1={A.z} x2={B.x} y2={B.z} />
        <line x1={A.x - ux * tick + uz * tick} y1={A.z - uz * tick - ux * tick} x2={A.x + ux * tick - uz * tick} y2={A.z + uz * tick + ux * tick} strokeWidth={1.6 * px} />
        <line x1={B.x - ux * tick + uz * tick} y1={B.z - uz * tick - ux * tick} x2={B.x + ux * tick - uz * tick} y2={B.z + uz * tick + ux * tick} strokeWidth={1.6 * px} />
        {fits && (
          <text transform={`translate(${mx} ${mz}) rotate(${ang})`} y={-5 * px} textAnchor="middle" fontSize={(bold ? 12.5 : 11.5) * px} fontWeight={bold ? 700 : 600} fill="#17212e" stroke="none" style={halo}>{text}</text>
        )}
      </g>
    );
  };

  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={`${vx} ${vy} ${vw} ${vh}`} width={vw * scale} height={vh * scale} data-testid="top-view" data-turned={plan.turned ? 'true' : 'false'} style={{ display: 'block', fontFamily: 'Inter Variable, Inter, sans-serif' }}>
      <SvgDefs />
      <rect x={vx} y={vy} width={vw} height={vh} fill="#fff" />
      {!plan.turned && (
        <g pointerEvents="none" fontSize={11 * px} fill="#94a3b8">
          <line x1={vx} y1={0} x2={vx + vw} y2={0} stroke="#e2e8f0" strokeWidth={1 * px} strokeDasharray={`${6 * px} ${4 * px}`} />
          <text x={vx + 12 * px} y={-8 * px}>Ulica / spolja</text>
          <text x={vx + 12 * px} y={16 * px}>Dvorište / unutra</text>
        </g>
      )}

      {/* elementi: polja, kapije, otvori */}
      {layout.items.map((li: LaidOutItem) => {
        const it = li.item;
        if (isSpacer(it)) return null;
        const pi = plan.items[li.index];
        const origin = pi.start;
        const h = pi.heading;
        const a = li.clearStart - li.axisStart;
        const b = li.clearEnd - li.axisStart;
        const sel = it.id === selectedId;
        const th = Math.max(it.kind === 'gate' ? 50 : 36, (it.kind === 'gate' ? 6 : 4.5) * px);
        const fill = it.kind === 'opening' ? '#fff' : colorHex(it.color);
        const dirSign = it.kind === 'gate' && it.swing === 'inward' ? 1 : -1;
        return (
          <g key={it.id} onClick={() => onSelect?.(it.id)} data-hit="item" data-id={it.id} style={{ cursor: 'pointer' }}>
            <g transform={`translate(${origin.x} ${origin.z}) rotate(${deg(h)})`}>
              {it.kind === 'opening' && it.bendDeg !== undefined && (
                <polyline points={[pi.start, pi.bend?.at ?? pi.end, pi.end].map((p) => { const l = { x: p.x - origin.x, z: p.z - origin.z }; const c = Math.cos(-h); const s = Math.sin(-h); return `${l.x * c - l.z * s},${l.x * s + l.z * c}`; }).join(' ')} fill="none" stroke="#0ea5e9" strokeWidth={4 * px} strokeLinejoin="round" />
              )}
              {it.kind === 'opening' && it.bendDeg === undefined && (
                <line x1={a} y1={0} x2={b} y2={0} stroke="#64748b" strokeWidth={1.6 * px} strokeDasharray={`${9 * px} ${6 * px}`} />
              )}
              {it.kind !== 'opening' && (
                <>
                  <rect x={a} y={-th / 2} width={b - a} height={th} fill={fill} stroke="#1f2933" strokeWidth={1.3 * px} />
                  {it.kind === 'gate' && <line x1={a} y1={0} x2={b} y2={0} stroke="#1f2933" strokeWidth={0.8 * px} strokeDasharray={`${4 * px} ${3 * px}`} />}
                </>
              )}
              {it.kind === 'gate' && it.gateType === 'sliding' && (
                <g>
                  <rect x={it.opening === 'right' ? b : a - li.clearWidth} y={90 - th / 2} width={li.clearWidth} height={th} fill="none" stroke="#64748b" strokeWidth={1.2 * px} strokeDasharray={`${8 * px} ${6 * px}`} />
                  <line x1={(a + b) / 2} y1={90 + th / 2} x2={it.opening === 'right' ? b + li.clearWidth * 0.8 : a - li.clearWidth * 0.8} y2={90 + th / 2} stroke="#d71920" strokeWidth={1.8 * px} markerEnd="url(#arrow-end)" />
                </g>
              )}
              {it.kind === 'gate' && it.gateType !== 'sliding' && (() => {
                const leaf = (hx: number, fx: number, r: number, sweep: number) => (
                  <g key={`${hx}-${fx}`} fill="none" stroke="#d71920">
                    <line x1={hx} y1={0} x2={hx} y2={dirSign * r} strokeWidth={2.2 * px} />
                    <path d={`M${hx} ${dirSign * r} A${r} ${r} 0 0 ${sweep} ${fx} 0`} strokeWidth={1.2 * px} strokeDasharray={`${7 * px} ${5 * px}`} />
                  </g>
                );
                if (it.gateType === 'double') {
                  const half = (b - a) / 2;
                  const sw = dirSign === 1 ? 1 : 0;
                  return <g>{leaf(a, a + half, half, sw)}{leaf(b, b - half, half, 1 - sw)}</g>;
                }
                const hinge = it.opening === 'left' ? a : b;
                const free = it.opening === 'left' ? b : a;
                const sw = it.opening === 'left' ? (dirSign === 1 ? 0 : 1) : dirSign === 1 ? 1 : 0;
                return leaf(hinge, free, b - a, sw);
              })()}
              {isStair(it) && (() => {
                // stepenište u osnovi: gazišta sa unutrašnje strane ograde i strelica koja pokazuje uz stepenice
                const grp = stairGroupAt(project.items, li.index)!;
                if (grp.from !== li.index) return null; // gazišta se crtaju jednom za ceo niz polja
                const n = grp.steps;
                const len = layout.items[grp.to].axisEnd - li.axisStart;
                const y0 = th / 2 + 30;
                const y1 = y0 + STAIR_PLAN_WIDTH_MM;
                const up = it.stair.riseMm > 0;
                return (
                  <g data-testid={`top-stair-${li.index}`} pointerEvents="none">
                    <rect x={0} y={y0} width={len} height={STAIR_PLAN_WIDTH_MM} fill="#eef1f5" stroke="#64748b" strokeWidth={1.1 * px} />
                    {Array.from({ length: n - 1 }, (_, k) => <line key={k} x1={(len * (k + 1)) / n} y1={y0} x2={(len * (k + 1)) / n} y2={y1} stroke="#64748b" strokeWidth={1 * px} />)}
                    <line x1={up ? len * 0.04 : len * 0.96} y1={(y0 + y1) / 2} x2={up ? len * 0.96 : len * 0.04} y2={(y0 + y1) / 2} stroke="#d71920" strokeWidth={1.8 * px} markerEnd="url(#arrow-end)" />
                  </g>
                );
              })()}
              {sel && <rect x={a - 6 * px} y={-th / 2 - 6 * px} width={b - a + 12 * px} height={th + 12 * px} fill="none" stroke="#d71920" strokeWidth={2.4 * px} />}
              <rect x={li.axisStart - li.axisStart} y={-th - 20 * px} width={li.axisEnd - li.axisStart} height={2 * th + 40 * px} fill="transparent" />
            </g>
          </g>
        );
      })}

      {/* kote: po elementu (osa–osa stubova) i zbirno po nizu; brojevi pozicija */}
      {layout.items.map((li) => {
        const pi = plan.items[li.index];
        const it = li.item;
        if (isSpacer(it)) return null;
        const a = world(pi.start, pi.heading, 0, 0);
        const b = world(pi.start, pi.heading, li.axisEnd - li.axisStart, 0);
        const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
        const bn = { x: Math.sin(pi.heading) * 16 * px, z: -Math.cos(pi.heading) * 16 * px };
        return (
          <g key={`d-${it.id}`}>
            {it.kind === 'opening' && it.bendDeg !== undefined ? null : dim(`dm-${it.id}`, a, b, pi.heading, 38, fmtMm(outerWidthMm(project, li.index)))}
            <g pointerEvents="none">
              <circle cx={mid.x + bn.x} cy={mid.z + bn.z} r={9 * px} fill="#17212e" />
              <text x={mid.x + bn.x} y={mid.z + bn.z} textAnchor="middle" dominantBaseline="central" fontSize={10.5 * px} fontWeight={700} fill="#fff">{itemNumber(project.items, li.index)}</text>
            </g>
          </g>
        );
      })}
      {runs.filter((r) => r.last > r.first).map((r) => {
        const first = plan.items[r.first];
        const last = plan.items[r.last];
        const a = world(first.start, first.heading, 0, 0);
        const b = world(last.start, last.heading, layout.items[r.last].axisEnd - layout.items[r.last].axisStart, 0);
        const outer = layout.items[r.last].axisEnd - layout.items[r.first].axisStart + ((layout.posts[r.first]?.widthMm ?? 0) + (layout.posts[r.last + 1]?.widthMm ?? 0)) / 2;
        return dim(`run-${r.first}`, a, b, first.heading, 68, fmtMm(outer), true);
      })}

      {/* stubovi */}
      {layout.posts.map((lp) => {
        const pp = plan.posts[lp.index];
        if (!pp || lp.hidden) return null;
        const w = Math.max(lp.post.widthMm, 8 * px);
        const sel = lp.post.id === selectedPostId;
        const masonry = lp.post.type === 'concrete' || lp.post.type === 'concrete_plinth' || lp.post.type === 'decorative';
        return (
          <g key={lp.post.id} transform={`translate(${pp.at.x + pp.shift.x} ${pp.at.z + pp.shift.z}) rotate(${deg(pp.supportHeading)})`} onClick={() => onSelectPost?.(lp.post.id)} data-hit="post" data-id={lp.post.id} style={{ cursor: onSelectPost ? 'pointer' : undefined }} data-testid={`top-post-${lp.index}`}>
            <rect x={-w / 2} y={-w / 2} width={w} height={w} fill={masonry ? '#cbd0d6' : '#fff'} stroke={sel ? '#d71920' : '#17212e'} strokeWidth={(sel ? 2.8 : 1.8) * px} />
            <rect x={-w / 2 + w * 0.22} y={-w / 2 + w * 0.22} width={w * 0.56} height={w * 0.56} fill="#17212e" />
            <rect x={-w} y={-w} width={2 * w} height={2 * w} fill="transparent" />
          </g>
        );
      })}

      {/* ugao u osnovi (model RL10): drugi stub na dolazećoj ogradi */}
      {layout.posts.filter((lp) => !lp.hidden && plan.posts[lp.index]?.aux).map((lp) => {
        const pp = plan.posts[lp.index];
        const w = Math.max(lp.post.widthMm, 12 * px);
        return (
          <g key={`aux-${lp.post.id}`} transform={`translate(${pp.aux!.x} ${pp.aux!.z}) rotate(${deg(pp.heading)})`} pointerEvents="none">
            <rect x={-w / 2} y={-w / 2} width={w} height={w} fill="#fff" stroke="#17212e" strokeWidth={1.8 * px} />
            <rect x={-w / 2 + w * 0.22} y={-w / 2 + w * 0.22} width={w * 0.56} height={w * 0.56} fill="#17212e" />
          </g>
        );
      })}

      {/* uglovi skretanja: luk između produžetka dolazećeg pravca i novog pravca */}
      {plan.posts.filter((pp) => pp.turnDeg !== 0).map((pp) => {
        const r = 44 * px;
        const a0 = pp.heading;
        const a1 = pp.heading + (pp.turnDeg * Math.PI) / 180;
        const am = (a0 + a1) / 2;
        const p0 = { x: pp.at.x + r * Math.cos(a0), z: pp.at.z + r * Math.sin(a0) };
        const p1 = { x: pp.at.x + r * Math.cos(a1), z: pp.at.z + r * Math.sin(a1) };
        const ext = { x: pp.at.x + 78 * px * Math.cos(a0), z: pp.at.z + 78 * px * Math.sin(a0) };
        const large = Math.abs(pp.turnDeg) > 180 ? 1 : 0;
        const sweep = pp.turnDeg > 0 ? 1 : 0;
        return (
          <g key={`turn-${pp.index}`} pointerEvents="none" data-testid={`turn-${pp.index}`}>
            <line x1={pp.at.x} y1={pp.at.z} x2={ext.x} y2={ext.z} stroke="#0ea5e9" strokeWidth={1.1 * px} strokeDasharray={`${5 * px} ${4 * px}`} />
            <path d={`M${p0.x} ${p0.z} A${r} ${r} 0 ${large} ${sweep} ${p1.x} ${p1.z}`} fill="none" stroke="#0284c7" strokeWidth={2 * px} />
            <text x={pp.at.x + 70 * px * Math.cos(am)} y={pp.at.z + 70 * px * Math.sin(am)} textAnchor="middle" dominantBaseline="central" fontSize={12.5 * px} fontWeight={700} fill="#0369a1" style={halo}>{Math.abs(pp.turnDeg)}°</text>
          </g>
        );
      })}

      {/* legenda pozicija, razmernik */}
      <g pointerEvents="none" fontSize={11.5 * px} fill="#334155">
        <text x={vx + 12 * px} y={vy + vh - (box.legendPx - 14) * px} fontWeight={700} fill="#17212e">Pozicije (mere su spoljne, kao u panelu)</text>
        {legendItems.map((li, i) => (
          <g key={li.item.id}>
            <circle cx={vx + 19 * px} cy={vy + vh - (box.legendPx - 14 - (i + 1) * LEGEND_LINE_PX - 1) * px} r={6.5 * px} fill="#17212e" />
            <text x={vx + 19 * px} y={vy + vh - (box.legendPx - 14 - (i + 1) * LEGEND_LINE_PX - 1) * px} textAnchor="middle" dominantBaseline="central" fontSize={8.5 * px} fontWeight={700} fill="#fff">{itemNumber(project.items, li.index)}</text>
            <text x={vx + 32 * px} y={vy + vh - (box.legendPx - 14 - (i + 1) * LEGEND_LINE_PX - 1) * px} dominantBaseline="central">
              {itemLabel(project.items, li.index)}{`  ·  ${fmtMm(outerWidthMm(project, li.index))} × ${fmtMm(li.item.heightMm)}`}
            </text>
          </g>
        ))}
        {realItems.length > LEGEND_MAX && <text x={vx + 32 * px} y={vy + vh - 20 * px} fill="#64748b">… još {realItems.length - LEGEND_MAX}</text>}
        <text x={vx + vw - 12 * px - 4 * px} y={vy + vh - 30 * px} textAnchor="end" fontWeight={700} fill="#17212e">Ukupna dužina: {fmtMm(layout.occupiedMm)}</text>
        {(() => {
          const L = niceLength(scale);
          const x1 = vx + vw - 12 * px;
          const x0 = x1 - L;
          const y = vy + vh - 14 * px;
          return (
            <g>
              <line x1={x0} y1={y} x2={x1} y2={y} stroke="#17212e" strokeWidth={2 * px} />
              <line x1={x0} y1={y - 4 * px} x2={x0} y2={y + 4 * px} stroke="#17212e" strokeWidth={1.4 * px} />
              <line x1={x1} y1={y - 4 * px} x2={x1} y2={y + 4 * px} stroke="#17212e" strokeWidth={1.4 * px} />
              <text x={(x0 + x1) / 2} y={y - 6 * px} textAnchor="middle" fontSize={10.5 * px}>{L >= 1000 ? `${L / 1000} m` : `${L} mm`}</text>
            </g>
          );
        })()}
      </g>
    </svg>
  );
}
