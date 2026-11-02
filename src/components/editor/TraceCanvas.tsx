import { Check, Pencil, Trash2, Undo2, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { pointAt, segmentLength, setSegmentLength, setTurnAt, snapTracePoint, turnBetween, type TracePoint } from '../../domain/geometry/trace';
import { FENCE_MODEL_LIST, FENCE_MODELS } from '../../domain/models/catalog';
import type { FenceModelId } from '../../domain/models/types';
import { fmtMm, fmtNum } from '../../utils/units';

const RED = '#d71920';
const AMBER = '#f59e0b';

interface View { cx: number; cz: number; w: number }

/** Širina prikaza (mm) koja uklapa tačke sa rezervom, za površinu cw × ch (px). */
function fitView(pts: TracePoint[], cw: number, ch: number): View {
  const xs = pts.map((p) => p.x); const zs = pts.map((p) => p.z);
  const x0 = Math.min(...xs); const x1 = Math.max(...xs); const z0 = Math.min(...zs); const z1 = Math.max(...zs);
  return { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, w: Math.max(VIEW_MIN_MM, (x1 - x0) * 1.5, (z1 - z0) * 1.5 * (cw / ch)) };
}

/** Početni prikaz: 10 m u širinu, mreža na 1 m. */
const VIEW_MIN_MM = 10000;
const START_VIEW: View = { cx: 5000, cz: 0, w: VIEW_MIN_MM };

/**
 * Crtanje trase ograde. Režim „crtanje": klik postavlja tačku, kucanjem dužine + Enter zadaje se tačna mera.
 * „Završi crtanje" (Enter bez broja, dvoklik) prelazi u režim „izmena": mere i uglovi se menjaju u tabeli, tačke se
 * povlače mišem, crtanje može da se nastavi, a ograda se pravi tek na „Napravi ogradu".
 */
export function TraceCanvas({ modelId, onModel, onFinish, onCancel }: {
  modelId: FenceModelId;
  onModel: (m: FenceModelId) => void;
  onFinish: (points: TracePoint[]) => void;
  onCancel: () => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 700, h: 420 });
  const [mode, setMode] = useState<'draw' | 'edit'>('draw');
  const [points, setPoints] = useState<TracePoint[]>([]);
  const [cursor, setCursor] = useState<TracePoint | null>(null);
  const [typed, setTyped] = useState('');
  const [view, setView] = useState<View>(START_VIEW);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setSize({ w: Math.max(200, el.clientWidth), h: Math.max(160, el.clientHeight) });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);

  const px = view.w / size.w; // mm po ekranskom pikselu
  const vh = view.w * (size.h / size.w);
  const vx = view.cx - view.w / 2;
  const vz = view.cz - vh / 2;

  const last = points[points.length - 1] ?? null;
  const cursorSnapped = useMemo(() => (cursor && mode === 'draw' ? snapTracePoint(last, cursor) : null), [cursor, last, mode]);
  const preview = useMemo(() => {
    if (!last || !cursorSnapped) return cursorSnapped;
    const n = Number(typed);
    if (typed && Number.isFinite(n) && n > 0) {
      const ang = (Math.atan2(cursorSnapped.z - last.z, cursorSnapped.x - last.x) * 180) / Math.PI;
      return pointAt(last, ang, n);
    }
    return cursorSnapped;
  }, [last, cursorSnapped, typed]);

  // prikaz se menja samo kad postavljena tačka izađe blizu ivice (nikad zbog kretanja kursora, da kursor ne „beži")
  useEffect(() => {
    if (mode !== 'draw' || !points.length) return;
    const m = 20 * px;
    const out = points.some((p) => p.x < vx + m || p.x > vx + view.w - m || p.z < vz + m || p.z > vz + vh - m);
    if (!out) return;
    const xs = points.map((p) => p.x); const zs = points.map((p) => p.z);
    const pad = 80 * px;
    // crtež više ne staje u prikaz: udaljavanje; inače samo pomeranje taman toliko da tačka bude unutra
    if (Math.max(...xs) - Math.min(...xs) > view.w - 2 * pad || Math.max(...zs) - Math.min(...zs) > vh - 2 * pad) {
      const f = fitView(points, size.w, size.h);
      setView({ ...f, w: Math.max(view.w, f.w) });
      return;
    }
    let dx = 0; let dz = 0;
    if (Math.min(...xs) < vx + pad) dx = Math.min(...xs) - (vx + pad);
    else if (Math.max(...xs) > vx + view.w - pad) dx = Math.max(...xs) - (vx + view.w - pad);
    if (Math.min(...zs) < vz + pad) dz = Math.min(...zs) - (vz + pad);
    else if (Math.max(...zs) > vz + vh - pad) dz = Math.max(...zs) - (vz + vh - pad);
    setView({ ...view, cx: view.cx + dx, cz: view.cz + dz });
  }, [points, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const toMm = (e: { clientX: number; clientY: number }): TracePoint | null => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return null;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const r = pt.matrixTransform(ctm.inverse());
    return { x: r.x, z: r.y };
  };

  const addPoint = (p: TracePoint) => {
    if (last && segmentLength(last, p) < 50) return;
    setPoints((ps) => [...ps, p]);
    setTyped('');
  };
  const undoPoint = () => { setPoints((ps) => ps.slice(0, -1)); setTyped(''); };
  const stopDrawing = () => {
    setTyped('');
    if (points.length >= 2) { setMode('edit'); setView(fitView(points, size.w, size.h)); }
  };
  const resume = () => { setMode('draw'); setCursor(null); };
  const create = () => { if (points.length >= 2) onFinish(points); };

  const onClick = (e: React.MouseEvent) => {
    if (mode !== 'draw') return;
    const raw = toMm(e);
    if (raw) addPoint(snapTracePoint(last, raw, e.shiftKey));
  };

  const onMove = (e: React.PointerEvent) => {
    const raw = toMm(e);
    if (!raw) return;
    if (mode === 'edit' && dragIdx !== null) {
      const snapped = { x: Math.round(raw.x / 10) * 10, z: Math.round(raw.z / 10) * 10 };
      setPoints((ps) => ps.map((p, k) => (k === dragIdx ? snapped : p)));
    } else setCursor(raw);
  };
  useEffect(() => {
    if (dragIdx === null) return;
    const up = () => setDragIdx(null);
    window.addEventListener('pointerup', up);
    return () => window.removeEventListener('pointerup', up);
  }, [dragIdx]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      if (e.key === 'Escape') { onCancel(); return; }
      if (mode !== 'draw') return;
      if (/^[0-9]$/.test(e.key)) { setTyped((s) => (s + e.key).slice(0, 6)); e.preventDefault(); return; }
      if (e.key === 'Backspace') { if (typed) setTyped((s) => s.slice(0, -1)); else undoPoint(); e.preventDefault(); return; }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (typed && preview && last) addPoint(preview); else stopDrawing();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const chip = (cx: number, cz: number, text: string, key: string, rot = 0, color = '#1a1a1a') => {
    const wpx = text.length * 7.4 + 12;
    return (
      <g key={key} transform={`translate(${cx} ${cz}) rotate(${rot})`} pointerEvents="none">
        <rect x={(-wpx / 2) * px} y={-9 * px} width={wpx * px} height={18 * px} rx={4 * px} fill={color} />
        <text textAnchor="middle" dominantBaseline="central" fontSize={12 * px} fontWeight="700" fill="#fff">{text}</text>
      </g>
    );
  };

  const dimOf = (a: TracePoint, b: TracePoint, key: string, dashed = false, text?: string) => {
    const len = segmentLength(a, b);
    if (len < 1) return null;
    const ux = (b.x - a.x) / len; const uz = (b.z - a.z) / len;
    const off = 30 * px;
    const nx = -uz * off; const nz = ux * off;
    const a2 = { x: a.x + nx, z: a.z + nz }; const b2 = { x: b.x + nx, z: b.z + nz };
    let rot = (Math.atan2(uz, ux) * 180) / Math.PI;
    if (rot > 90 || rot <= -90) rot += 180;
    const sw = 1.2 * px;
    return (
      <g key={key} pointerEvents="none">
        <line x1={a.x} y1={a.z} x2={a2.x} y2={a2.z} stroke="#1a1a1a" strokeWidth={sw} />
        <line x1={b.x} y1={b.z} x2={b2.x} y2={b2.z} stroke="#1a1a1a" strokeWidth={sw} />
        <line x1={a2.x} y1={a2.z} x2={b2.x} y2={b2.z} stroke="#1a1a1a" strokeWidth={sw} strokeDasharray={dashed ? `${6 * px} ${4 * px}` : undefined} />
        {chip((a2.x + b2.x) / 2, (a2.z + b2.z) / 2, text ?? fmtMm(len), `${key}-c`, rot)}
      </g>
    );
  };

  // mreža: korak se bira prema razmeri
  const step = [1000, 2000, 5000, 10000].find((s) => s / px >= 28) ?? 10000;
  const grid: React.ReactNode[] = [];
  for (let gx = Math.ceil(vx / step) * step; gx < vx + view.w; gx += step) grid.push(<line key={`gx${gx}`} x1={gx} y1={vz} x2={gx} y2={vz + vh} stroke={gx % (step * 5) === 0 ? '#c7ccd4' : '#e6e9ee'} strokeWidth={px} />);
  for (let gz = Math.ceil(vz / step) * step; gz < vz + vh; gz += step) grid.push(<line key={`gz${gz}`} x1={vx} y1={gz} x2={vx + view.w} y2={gz} stroke={gz % (step * 5) === 0 ? '#c7ccd4' : '#e6e9ee'} strokeWidth={px} />);

  const total = points.slice(1).reduce((s, p, i) => s + segmentLength(points[i], p), 0);
  const liveLen = last && preview ? segmentLength(last, preview) : 0;
  const liveTurn = points.length >= 2 && preview && liveLen > 1 ? turnBetween(points[points.length - 2], last!, preview) : null;
  const rods = FENCE_MODELS[modelId].style === 'rods';

  return (
    <div className="flex flex-col h-full min-h-0" data-testid="trace-canvas" data-mode={mode}>
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-[#fff7e0] border-b border-[#ffe29a] text-[13px]">
        <b>{mode === 'draw' ? 'Crtanje ograde' : 'Izmena nacrtane ograde'}</b>
        <label className="flex items-center gap-1.5">Model:
          <select className="input !w-auto !py-1" aria-label="Model ograde za crtanje" data-testid="trace-model" value={modelId} onChange={(e) => onModel(e.target.value as FenceModelId)}>
            {FENCE_MODEL_LIST.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </label>
        <span className="tabular-nums text-slate-700" data-testid="trace-total">Ukupno {fmtMm(total)}</span>
        <span className="ml-auto flex flex-wrap items-center gap-1.5">
          {mode === 'draw' ? (
            <>
              <button className="btn btn-sm" onClick={undoPoint} disabled={!points.length} data-testid="trace-undo"><Undo2 size={14} />Vrati tačku</button>
              <button className="btn btn-sm btn-dark" onClick={stopDrawing} disabled={points.length < 2} data-testid="trace-stop"><Check size={14} />Završi crtanje</button>
            </>
          ) : (
            <button className="btn btn-sm" onClick={resume} data-testid="trace-resume"><Pencil size={14} />Nastavi crtanje</button>
          )}
          <button className="btn btn-sm btn-primary" onClick={create} disabled={points.length < 2} data-testid="trace-finish"><Check size={14} />Napravi ogradu</button>
          <button className="btn btn-sm" onClick={onCancel} data-testid="trace-cancel"><X size={14} />Otkaži</button>
        </span>
        {mode === 'draw' && <span className="basis-full text-slate-600">Klik = nova tačka · kucajte dužinu (mm) + Enter · Shift = slobodan ugao · Backspace = vrati tačku · Enter ili dvoklik = završi crtanje (mere možete da menjate pre pravljenja ograde)</span>}
        {mode === 'edit' && <span className="basis-full text-slate-600">Menjajte mere i uglove u tabeli ili povucite tačku mišem. Ograda se pravi tek kad kliknete „Napravi ogradu".</span>}
      </div>
      <div className="flex flex-1 min-h-0">
        <div ref={wrapRef} className="flex-1 min-w-0 relative bg-white overflow-hidden">
          <svg
            ref={svgRef}
            viewBox={`${vx} ${vz} ${view.w} ${vh}`}
            width={size.w}
            height={size.h}
            className="absolute inset-0 touch-none-important"
            style={{ cursor: mode === 'draw' ? 'crosshair' : 'default' }}
            data-testid="trace-svg"
            onPointerMove={onMove}
            onPointerDown={(e) => { if (e.pointerType !== 'mouse' && mode === 'draw') setCursor(toMm(e)); }}
            onClick={onClick}
            onDoubleClick={() => { if (mode === 'draw') stopDrawing(); }}
          >
            <rect x={vx} y={vz} width={view.w} height={vh} fill="#fff" />
            {grid}
            <text x={vx + 10 * px} y={vz + vh - 8 * px} fontSize={11 * px} fill="#64748b" pointerEvents="none">Mreža: {step / 1000} m · prikaz {fmtNum(view.w / 1000, 1)} m</text>
            {points.slice(1).map((p, i) => (
              <line key={`seg-${i}`} x1={points[i].x} y1={points[i].z} x2={p.x} y2={p.z} stroke={AMBER} strokeWidth={6 * px} strokeLinecap="round" pointerEvents="none" />
            ))}
            {points.slice(1).map((p, i) => dimOf(points[i], p, `dim-${i}`))}
            {mode === 'edit' && points.slice(1, -1).map((p, i) => chip(p.x + 26 * px, p.z - 24 * px, `${Math.abs(turnBetween(points[i], p, points[i + 2]))}°`, `ang-${i}`, 0, '#7a0d14'))}
            {mode === 'draw' && last && preview && liveLen > 1 && (
              <g pointerEvents="none">
                <line x1={last.x} y1={last.z} x2={preview.x} y2={preview.z} stroke={RED} strokeWidth={4 * px} strokeDasharray={`${12 * px} ${7 * px}`} strokeLinecap="round" />
                {dimOf(last, preview, 'dim-live', true, typed ? `${typed} mm` : undefined)}
                {liveTurn !== null && Math.abs(liveTurn) >= 1 && chip(preview.x + 26 * px, preview.z - 24 * px, `${Math.abs(liveTurn)}°`, 'turn', 0, RED)}
              </g>
            )}
            {points.map((p, i) => (
              <g
                key={`pt-${i}`}
                data-testid={`trace-point-${i}`}
                pointerEvents={mode === 'edit' ? 'all' : 'none'}
                style={{ cursor: mode === 'edit' ? 'grab' : undefined }}
                onPointerDown={(e) => { if (mode === 'edit') { e.stopPropagation(); setDragIdx(i); } }}
              >
                <circle cx={p.x} cy={p.z} r={16 * px} fill="transparent" />
                <circle cx={p.x} cy={p.z} r={9 * px} fill="#fff" stroke={AMBER} strokeWidth={4 * px} />
                <circle cx={p.x} cy={p.z} r={3 * px} fill="#1a1a1a" />
              </g>
            ))}
            {preview && <circle cx={preview.x} cy={preview.z} r={7 * px} fill="none" stroke={RED} strokeWidth={2 * px} pointerEvents="none" />}
          </svg>
          {points.length === 0 && mode === 'draw' && (
            <div className="absolute inset-0 grid place-items-center pointer-events-none text-slate-500 text-sm">Kliknite da postavite početnu tačku</div>
          )}
        </div>
        {mode === 'edit' && (
          <aside className="w-[270px] shrink-0 border-l border-line overflow-auto scroll-thin p-2.5 text-[13px]" data-testid="trace-edit-panel">
            <div className="font-semibold mb-1.5">Stranice</div>
            <ul className="grid gap-1.5">
              {points.slice(1).map((p, i) => (
                <li key={i} className="flex items-center gap-1.5" data-testid={`trace-side-${i}`}>
                  <span className="w-5 text-muted tabular-nums">{i + 1}.</span>
                  <input
                    className="input !py-1 tabular-nums" type="number" min={100} step={10} aria-label={`Dužina stranice ${i + 1} (mm)`} data-testid={`trace-len-${i}`}
                    value={Math.round(segmentLength(points[i], p))}
                    onChange={(e) => { const v = Number(e.target.value); if (v > 0) setPoints((ps) => setSegmentLength(ps, i, v)); }}
                  />
                  <span className="text-muted">mm</span>
                </li>
              ))}
            </ul>
            {points.length > 2 && (
              <>
                <div className="font-semibold mt-3 mb-1.5">Uglovi skretanja</div>
                <ul className="grid gap-1.5">
                  {points.slice(1, -1).map((p, i) => (
                    <li key={i} className="flex items-center gap-1.5">
                      <span className="w-5 text-muted tabular-nums">{i + 1}.</span>
                      <input
                        className="input !py-1 tabular-nums" type="number" step={5} min={-180} max={180} aria-label={`Ugao skretanja ${i + 1} (°)`} data-testid={`trace-turn-${i}`}
                        value={turnBetween(points[i], p, points[i + 2])}
                        onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v >= -180 && v <= 180) setPoints((ps) => setTurnAt(ps, i + 1, v)); }}
                      />
                      <span className="text-muted">°</span>
                    </li>
                  ))}
                </ul>
                <p className="text-[11.5px] text-muted mt-1.5">+ skreće udesno, − ulevo.</p>
              </>
            )}
            <button className="btn btn-sm btn-danger mt-3 w-full" onClick={() => { setPoints([]); setMode('draw'); setView(START_VIEW); }} data-testid="trace-clear"><Trash2 size={14} />Obriši crtež</button>
          </aside>
        )}
      </div>
      <div className="px-3 py-1.5 text-xs text-muted border-t border-line">
        {FENCE_MODELS[modelId].name}: polja do 2000 mm, stubovi na svakoj podeli; na skretanjima {rods ? 'nastaje ugaoni spoj (cev se savija između stubova)' : 'stub dobija ugao skretanja'}.
      </div>
    </div>
  );
}
