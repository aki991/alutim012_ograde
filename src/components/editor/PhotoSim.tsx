import { Camera, Download, ImagePlus, Monitor, RotateCcw, Trash2 } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cssMatrix3d, drawImageToQuad, type Pt } from '../../domain/geometry/perspective';
import type { Project } from '../../domain/models/types';
import { downloadBlob, fenceOverlay, safeFilename } from '../../services/exports';
import { useAppStore } from '../../store/useAppStore';

const MAX_PHOTO_PX = 1800;

/** Učitana fotografija se smanjuje (najviše 1800 px) i čuva kao JPEG, da projekat ne bude prevelik. */
async function loadPhoto(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((ok, bad) => { img.onload = () => ok(); img.onerror = () => bad(new Error('Slika nije mogla da se učita.')); img.src = url; });
    const k = Math.min(1, MAX_PHOTO_PX / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * k);
    c.height = Math.round(img.naturalHeight * k);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Početni položaj: ograda na sredini slike, 60 % širine, donja ivica na 80 % visine. */
function defaultQuad(fenceAspect: number, photoAspect: number): Pt[] {
  const w = 0.6;
  const h = Math.min(0.6, (w * photoAspect) / fenceAspect);
  const x0 = (1 - w) / 2;
  const y1 = 0.8;
  return [[x0, y1 - h], [x0 + w, y1 - h], [x0 + w, y1], [x0, y1]];
}

const load = (src: string) => new Promise<HTMLImageElement>((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad(new Error('Slika nije mogla da se učita.')); i.src = src; });

/**
 * Simulacija na fotografiji: korisnik učita sliku dvorišta ili kuće, a ograda iz projekta se postavlja na nju.
 * Četiri kružića na uglovima pomeraju uglove ograde (perspektiva), a prevlačenje same ograde je pomera celu.
 */
export function PhotoSim({ project }: { project: Project }) {
  const sim = project.photoSim;
  const [overlay, setOverlay] = useState<{ url: string; aspect: number } | null>(null);
  const [quad, setQuad] = useState<Pt[] | null>(sim?.quad ?? null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const drag = useRef<{ kind: 'corner' | 'body'; index: number; start: Pt; quad: Pt[] } | null>(null);

  // ograda iz projekta (bez pozadine), osvežava se kad se projekat promeni
  const key = JSON.stringify([project.items, project.posts]);
  useEffect(() => {
    let alive = true;
    const t = window.setTimeout(() => { void fenceOverlay(project).then((o) => { if (alive) setOverlay(o); }).catch((e: Error) => { if (alive) setError(e.message); }); }, 120);
    return () => { alive = false; window.clearTimeout(t); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => { setQuad(sim?.quad ?? null); }, [sim?.quad]);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, [sim?.photo]);

  const save = (next: PhotoSim['quad'] | null, photo = sim?.photo) => {
    useAppStore.getState().mutate((p) => ({ ...p, photoSim: photo && next ? { photo, quad: next } : undefined, updatedAt: new Date().toISOString() }), 'photosim');
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      const photo = await loadPhoto(file);
      const img = await load(photo);
      const q = defaultQuad(overlay?.aspect ?? 3, img.naturalWidth / img.naturalHeight);
      setQuad(q);
      save(q, photo);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const toPx = (q: Pt[]): Pt[] => q.map(([x, y]) => [x * box.w, y * box.h]);
  const rel = (e: { clientX: number; clientY: number }): Pt => {
    const r = wrapRef.current!.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
  };
  const begin = (kind: 'corner' | 'body', index: number) => (e: React.PointerEvent) => {
    if (!quad) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    drag.current = { kind, index, start: rel(e), quad: quad.map((p) => [...p] as Pt) };
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const [x, y] = rel(e);
    const dx = x - d.start[0];
    const dy = y - d.start[1];
    const clamp = (v: number) => Math.max(-0.5, Math.min(1.5, v));
    setQuad(d.kind === 'body'
      ? d.quad.map(([qx, qy]) => [clamp(qx + dx), clamp(qy + dy)] as Pt)
      : d.quad.map((p, i) => (i === d.index ? [clamp(p[0] + dx), clamp(p[1] + dy)] as Pt : p)));
  };
  const end = () => {
    if (!drag.current) return;
    drag.current = null;
    if (quad) save(quad);
  };

  const exportImage = async () => {
    if (!sim || !quad || !overlay) return;
    setBusy(true);
    try {
      const [photo, fence] = await Promise.all([load(sim.photo), load(overlay.url)]);
      const c = document.createElement('canvas');
      c.width = photo.naturalWidth;
      c.height = photo.naturalHeight;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(photo, 0, 0);
      drawImageToQuad(ctx, fence, fence.naturalWidth, fence.naturalHeight, quad.map(([x, y]) => [x * c.width, y * c.height] as Pt));
      const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, 'image/jpeg', 0.9));
      if (blob) downloadBlob(blob, `${safeFilename(project.name)}_simulacija.jpg`);
    } catch (e) {
      setError(`Slika nije sačuvana: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const inputs = (
    <>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" data-testid="sim-file" onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ''; }} />
      <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ''; }} />
    </>
  );

  if (!sim) {
    return (
      <div className="h-full grid place-items-center p-6 bg-slate-50" data-testid="sim-empty">
        {inputs}
        <div className="text-center">
          <h3 className="text-lg font-semibold mb-4">Simulacija na fotografiji</h3>
          <div className="flex flex-wrap justify-center gap-4">
            <button className="w-[180px] rounded-xl border border-line bg-white p-5 hover:border-primary hover:bg-[#fdf0f0]" onClick={() => fileRef.current?.click()} data-testid="sim-upload">
              <Monitor size={40} className="mx-auto text-primary mb-2" />
              <div className="text-[11px] text-muted uppercase tracking-wide">Učitaj sa</div>
              <div className="font-semibold">računara</div>
            </button>
            <button className="w-[180px] rounded-xl border border-line bg-white p-5 hover:border-primary hover:bg-[#fdf0f0]" onClick={() => camRef.current?.click()} data-testid="sim-camera">
              <Camera size={40} className="mx-auto text-primary mb-2" />
              <div className="text-[11px] text-muted uppercase tracking-wide">Fotografiši</div>
              <div className="font-semibold">telefonom</div>
            </button>
          </div>
          {error && <p className="text-sm text-[#b42318] mt-3" role="alert">{error}</p>}
        </div>
      </div>
    );
  }

  const pq = quad && box.w ? toPx(quad) : null;
  const ow = 1000;
  const oh = overlay ? ow / overlay.aspect : 0;

  return (
    <div className="h-full flex flex-col" data-testid="sim-view">
      {inputs}
      <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 border-b border-line">
        <button className="btn btn-sm" onClick={() => fileRef.current?.click()}><ImagePlus size={14} />Zameni sliku</button>
        <button className="btn btn-sm" data-testid="sim-reset" onClick={() => { const q = defaultQuad(overlay?.aspect ?? 3, box.w / Math.max(1, box.h)); setQuad(q); save(q); }}><RotateCcw size={14} />Vrati položaj</button>
        <button className="btn btn-sm btn-danger" data-testid="sim-remove" onClick={() => save(null)}><Trash2 size={14} />Ukloni sliku</button>
        <button className="btn btn-sm btn-primary ml-auto" data-testid="sim-download" disabled={busy || !overlay} onClick={() => void exportImage()}><Download size={14} />Preuzmi sliku</button>
      </div>
      {error && <p className="text-sm text-[#b42318] px-3 pt-2" role="alert">{error}</p>}
      <div className="flex-1 min-h-0 grid place-items-center bg-[#1a1a1a] p-2 overflow-hidden">
        <div ref={wrapRef} className="relative touch-none-important select-none" style={{ maxWidth: '100%', maxHeight: '100%' }} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
          <img src={sim.photo} alt="Fotografija dvorišta" className="block max-w-full max-h-[calc(clamp(420px,62vh,720px)-70px)] object-contain" draggable={false} data-testid="sim-photo" onLoad={() => wrapRef.current && setBox({ w: wrapRef.current.clientWidth, h: wrapRef.current.clientHeight })} />
          {overlay && pq && (
            <img
              src={overlay.url} alt="" draggable={false} data-testid="sim-fence"
              className="absolute left-0 top-0 max-w-none cursor-move"
              style={{ width: ow, height: oh, transformOrigin: '0 0', transform: cssMatrix3d(ow, oh, pq) }}
              onPointerDown={begin('body', -1)}
            />
          )}
          {pq?.map(([x, y], i) => (
            <span
              key={i} data-testid={`sim-handle-${i}`} role="slider" aria-label={['Gornji levi ugao', 'Gornji desni ugao', 'Donji desni ugao', 'Donji levi ugao'][i]}
              className="absolute w-9 h-9 -ml-[18px] -mt-[18px] rounded-full border-[3px] border-white/90 bg-white/25 shadow-[0_0_0_1px_rgba(0,0,0,.35)] backdrop-blur-[1px] cursor-grab active:cursor-grabbing hover:bg-[#d71920]/50"
              style={{ left: x, top: y }}
              onPointerDown={begin('corner', i)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

type PhotoSim = NonNullable<Project['photoSim']>;
