import { useMemo, useState } from 'react';
import type { CustomModel } from '../../domain/models/custom';
import { addSlope, plateMaterials, slopeInfo } from '../../domain/models/slope';
import type { Material } from '../../domain/models/types';
import { NumInput } from '../forms/NumInput';
import { Modal } from '../ui/Modal';
import { MaterialPicker } from './MaterialPicker';

const fmt = (n: number): string => String(n).replace('.', ',');

/**
 * Pad terena: ispuna ostaje pravougaona, a ispod nje ide lim sa kosom donjom ivicom. Bočne cevi idu do terena i donji kraj im je sečen
 * pod uglom pada, u ravni sa donjom ivicom lima (ispod lima nema ničega), kao na kapijama na kosom tlu.
 */
export function SlopeModal({ model, materials, onApply, onClose }: { model: CustomModel; materials: Material[]; onApply: (m: CustomModel) => void; onClose: () => void }) {
  const plates = useMemo(() => plateMaterials(materials), [materials]);
  const [drop, setDrop] = useState(150);
  const [low, setLow] = useState<'left' | 'right'>('left');
  const [minPlate, setMinPlate] = useState(80);
  const [plateId, setPlateId] = useState<string | null>(() => (plates.find((m) => /\blim/i.test(m.name)) ?? plates[0])?.id ?? null);
  const [err, setErr] = useState<string | null>(null);
  const info = slopeInfo(drop, model.widthMm);
  const plateName = plateId ? materials.find((m) => m.id === plateId)?.name : null;

  const apply = () => {
    const r = addSlope(model, materials, { dropMm: drop, low, minPlateMm: minPlate, plateId });
    if ('error' in r) { setErr(r.error); return; }
    onApply(r.model);
  };

  return (
    <Modal title="Dodaj pad terena" width={560} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Otkaži</button><button className="btn btn-primary" data-testid="slope-apply" onClick={apply}>Dodaj pad</button></>}>
      <p className="text-sm text-muted mb-3">Ispuna ostaje kakva jeste. Ispod nje ide lim sa kosom donjom ivicom, a bočne cevi se produžavaju do terena i donji kraj im se seče pod uglom pada, u ravni sa limom. Ispod lima nema ničega. Ugao reza se vidi u krojnoj listi.</p>
      <div className="grid grid-cols-2 gap-3 text-[13px] mb-3">
        <label className="flex flex-col gap-1">Pad terena na širini polja (mm)<NumInput testId="slope-drop" ariaLabel="Pad terena" value={drop} onCommit={(v) => { if (v !== null && v > 0) { setDrop(v); setErr(null); } }} /></label>
        <label className="flex flex-col gap-1">Niža strana
          <select className="input" data-testid="slope-low" value={low} onChange={(e) => setLow(e.target.value as 'left' | 'right')}>
            <option value="left">leva (gledano spreda)</option><option value="right">desna (gledano spreda)</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">Visina lima na višoj strani (mm)<NumInput testId="slope-min" ariaLabel="Visina lima na višoj strani" value={minPlate} onCommit={(v) => { if (v !== null && v >= 0) setMinPlate(v); }} /></label>
        <div className="flex flex-col gap-1 justify-end text-slate-600">Nagib: <b>{fmt(info.deg)}°</b> ({fmt(info.pct)} %), širina {fmt(Math.round(model.widthMm))} mm</div>
      </div>
      <div className="text-[13px] mb-1">Lim za popunu: <b data-testid="slope-plate-name">{plateName ?? 'bez lima'}</b>{plates.length === 0 ? ' — u cenovniku nema ploča (lim); dodajte ploču u Materijali i cene.' : ''}</div>
      <div className="flex gap-2 items-start">
        <div className="flex-1"><MaterialPicker materials={plates} placeholder="— promeni lim —" testId="slope-plate" ariaLabel="Lim za popunu" onPick={(id) => setPlateId(id)} /></div>
        {plateId && <button className="btn btn-sm" data-testid="slope-no-plate" onClick={() => setPlateId(null)}>Bez lima</button>}
      </div>
      {err && <p className="text-[12.5px] text-[#b42318] mt-3" role="alert">{err}</p>}
    </Modal>
  );
}
