import { ImageUp } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { DRAWN_KIND_LABELS, drawnName } from '../../domain/models/drawnSection';
import { estimateWall, otsu, scaleTraced, traceBitmap, type TraceMode } from '../../domain/models/traceSection';
import type { DrawnKind, DrawnSection } from '../../domain/models/types';
import { NumInput } from '../forms/NumInput';
import { Modal } from '../ui/Modal';

const MAX_SIDE = 360;
const fmt = (n: number): string => String(Math.round(n * 100) / 100).replace('.', ',');

/**
 * Presek profila sa slike: korisnik bira sliku preseka (siluet ili crtež linijama), po potrebi podesi prag i način, zada spoljnu širinu
 * i visinu u mm, a aplikacija iz slike pravi poligone preseka. Isti presek posle koriste 2D i 3D prikaz, krojna lista i cena.
 */
export function TraceSectionModal({ onSave, onClose }: { onSave: (d: DrawnSection) => void; onClose: () => void }) {
  const [gray, setGray] = useState<{ w: number; h: number; data: Uint8Array } | null>(null);
  const [fileName, setFileName] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [thr, setThr] = useState(128);
  const [invert, setInvert] = useState(false);
  const [mode, setMode] = useState<TraceMode>('filled');
  const [kind, setKind] = useState<DrawnKind>('ostalo');
  const [wMm, setWMm] = useState(60);
  const [hMm, setHMm] = useState<number | null>(null);
  const urlRef = useRef<string | null>(null);
  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);

  const load = (file: File) => {
    setErr(null);
    if (!file.type.startsWith('image/')) { setErr('Izaberite sliku (PNG, JPG, WebP ili SVG).'); return; }
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    const url = URL.createObjectURL(file); urlRef.current = url;
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth || MAX_SIDE, img.naturalHeight || MAX_SIDE));
      const w = Math.max(8, Math.round((img.naturalWidth || MAX_SIDE) * k)); const h = Math.max(8, Math.round((img.naturalHeight || MAX_SIDE) * k));
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const g = c.getContext('2d', { willReadFrequently: true });
      if (!g) { setErr('Slika ne može da se obradi u ovom pregledaču.'); return; }
      g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(img, 0, 0, w, h); // providna pozadina postaje bela
      const px = g.getImageData(0, 0, w, h).data;
      const data = new Uint8Array(w * h);
      for (let i = 0; i < w * h; i++) data[i] = Math.round(0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]);
      setGray({ w, h, data }); setThr(Math.min(240, Math.max(15, otsu(data)))); setFileName(file.name); setHMm(null);
    };
    img.onerror = () => setErr('Slika ne može da se učita.');
    img.src = url;
  };

  const traced = useMemo(() => {
    if (!gray) return null;
    const dark = new Uint8Array(gray.w * gray.h);
    for (let i = 0; i < dark.length; i++) dark[i] = (gray.data[i] < thr) !== invert ? 1 : 0;
    return traceBitmap({ w: gray.w, h: gray.h, dark }, mode);
  }, [gray, thr, invert, mode]);

  const aspect = traced ? traced.hPx / traced.wPx : 1;
  const hEff = hMm ?? Math.round(wMm * aspect * 100) / 100;
  const polys = useMemo(() => (traced && wMm > 0 && hEff > 0 ? scaleTraced(traced, wMm, hEff) : []), [traced, wMm, hEff]);
  const path = polys.map((p) => [p.outline, ...p.holes].map((r) => `M${r.map(([x, y]) => `${x} ${-y}`).join('L')}Z`).join('')).join('');
  const pad = Math.max(wMm, hEff) * 0.08;
  const valid = polys.length > 0 && wMm > 0 && hEff > 0;
  const wall = valid ? estimateWall(polys) : 0;

  const save = () => onSave({ kind, pts: [], wall: wall > 0 ? wall : 1, closed: true, polys });

  return (
    <Modal title="Presek iz slike" width={820} onClose={onClose}
      footer={<><span className="text-[12.5px] text-slate-600 mr-auto" data-testid="trace-size">{valid ? `Presek ${fmt(wMm)} × ${fmt(hEff)} mm, okvirna debljina zida ${fmt(wall)} mm` : 'Izaberite sliku preseka.'}</span>
        <button className="btn" onClick={onClose}>Otkaži</button>
        <button className="btn btn-primary" data-testid="trace-save" disabled={!valid} onClick={save}>Koristi ovaj presek</button></>}>
      <div className="grid gap-4 md:grid-cols-[320px_minmax(0,1fr)]">
        <div>
          <label className="btn w-full cursor-pointer justify-center mb-2" data-testid="trace-pick"><ImageUp size={16} />{gray ? 'Druga slika' : 'Izaberi sliku preseka'}
            <input type="file" accept="image/*" className="sr-only" data-testid="trace-file" onChange={(e) => { const f = e.target.files?.[0]; if (f) load(f); e.target.value = ''; }} />
          </label>
          {fileName && <p className="text-[12px] text-muted mb-2 truncate">{fileName}</p>}
          <svg viewBox={valid ? `${-pad} ${-hEff - pad} ${wMm + 2 * pad} ${hEff + 2 * pad}` : '0 0 10 10'} className="w-[300px] h-[300px] bg-white rounded-lg border border-line" data-testid="trace-preview" role="img" aria-label="Presek iz slike">
            {valid && <path d={path} fill="#475569" fillRule="evenodd" stroke="#0f172a" strokeWidth={Math.max(wMm, hEff) / 300} />}
          </svg>
        </div>
        <div className="text-[13px] grid content-start gap-2">
          <p className="text-[12.5px] text-slate-600">Slika poprečnog preseka profila: tamna površina na svetloj pozadini ili crtež samo linijama. Zadajte stvarnu širinu preseka; visina se računa po slici, a može da se promeni.</p>
          <label className="flex flex-col gap-1">Način
            <select className="input !py-1" data-testid="trace-mode" value={mode} onChange={(e) => setMode(e.target.value as TraceMode)}>
              <option value="filled">Puna slika (tamna površina je materijal)</option>
              <option value="outline">Crtež linijama (materijal je unutar linija)</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">Prag (tamno / svetlo): {thr}
            <input type="range" min={5} max={250} value={thr} data-testid="trace-threshold" onChange={(e) => setThr(Number(e.target.value))} disabled={!gray} />
          </label>
          <label className="flex items-center gap-2"><input type="checkbox" data-testid="trace-invert" checked={invert} onChange={(e) => setInvert(e.target.checked)} disabled={!gray} />Obrni (svetlo je materijal)</label>
          <div className="flex gap-2">
            <label className="flex flex-col gap-1 w-28">Širina (mm)<NumInput testId="trace-w" ariaLabel="Širina preseka" value={wMm} onCommit={(v) => { if (v && v > 0) setWMm(v); }} /></label>
            <label className="flex flex-col gap-1 w-28">Visina (mm)<NumInput testId="trace-h" ariaLabel="Visina preseka" value={hEff} onCommit={(v) => { if (v && v > 0) setHMm(v); }} /></label>
            {hMm !== null && <button className="btn btn-sm self-end" onClick={() => setHMm(null)}>Po slici</button>}
          </div>
          <label className="flex flex-col gap-1">Vrsta profila
            <select className="input !py-1" data-testid="trace-kind" value={kind} onChange={(e) => setKind(e.target.value as DrawnKind)}>
              {(Object.keys(DRAWN_KIND_LABELS) as DrawnKind[]).map((k) => <option key={k} value={k}>{DRAWN_KIND_LABELS[k]}</option>)}
            </select>
          </label>
          {gray && !traced && <p className="text-[12.5px] text-[#b42318]" role="alert">Na slici nije nađen presek. Pomerite prag, promenite način ili obrnite sliku.</p>}
          {err && <p className="text-[12.5px] text-[#b42318]" role="alert">{err}</p>}
          {valid && <p className="text-[11.5px] text-muted">Naziv materijala: {drawnName({ kind, pts: [], wall, closed: true, polys })}. Šum i sitne mrlje se zanemaruju.</p>}
        </div>
      </div>
    </Modal>
  );
}
