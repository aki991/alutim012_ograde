import { Trash2, Undo2 } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { DRAWN_KIND_LABELS, drawnPolys, drawnPreset, drawnSize, drawnValid } from '../../domain/models/drawnSection';
import type { DrawnKind, DrawnSection } from '../../domain/models/types';
import { NumInput } from '../forms/NumInput';
import { Modal } from '../ui/Modal';

const fmt = (n: number): string => String(Math.round(n * 100) / 100).replace('.', ',');
const snap = (v: number, step: number): number => Math.round(v / step) * step;

/**
 * Mali prozor za crtanje preseka profila: bira se polazni oblik (U, C, L, Z, cev, traka) sa merama, pa se tačke linije zida
 * pomeraju prevlačenjem ili upisom, a klik na prazno polje dodaje tačku na kraj. Presek se odmah prikazuje (linija zida
 * podebljana za debljinu zida), isti onaj koji posle koriste 2D i 3D prikazi.
 */
export function DrawSectionModal({ initial, onSave, onClose }: { initial?: DrawnSection; onSave: (d: DrawnSection) => void; onClose: () => void }) {
  const [d, setD] = useState<DrawnSection>(() => initial ?? drawnPreset('u', 60, 28, 2));
  const [dims, setDims] = useState(() => { const s = initial ? drawnSize(initial) : { w: 60, h: 28 }; return { a: s.w || 60, b: s.h || 28, t: initial?.wall ?? 2 }; });
  const [step, setStep] = useState(1);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ i: number; box: string } | null>(null);
  const [frozen, setFrozen] = useState<string | null>(null);

  const polys = useMemo(() => drawnPolys(d), [d]);
  const size = drawnSize(d);
  const valid = drawnValid(d);

  // polje crteža: obuhvata tačke i presek, sa marginom (ne menja se dok se tačka prevlači)
  const box = useMemo(() => {
    const xs = [...d.pts.map((p) => p[0]), ...polys.flatMap((p) => p.outline.map((q) => q[0])), 0];
    const ys = [...d.pts.map((p) => p[1]), ...polys.flatMap((p) => p.outline.map((q) => q[1])), 0];
    const x0 = Math.min(...xs); const x1 = Math.max(...xs); const y0 = Math.min(...ys); const y1 = Math.max(...ys);
    const span = Math.max(40, x1 - x0, y1 - y0) * 1.35;
    const cx = (x0 + x1) / 2; const cy = (y0 + y1) / 2;
    return `${cx - span / 2} ${-cy - span / 2} ${span} ${span}`;
  }, [d.pts, polys]);
  const viewBox = frozen ?? box;
  const [vx, vy, vs] = viewBox.split(' ').map(Number);
  const u = vs / 300; // jedan piksel crteža u mm

  const toModel = (e: React.PointerEvent | React.MouseEvent): [number, number] | null => {
    const svg = svgRef.current; const m = svg?.getScreenCTM();
    if (!svg || !m) return null;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return [snap(pt.x, step), snap(-pt.y, step)];
  };
  const setPt = (i: number, p: [number, number]) => setD((cur) => ({ ...cur, pts: cur.pts.map((q, k) => (k === i ? p : q)) }));
  const applyPreset = (kind: DrawnKind) => setD(drawnPreset(kind, dims.a, dims.b, dims.t));
  const outlinePath = polys.map((p) => [p.outline, ...p.holes].map((poly) => `M${poly.map(([x, y]) => `${x} ${-y}`).join('L')}Z`).join('')).join('');
  const linePath = d.pts.length ? `M${d.pts.map(([x, y]) => `${x} ${-y}`).join('L')}${d.closed ? 'Z' : ''}` : '';
  // mreža na svakih 10 mm (ili 50 mm za velike preseke)
  const gridStep = vs > 600 ? 50 : 10;
  const gridLines: React.ReactElement[] = [];
  for (let x = Math.ceil(vx / gridStep) * gridStep; x <= vx + vs; x += gridStep) gridLines.push(<line key={`x${x}`} x1={x} y1={vy} x2={x} y2={vy + vs} />);
  for (let y = Math.ceil(vy / gridStep) * gridStep; y <= vy + vs; y += gridStep) gridLines.push(<line key={`y${y}`} x1={vx} y1={y} x2={vx + vs} y2={y} />);

  return (
    <Modal title="Nacrtaj element (presek profila)" width={820} onClose={onClose}
      footer={<><span className="text-[12.5px] text-slate-600 mr-auto" data-testid="draw-size">{valid ? `Presek ${fmt(size.w)} × ${fmt(size.h)} mm, zid ${fmt(d.wall)} mm` : 'Presek nije potpun: potrebne su bar dve tačke (cev bar tri) i debljina zida.'}</span>
        <button className="btn" onClick={onClose}>Otkaži</button>
        <button className="btn btn-primary" data-testid="draw-save" disabled={!valid} onClick={() => onSave({ ...d, pts: d.pts.map(([x, y]) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100]) })}>Sačuvaj presek</button></>}>
      <div className="flex flex-wrap items-end gap-2 mb-3 text-[13px]" data-testid="draw-preset">
        <label className="flex flex-col gap-1">Polazni oblik
          <select className="input !w-auto !py-1" data-testid="draw-kind" value={d.kind} onChange={(e) => applyPreset(e.target.value as DrawnKind)}>
            {(Object.keys(DRAWN_KIND_LABELS) as DrawnKind[]).map((k) => <option key={k} value={k}>{DRAWN_KIND_LABELS[k]}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 w-20">A (širina)<NumInput testId="draw-a" ariaLabel="A — širina" value={dims.a} onCommit={(v) => v && v > 0 && setDims({ ...dims, a: v })} /></label>
        <label className="flex flex-col gap-1 w-20">B (visina)<NumInput testId="draw-b" ariaLabel="B — visina" value={dims.b} onCommit={(v) => v && v > 0 && setDims({ ...dims, b: v })} /></label>
        <label className="flex flex-col gap-1 w-20">Zid<NumInput testId="draw-t" ariaLabel="Debljina zida za polazni oblik" value={dims.t} onCommit={(v) => v && v > 0 && setDims({ ...dims, t: v })} /></label>
        <button className="btn btn-sm" data-testid="draw-apply" onClick={() => applyPreset(d.kind)}>Nacrtaj oblik</button>
      </div>
      <div className="grid gap-4 md:grid-cols-[320px_minmax(0,1fr)]">
        <div>
          <svg ref={svgRef} viewBox={viewBox} className="w-[300px] h-[300px] bg-white rounded-lg border border-line touch-none cursor-crosshair" data-testid="draw-canvas" role="img" aria-label="Crtež preseka"
            onPointerDown={(e) => { if (e.target !== e.currentTarget && !(e.target as Element).closest('[data-grid]')) return; const p = toModel(e); if (p) setD((cur) => ({ ...cur, pts: [...cur.pts, p] })); }}
            onPointerMove={(e) => { if (!drag.current) return; const p = toModel(e); if (p) setPt(drag.current.i, p); }}
            onPointerUp={() => { drag.current = null; setFrozen(null); }}>
            <g data-grid stroke="#e2e8f0" strokeWidth={u}>{gridLines}</g>
            <g data-grid stroke="#94a3b8" strokeWidth={u * 1.2}><line x1={vx} y1={0} x2={vx + vs} y2={0} /><line x1={0} y1={vy} x2={0} y2={vy + vs} /></g>
            {outlinePath && <path d={outlinePath} fill="#334155" fillOpacity={0.85} fillRule="evenodd" stroke="#0f172a" strokeWidth={u} data-testid="draw-section" pointerEvents="none" />}
            {linePath && <path d={linePath} fill="none" stroke="#d71920" strokeWidth={u * 1.5} strokeDasharray={`${u * 4} ${u * 3}`} pointerEvents="none" />}
            {d.pts.map(([x, y], i) => (
              <circle key={i} cx={x} cy={-y} r={u * 6} fill={i === 0 ? '#d71920' : '#fff'} stroke="#d71920" strokeWidth={u * 2} className="cursor-move" data-testid="draw-point"
                onPointerDown={(e) => { e.stopPropagation(); (e.currentTarget.ownerSVGElement as SVGSVGElement).setPointerCapture(e.pointerId); drag.current = { i, box: viewBox }; setFrozen(viewBox); }} />
            ))}
          </svg>
          <div className="flex items-center gap-2 mt-1.5 text-[12px] text-slate-600">
            <span>Korak</span>
            <select className="input !w-auto !py-0.5 text-[12px]" aria-label="Korak crtanja" value={step} onChange={(e) => setStep(Number(e.target.value))}>{[0.5, 1, 5, 10].map((s) => <option key={s} value={s}>{fmt(s)} mm</option>)}</select>
            <span className="text-muted">Klik na polje dodaje tačku, tačke se prevlače.</span>
          </div>
        </div>
        <div className="text-[13px]">
          <div className="grid grid-cols-[minmax(0,1fr)_100px] items-center gap-2 mb-1.5">
            <label>{d.kind === 'traka' ? 'Debljina trake (mm)' : 'Debljina zida (mm)'}</label>
            <NumInput testId="draw-wall" ariaLabel="Debljina zida" value={d.wall} onCommit={(v) => v && v > 0 && setD({ ...d, wall: v })} />
          </div>
          <label className="flex items-center gap-2 mb-2"><input type="checkbox" data-testid="draw-closed" checked={d.closed} onChange={(e) => setD({ ...d, closed: e.target.checked })} />Zatvoren oblik (cev)</label>
          <div className="font-semibold mb-1">Tačke linije zida (sredina zida, mm)</div>
          <div className="max-h-[210px] overflow-auto scroll-thin rounded-lg border border-line" data-testid="draw-points">
            <table className="w-full text-[12.5px]"><thead><tr><th className="th !py-1">#</th><th className="th !py-1">X</th><th className="th !py-1">Y</th><th className="th !py-1" /></tr></thead>
              <tbody>{d.pts.map(([x, y], i) => (
                <tr key={i}>
                  <td className="px-2 text-muted">{i + 1}</td>
                  <td className="px-1 py-0.5"><NumInput testId={`draw-x-${i}`} ariaLabel={`X tačke ${i + 1}`} value={x} onCommit={(v) => setPt(i, [v ?? 0, y])} /></td>
                  <td className="px-1 py-0.5"><NumInput testId={`draw-y-${i}`} ariaLabel={`Y tačke ${i + 1}`} value={y} onCommit={(v) => setPt(i, [x, v ?? 0])} /></td>
                  <td className="px-1"><button className="btn btn-sm btn-icon" aria-label={`Obriši tačku ${i + 1}`} onClick={() => setD({ ...d, pts: d.pts.filter((_, k) => k !== i) })}><Trash2 size={13} /></button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <div className="flex gap-2 mt-2">
            <button className="btn btn-sm" data-testid="draw-undo" disabled={!d.pts.length} onClick={() => setD({ ...d, pts: d.pts.slice(0, -1) })}><Undo2 size={14} />Ukloni poslednju</button>
            <button className="btn btn-sm" data-testid="draw-clear" disabled={!d.pts.length} onClick={() => setD({ ...d, pts: [] })}><Trash2 size={14} />Obriši sve tačke</button>
          </div>
          <p className="text-[11.5px] text-muted mt-2 leading-snug">Linija zida ide sredinom zida: presek je ta linija podebljana za debljinu zida. Otvorena linija daje U, C, L ili Z profil, zatvorena daje cev. Presek se čuva uz materijal i koriste ga crtanje modela (2D i 3D), 3D prikaz projekta i krojna lista.</p>
        </div>
      </div>
    </Modal>
  );
}
