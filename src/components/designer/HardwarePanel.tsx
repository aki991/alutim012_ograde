import { Link2 } from 'lucide-react';
import type { CustomModel, CustomPart, HwKind } from '../../domain/models/custom';
import {
  compatibleHardware, defaultHardware, HW_KINDS_BY_ROLE, HW_LABELS, hardwareRoleOf, removeParts, rodsThroughPost, setHwPick,
} from '../../domain/models/terraceHardware';
import type { Material } from '../../domain/models/types';

/**
 * Okov uz izabran stub, rukohvat ili prečku (ograde za terase): kvačica uključuje okov koji aplikacija sama postavlja na pravo mesto
 * (X, Y i dubinu računa ona), a izbor ispod kvačice menja šifru. Uz stub se prstenovi uključuju za sve prečke koje ga prolaze.
 */
export function HardwarePanel({ model, part, materials, onChange }: {
  model: CustomModel; part: CustomPart; materials: Material[]; onChange: (fn: (m: CustomModel) => CustomModel) => void;
}) {
  if (model.kind !== 'terrace') return null;
  const byId = new Map(materials.map((m) => [m.id, m]));

  // okov koji je aplikacija sama postavila: bez ručnog pomeranja, može samo da se ukloni
  if (part.hw) {
    return (
      <div className="mt-2 rounded-lg border border-primary/40 bg-primary-50/40 p-2" data-testid="hw-auto-box">
        <div className="text-[12.5px] font-semibold flex items-center gap-1.5"><Link2 size={14} />{HW_LABELS[part.hw.kind]}</div>
        <p className="text-[11.5px] text-muted mt-1">Ovaj okov se postavlja sam na pravo mesto i prati deo na koji naleže. Položaj se ne menja ručno.</p>
        <button className="btn btn-sm w-full mt-2" data-testid="hw-remove-kind" onClick={() => onChange((m) => removeParts(m, new Set([part.id])))}>Ukloni ovu vrstu okova</button>
      </div>
    );
  }

  const role = hardwareRoleOf(part, materials);
  if (!role) return null;
  const rods = role === 'post' ? rodsThroughPost(model, part, materials) : [];

  const row = (kind: HwKind) => {
    if (kind === 'holder' && role === 'post') {
      // prsten prečke uz stub: uključuje se za sve prečke koje prolaze ispred stuba
      const withHolder = rods.filter((r) => r.hwPick?.holder).length;
      const on = rods.length > 0 && withHolder === rods.length;
      const nothing = rods.length === 0;
      return (
        <label key={kind} className={`flex items-start gap-2 py-1 text-[13px] ${nothing ? 'opacity-60' : ''}`}>
          <input type="checkbox" className="mt-0.5" data-testid="hw-holder" disabled={nothing} checked={on}
            onChange={(e) => onChange((m) => {
              let next = m;
              for (const r of rods) next = setHwPick(next, r.id, 'holder', e.target.checked ? (defaultHardware('holder', r, next, materials)?.id ?? null) : null);
              return next;
            })} />
          <span className="flex-1">{HW_LABELS.holder}
            <span className="block text-[11.5px] text-muted">{nothing ? 'Nijedna prečka ne prolazi ispred ovog stuba.' : `${withHolder} od ${rods.length} prečki`}</span></span>
        </label>
      );
    }
    const options = compatibleHardware(kind, part, model, materials);
    const picked = part.hwPick?.[kind];
    const none = options.length === 0 && !picked;
    return (
      <div key={kind} className={`py-1 text-[13px] ${none ? 'opacity-60' : ''}`}>
        <label className="flex items-center gap-2">
          <input type="checkbox" data-testid={`hw-${kind}`} disabled={none} checked={!!picked}
            onChange={(e) => onChange((m) => setHwPick(m, part.id, kind, e.target.checked ? (defaultHardware(kind, part, m, materials)?.id ?? null) : null))} />
          <span className="flex-1">{HW_LABELS[kind]}</span>
        </label>
        {none && <span className="block text-[11.5px] text-muted pl-6">Nema odgovarajućeg okova u cenovniku za ovu meru.</span>}
        {picked && (
          <select className="input !py-1 !text-[12px] mt-1 ml-6 !w-[calc(100%-1.5rem)]" aria-label={HW_LABELS[kind]} data-testid={`hw-${kind}-material`} value={picked}
            onChange={(e) => onChange((m) => setHwPick(m, part.id, kind, e.target.value))}>
            {[...(options.some((o) => o.id === picked) || !byId.get(picked) ? [] : [byId.get(picked)!]), ...options].map((o) => <option key={o.id} value={o.id}>{o.sku} — {o.name}</option>)}
          </select>
        )}
      </div>
    );
  };

  return (
    <div className="mt-2 rounded-lg border border-line p-2" data-testid="hw-box">
      <div className="text-[12.5px] font-semibold mb-0.5 flex items-center gap-1.5"><Link2 size={14} />Okov (postavlja se sam)</div>
      {HW_KINDS_BY_ROLE[role].map(row)}
      <p className="text-[11.5px] text-muted mt-1">Kvačicom se okov pojavljuje na crtežu na pravom mestu i ulazi u spisak materijala (sa zavrtnjima). {role === 'rod' ? 'Prečke se same postavljaju ispred stubova.' : role === 'post' ? 'Uz vezu se rukohvat sam postavlja na vezu.' : ''}</p>
    </div>
  );
}
