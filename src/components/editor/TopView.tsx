import { computeLayout } from '../../domain/geometry/layout';
import { computePlan } from '../../domain/geometry/plan';
import { colorHex, GATE_LABELS } from '../../domain/models/catalog';
import type { Project } from '../../domain/models/types';
import { fmtMm } from '../../utils/units';
import { SvgDefs } from '../fences/InfillArt';

const deg = (rad: number) => (rad * 180) / Math.PI;

/**
 * Pogled odozgo (tlocrt trase): linijski prikaz elemenata, stubova, uglova skretanja, pravaca otvaranja i kapija.
 * Elementi se crtaju u svom lokalnom koordinatnom sistemu (duž x) i postavljaju na trasu translacijom i rotacijom.
 */
export function TopView({ project, scale, selectedId, selectedPostId, onSelect, onSelectPost }: {
  project: Project; scale: number; selectedId?: string | null; selectedPostId?: string | null;
  onSelect?: (id: string) => void; onSelectPost?: (id: string) => void;
}) {
  const layout = computeLayout(project);
  const plan = computePlan(project);
  const px = 1 / scale;
  const maxSwing = Math.max(1200, ...project.items.filter((i) => i.kind === 'gate').map((i) => i.widthMm));
  const padX = 90 * px;
  const postW = project.posts[0]?.widthMm ?? 0;
  const padZ = maxSwing + 400;
  const vx = plan.minX - postW / 2 - padX - (plan.turned ? padZ - padX : 0);
  const vw = plan.maxX - plan.minX + postW + 2 * padX + (plan.turned ? 2 * (padZ - padX) : 0);
  const top = plan.minZ - padZ - (plan.turned ? 0 : 100);
  const bottom = plan.maxZ + padZ + 100;
  const vh = bottom - top;

  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={`${vx} ${top} ${vw} ${vh}`} width={vw * scale} height={vh * scale} data-testid="top-view" data-turned={plan.turned ? 'true' : 'false'} style={{ display: 'block', fontFamily: 'Inter Variable, Inter, sans-serif' }}>
      <SvgDefs />
      <rect x={vx} y={top} width={vw} height={vh} fill="#fff" />
      {!plan.turned && (
        <>
          <rect x={vx} y={0} width={vw} height={bottom} fill="#f4f7f3" />
          <text x={vx + 20 * px} y={top + 24 * px} fontSize={12 * px} fill="#64748b">Ulica / spolja</text>
          <text x={vx + 20 * px} y={bottom - 14 * px} fontSize={12 * px} fill="#64748b">Dvorište / unutra</text>
          <line x1={vx} y1={0} x2={vx + vw} y2={0} stroke="#cbd5e1" strokeWidth={1 * px} strokeDasharray={`${6 * px} ${4 * px}`} />
        </>
      )}

      {layout.items.map((li) => {
        const it = li.item;
        const pi = plan.items[li.index];
        const x1 = li.clearStart;
        const x2 = li.clearEnd;
        const sel = it.id === selectedId;
        const col = it.kind === 'opening' ? '#94a3b8' : colorHex(it.color);
        const th = it.kind === 'gate' ? 60 : 45;
        const hd = deg(pi.heading);
        const mid = { x: (pi.start.x + pi.end.x) / 2, z: (pi.start.z + pi.end.z) / 2 };
        // oznake ostaju vodoravne i pomerene na stranu ulice (normala na trasu)
        const nx = Math.sin(pi.heading);
        const nz = -Math.cos(pi.heading);
        const off = th + 40 * px;
        return (
          <g key={it.id}>
            <g transform={`translate(${pi.start.x} ${pi.start.z}) rotate(${hd}) translate(${-li.axisStart} 0)`} onClick={() => onSelect?.(it.id)} data-hit="item" style={{ cursor: 'pointer' }}>
              {it.kind === 'opening' && it.bendDeg !== undefined ? (
                <line x1={li.axisStart} y1={0} x2={li.axisEnd} y2={0} stroke="#0ea5e9" strokeWidth={5 * px} />
              ) : it.kind === 'opening' ? (
                <line x1={x1} y1={0} x2={x2} y2={0} stroke={col} strokeWidth={4 * px} strokeDasharray={`${10 * px} ${8 * px}`} />
              ) : (
                <rect x={x1} y={-th / 2} width={x2 - x1} height={th} fill={col} stroke="#0b1119" strokeWidth={1.5 * px} />
              )}
              {it.kind === 'gate' && it.gateType === 'sliding' && (
                <g>
                  <rect x={it.opening === 'right' ? x2 : x1 - li.clearWidth} y={-th / 2 + 90} width={li.clearWidth} height={th} fill="none" stroke="#64748b" strokeWidth={1.5 * px} strokeDasharray={`${8 * px} ${6 * px}`} />
                  <line x1={(x1 + x2) / 2} y1={90} x2={it.opening === 'right' ? x2 + li.clearWidth * 0.7 : x1 - li.clearWidth * 0.7} y2={90} stroke="#d71920" strokeWidth={3 * px} markerEnd="url(#arrow-end)" />
                </g>
              )}
              {it.kind === 'gate' && it.gateType !== 'sliding' && (() => {
                const dir = it.swing === 'inward' ? 1 : -1;
                if (it.gateType === 'double') {
                  const half = (x2 - x1) / 2;
                  return (
                    <g fill="none" stroke="#d71920" strokeWidth={2 * px} strokeDasharray={`${8 * px} ${6 * px}`}>
                      <path d={`M${x1} 0 L${x1} ${dir * half} A${half} ${half} 0 0 ${dir === 1 ? 1 : 0} ${x1 + half} 0`} />
                      <path d={`M${x2} 0 L${x2} ${dir * half} A${half} ${half} 0 0 ${dir === 1 ? 0 : 1} ${x1 + half} 0`} />
                    </g>
                  );
                }
                const r = x2 - x1;
                const hx = it.opening === 'left' ? x1 : x2;
                const fx = it.opening === 'left' ? x2 : x1;
                const sweep = (it.opening === 'left' ? (dir === 1 ? 0 : 1) : dir === 1 ? 1 : 0);
                return (
                  <path d={`M${hx} 0 L${hx} ${dir * r} A${r} ${r} 0 0 ${sweep} ${fx} 0`} fill="none" stroke="#d71920" strokeWidth={2 * px} strokeDasharray={`${8 * px} ${6 * px}`} />
                );
              })()}
              {sel && <rect x={x1 - 8 * px} y={-60} width={x2 - x1 + 16 * px} height={120} fill="none" stroke="#d71920" strokeWidth={3 * px} />}
              <rect x={li.axisStart} y={-th} width={li.axisEnd - li.axisStart} height={th * 2} fill="transparent" />
            </g>
            <text x={mid.x + nx * off} y={mid.z + nz * off} textAnchor="middle" dominantBaseline="middle" fontSize={11.5 * px} fill="#17212e" fontWeight="600" pointerEvents="none">
              {fmtMm(it.widthMm)}
            </text>
            {it.kind === 'gate' && (
              <text x={mid.x + nx * (off + 34 * px)} y={mid.z + nz * (off + 34 * px)} textAnchor="middle" dominantBaseline="middle" fontSize={10.5 * px} fill="#64748b" pointerEvents="none">{GATE_LABELS[it.gateType]}</text>
            )}
            {it.kind === 'gate' && it.gateType === 'sliding' && (
              <text x={pi.start.x + (pi.end.x - pi.start.x) * 0.5 - nx * (160 + 90) } y={pi.start.z + (pi.end.z - pi.start.z) * 0.5 - nz * (160 + 90)} textAnchor="middle" fontSize={10.5 * px} fill="#b45309" pointerEvents="none">potreban prostor za otvaranje</text>
            )}
          </g>
        );
      })}

      {layout.posts.map((lp) => {
        const pp = plan.posts[lp.index];
        if (!pp) return null;
        const w = lp.post.widthMm;
        const sel = lp.post.id === selectedPostId;
        return (
          <g key={lp.post.id} transform={`translate(${pp.at.x} ${pp.at.z}) rotate(${deg(pp.heading)})`} onClick={() => onSelectPost?.(lp.post.id)} data-hit="post" style={{ cursor: onSelectPost ? 'pointer' : undefined }} data-testid={`top-post-${lp.index}`}>
            <rect x={-w / 2} y={-w / 2} width={w} height={w} fill="#17212e" stroke={sel ? '#d71920' : '#fff'} strokeWidth={(sel ? 3 : 1.5) * px} />
            <rect x={-w} y={-w} width={2 * w} height={2 * w} fill="transparent" />
          </g>
        );
      })}

      {/* uglovi skretanja */}
      {plan.posts.filter((pp) => pp.turnDeg !== 0).map((pp) => {
        const h = pp.heading + (pp.turnDeg * Math.PI) / 360; // sredina između dolazećeg i odlazećeg pravca
        const r = 330;
        const a0 = pp.heading;
        const a1 = pp.heading + (pp.turnDeg * Math.PI) / 180;
        const p0 = { x: pp.at.x + r * Math.cos(a0), z: pp.at.z + r * Math.sin(a0) };
        const p1 = { x: pp.at.x + r * Math.cos(a1), z: pp.at.z + r * Math.sin(a1) };
        const large = Math.abs(pp.turnDeg) > 180 ? 1 : 0;
        const sweep = pp.turnDeg > 0 ? 1 : 0;
        return (
          <g key={`turn-${pp.index}`} pointerEvents="none" data-testid={`turn-${pp.index}`}>
            <path d={`M${p0.x} ${p0.z} A${r} ${r} 0 ${large} ${sweep} ${p1.x} ${p1.z}`} fill="none" stroke="#0ea5e9" strokeWidth={2.5 * px} />
            <text x={pp.at.x + (r + 150) * Math.cos(h)} y={pp.at.z + (r + 150) * Math.sin(h)} textAnchor="middle" dominantBaseline="middle" fontSize={12 * px} fontWeight="700" fill="#0369a1">{Math.abs(pp.turnDeg)}°</text>
          </g>
        );
      })}
    </svg>
  );
}
