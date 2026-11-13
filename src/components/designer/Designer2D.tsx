import { Maximize2, ZoomIn, ZoomOut } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { partBounds, type CustomModel, type CustomPart } from '../../domain/models/custom';
import { materialShape, sectionFace, type MatShape } from '../../domain/models/materialShape';
import type { Material } from '../../domain/models/types';
import { uid } from '../../utils/id';
import { PartSvg, type ResolvedPart } from './PartsSvg';

interface View { x: number; y: number; w: number }
type Drag =
  | { mode: 'draw'; sx: number; sy: number }
  | { mode: 'move'; id: string; sx: number; sy: number; ox: number; oy: number; moved: boolean }
  | { mode: 'pan'; cx: number; cy: number; view: View };

interface Props {
  model: CustomModel;
  parts: ResolvedPart[];
  /** materijal kojim se crta; null = izbor i pomeranje */
  active: Material | null;
  selectedId: string | null;
  /** samo vodoravno i uspravno */
  ortho: boolean;
  gridMm: number;
  onSelect: (id: string | null) => void;
  onAdd: (part: CustomPart) => void;
  onMoveStart: () => void;
  onMove: (id: string, x: number, y: number) => void;
}

const snap = (v: number, g: number): number => Math.round(v / g) * g;

/** Deo koji nastaje povlačenjem od (sx, sy) do (ex, ey); null ako je povlačenje prekratko. */
export function partFromDrag(materialId: string, shape: MatShape, sx: number, sy: number, ex: number, ey: number, ortho: boolean, id: string): CustomPart | null {
  const base = { id, materialId, rot: 0, z: 0 };
  if (shape.type === 'piece') return { ...base, x: ex, y: ey, lengthMm: 0, angleDeg: 0 };
  const dx = ex - sx; const dy = ey - sy;
  if (shape.type === 'sheet') {
    if (Math.abs(dx) < 10 || Math.abs(dy) < 10) return null;
    return { ...base, x: Math.min(sx, ex), y: Math.min(sy, ey), lengthMm: Math.abs(dx), heightMm: Math.abs(dy), angleDeg: 0 };
  }
  if (ortho) {
    if (Math.abs(dx) >= Math.abs(dy)) return Math.abs(dx) < 10 ? null : { ...base, x: Math.min(sx, ex), y: sy, lengthMm: Math.abs(dx), angleDeg: 0 };
    return { ...base, x: sx, y: Math.min(sy, ey), lengthMm: Math.abs(dy), angleDeg: 90 };
  }
  const len = Math.round(Math.hypot(dx, dy));
  if (len < 10) return null;
  return { ...base, x: sx, y: sy, lengthMm: len, angleDeg: Math.round((Math.atan2(dy, dx) * 180) / Math.PI) };
}

/** Platno za crtanje modela: pogled spreda u mm. Izabranim materijalom se crta povlačenjem, a delovi se pomeraju mišem. */
export function Designer2D({ model, parts, active, selectedId, ortho, gridMm, onSelect, onAdd, onMoveStart, onMove }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 800, h: 500 });
  const [view, setView] = useState<View>({ x: -200, y: -1700, w: 2400 });
  const drag = useRef<Drag | null>(null);
  const [ghost, setGhost] = useState<CustomPart | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const activeShape = useMemo(() => (active ? materialShape(active) : null), [active]);
  const vh = (view.w * size.h) / size.w;

  const fit = useCallback(() => {
    let x0 = 0; let y0 = 0; let x1 = model.widthMm; let y1 = model.heightMm;
    for (const r of parts) { const b = partBounds(r.part, r.shape); x0 = Math.min(x0, b.x0); y0 = Math.min(y0, b.y0); x1 = Math.max(x1, b.x1); y1 = Math.max(y1, b.y1); }
    const pad = Math.max(x1 - x0, y1 - y0) * 0.12 + 60;
    const w = Math.max(x1 - x0 + 2 * pad, ((y1 - y0 + 2 * pad) * size.w) / size.h);
    const h = (w * size.h) / size.w;
    setView({ x: (x0 + x1) / 2 - w / 2, y: -(y0 + y1) / 2 - h / 2, w });
  }, [model.widthMm, model.heightMm, parts, size.w, size.h]);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: Math.max(50, el.clientWidth), h: Math.max(50, el.clientHeight) }));
    ro.observe(el);
    setSize({ w: Math.max(50, el.clientWidth), h: Math.max(50, el.clientHeight) });
    return () => ro.disconnect();
  }, []);
  // pogled se uklapa pri otvaranju i kad se promeni veličina polja ili platna
  const fitRef = useRef(fit);
  fitRef.current = fit;
  useEffect(() => { fitRef.current(); }, [model.widthMm, model.heightMm, size.w, size.h]);

  const toWorld = (cx: number, cy: number): { x: number; y: number } => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: view.x + ((cx - r.left) / r.width) * view.w, y: -(view.y + ((cy - r.top) / r.height) * vh) };
  };
  const zoomAt = (factor: number, cx?: number, cy?: number) => {
    setView((v) => {
      const r = svgRef.current!.getBoundingClientRect();
      const fx = cx === undefined ? 0.5 : (cx - r.left) / r.width;
      const fy = cy === undefined ? 0.5 : (cy - r.top) / r.height;
      const h = (v.w * r.height) / r.width;
      const w2 = Math.min(60000, Math.max(60, v.w * factor));
      const h2 = (w2 * r.height) / r.width;
      return { x: v.x + fx * (v.w - w2), y: v.y + fy * (h - h2), w: w2 };
    });
  };
  // točkić miša zumira oko pokazivača (neposredni listener: React-ov onWheel je pasivan)
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => { e.preventDefault(); zoomAt(e.deltaY > 0 ? 1.15 : 1 / 1.15, e.clientX, e.clientY); };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    const p = toWorld(e.clientX, e.clientY);
    e.currentTarget.setPointerCapture(e.pointerId);
    if (e.button === 1 || e.button === 2) { drag.current = { mode: 'pan', cx: e.clientX, cy: e.clientY, view }; return; }
    if (active) { drag.current = { mode: 'draw', sx: snap(p.x, gridMm), sy: snap(p.y, gridMm) }; return; }
    const id = (e.target as Element).closest('[data-part-id]')?.getAttribute('data-part-id');
    const hit = id ? parts.find((r) => r.part.id === id) : undefined;
    if (hit) {
      onSelect(hit.part.id);
      drag.current = { mode: 'move', id: hit.part.id, sx: p.x, sy: p.y, ox: hit.part.x, oy: hit.part.y, moved: false };
    } else {
      onSelect(null);
      drag.current = { mode: 'pan', cx: e.clientX, cy: e.clientY, view };
    }
  };
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const p = toWorld(e.clientX, e.clientY);
    const sp = { x: snap(p.x, gridMm), y: snap(p.y, gridMm) };
    setCursor(sp);
    const d = drag.current;
    if (!d) { if (active && activeShape?.type === 'piece') setGhost(partFromDrag(active.id, activeShape, sp.x, sp.y, sp.x, sp.y, ortho, 'ghost')); return; }
    if (d.mode === 'pan') {
      const r = e.currentTarget.getBoundingClientRect();
      setView({ ...d.view, x: d.view.x - ((e.clientX - d.cx) / r.width) * d.view.w, y: d.view.y - ((e.clientY - d.cy) / r.height) * ((d.view.w * r.height) / r.width) });
    } else if (d.mode === 'move') {
      const dx = snap(p.x - d.sx, gridMm); const dy = snap(p.y - d.sy, gridMm);
      if (!d.moved && (dx !== 0 || dy !== 0)) { d.moved = true; onMoveStart(); }
      if (d.moved) onMove(d.id, d.ox + dx, d.oy + dy);
    } else if (active && activeShape) {
      setGhost(partFromDrag(active.id, activeShape, d.sx, d.sy, sp.x, sp.y, ortho, 'ghost'));
    }
  };
  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    drag.current = null;
    if (d?.mode === 'draw' && active && activeShape) {
      const p = toWorld(e.clientX, e.clientY);
      const part = partFromDrag(active.id, activeShape, d.sx, d.sy, snap(p.x, gridMm), snap(p.y, gridMm), ortho, uid('part'));
      if (part) onAdd(part);
      setGhost(null);
    }
  };

  // mreža: linije na 100 mm (na 1000 mm kad je pogled širok), jače na svakih pet
  const step = view.w > 12000 ? 1000 : 100;
  const gx0 = Math.floor(view.x / step) * step; const gy0 = Math.floor(view.y / step) * step;
  const lines: React.ReactNode[] = [];
  if (view.w / step < 160) {
    for (let x = gx0; x < view.x + view.w; x += step) lines.push(<line key={`x${x}`} x1={x} y1={view.y} x2={x} y2={view.y + vh} stroke="#cbd5e1" strokeOpacity={x % (step * 5) === 0 ? 0.9 : 0.4} strokeWidth={1} vectorEffect="non-scaling-stroke" />);
    for (let y = gy0; y < view.y + vh; y += step) lines.push(<line key={`y${y}`} x1={view.x} y1={y} x2={view.x + view.w} y2={y} stroke="#cbd5e1" strokeOpacity={y % (step * 5) === 0 ? 0.9 : 0.4} strokeWidth={1} vectorEffect="non-scaling-stroke" />);
  }
  const fs = view.w / 70; // veličina slova prati zum, pa su natpisi iste veličine na ekranu
  const ghostLabel = ghost && activeShape && activeShape.type !== 'piece'
    ? (activeShape.type === 'sheet' ? `${ghost.lengthMm} × ${ghost.heightMm} mm` : `${ghost.lengthMm} mm${activeShape.type === 'linear' ? ` · širina ${sectionFace(activeShape.section, 0).face} mm` : ''}`)
    : null;

  return (
    <div ref={wrapRef} className="relative h-full w-full bg-[#eef2f6] overflow-hidden select-none" style={{ touchAction: 'none' }} data-testid="designer-2d">
      <svg ref={svgRef} className="absolute inset-0 w-full h-full" viewBox={`${view.x} ${view.y} ${view.w} ${vh}`} style={{ cursor: active ? 'crosshair' : 'default' }}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={() => { setCursor(null); if (!drag.current) setGhost(null); }} onContextMenu={(e) => e.preventDefault()}>
        {lines}
        <line x1={view.x} y1={0} x2={view.x + view.w} y2={0} stroke="#64748b" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        <rect x={0} y={-model.heightMm} width={model.widthMm} height={model.heightMm} fill="#fff" fillOpacity={0.55} stroke="#2563eb" strokeWidth={1.2} strokeDasharray="7 5" vectorEffect="non-scaling-stroke" />
        <text x={model.widthMm / 2} y={fs * 1.6} textAnchor="middle" fontSize={fs} fill="#2563eb" fontWeight="600">{model.widthMm} mm</text>
        <text x={-fs * 0.8} y={-model.heightMm / 2} textAnchor="middle" fontSize={fs} fill="#2563eb" fontWeight="600" transform={`rotate(-90 ${-fs * 0.8} ${-model.heightMm / 2})`}>{model.heightMm} mm</text>
        <g transform="scale(1,-1)">
          {parts.map((r) => <PartSvg key={r.part.id} part={r.part} shape={r.shape} hex={r.hex} selected={r.part.id === selectedId} />)}
          {ghost && activeShape && <PartSvg part={ghost} shape={activeShape} hex="#d71920" ghost />}
        </g>
        {ghost && ghostLabel && <text x={ghost.x + fs} y={-(ghost.y + (ghost.heightMm ?? 0)) - fs * 1.2} fontSize={fs} fill="#d71920" fontWeight="700" data-testid="designer-ghost-label">{ghostLabel}</text>}
      </svg>
      <div className="absolute left-3 bottom-3 text-[12px] bg-white/90 border border-line rounded-lg px-2.5 py-1 tabular-nums text-slate-700" data-testid="designer-cursor">
        {cursor ? `X ${cursor.x} · Y ${cursor.y} mm` : 'Pogled spreda'}
      </div>
      {active && (
        <div className="absolute left-3 top-3 right-28 text-[12.5px] bg-white/95 border border-line rounded-lg px-3 py-1.5 text-slate-700" data-testid="designer-hint">
          <b>{active.sku}</b> — {activeShape?.type === 'piece' ? 'kliknite na mesto gde deo treba da stoji.' : activeShape?.type === 'sheet' ? 'povucite mišem pravougaonik ploče.' : 'povucite mišem od početka do kraja profila.'} Esc: kraj crtanja.
        </div>
      )}
      <div className="absolute right-3 top-3 flex gap-1.5">
        <button className="btn btn-icon" aria-label="Uvećaj" onClick={() => zoomAt(1 / 1.3)}><ZoomIn size={16} /></button>
        <button className="btn btn-icon" aria-label="Umanji" onClick={() => zoomAt(1.3)}><ZoomOut size={16} /></button>
        <button className="btn btn-icon" aria-label="Uklopi ceo model" onClick={fit}><Maximize2 size={16} /></button>
      </div>
    </div>
  );
}
