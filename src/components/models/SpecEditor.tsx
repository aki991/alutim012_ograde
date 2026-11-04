import { Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { FENCE_MODELS } from '../../domain/models/catalog';
import { BOM_GROUPS, checkFormula, defaultSpec, evaluateSpec, hasCustomSpec, SPEC_VARIABLES, specVars, type SpecPart } from '../../domain/models/spec';
import type { FenceModelId } from '../../domain/models/types';
import { useAppStore } from '../../store/useAppStore';
import { fmtNum } from '../../utils/units';
import { Modal } from '../ui/Modal';

let counter = 0;
const newId = () => `sp_new_${Date.now().toString(36)}_${++counter}`;

/** Uređivanje specifikacije modela: dodavanje i brisanje elemenata, formule količine i dužine reza. */
export function SpecEditor({ modelId, onClose }: { modelId: FenceModelId; onClose: () => void }) {
  const def = FENCE_MODELS[modelId];
  const materials = useAppStore((s) => s.materials);
  const settings = useAppStore((s) => s.settings);
  const saved = settings.modelSpecs?.[modelId];
  const [parts, setParts] = useState<SpecPart[]>(() => (saved ?? defaultSpec(modelId)).map((p) => ({ ...p })));
  const [sample, setSample] = useState({ w: 2000, h: 1600 });
  const custom = hasCustomSpec(modelId, settings.modelSpecs);
  const dedicated = modelId === 'rail_black' || modelId === 'louver_light' || modelId === 'rail_inox';

  const vars = useMemo(
    () => specVars({ modelId, widthMm: sample.w, heightMm: sample.h, axisMm: sample.w + 100, params: def.defaults }),
    [modelId, sample, def.defaults],
  );
  const evaluated = useMemo(() => evaluateSpec(parts, vars), [parts, vars]);
  const byId = new Map(evaluated.map((e) => [e.part.id, e]));
  const matName = (id: string) => materials.find((m) => m.id === id);
  const errors = parts.some((p) => p.enabled && (checkFormula(p.qty, vars) !== null || checkFormula(p.lengthMm, vars) !== null || p.qty.trim() === ''));

  const patch = (id: string, change: Partial<SpecPart>) => setParts((ps) => ps.map((p) => (p.id === id ? { ...p, ...change } : p)));
  const add = () => setParts((ps) => [...ps, { id: newId(), name: 'Novi element', materialId: materials[0]?.id ?? '', group: 'Profili ispune', qty: '1', enabled: true }]);
  const total = evaluated.reduce((s, e) => {
    const m = matName(e.part.materialId);
    return s + (m ? e.materialQty * (1 + (m.unit === 'm' || m.unit === 'm2' ? m.wastePercent : 0) / 100) * m.unitPrice : 0);
  }, 0);

  const save = () => {
    useAppStore.getState().updateSettings({ modelSpecs: { ...settings.modelSpecs, [modelId]: parts.map((p) => ({ ...p, lengthMm: p.lengthMm?.trim() ? p.lengthMm : undefined })) } });
    onClose();
  };
  const reset = () => {
    const next = { ...settings.modelSpecs };
    delete next[modelId];
    useAppStore.getState().updateSettings({ modelSpecs: next });
    onClose();
  };

  return (
    <Modal
      title={`Specifikacija — ${def.name}`}
      width={1180}
      onClose={onClose}
      footer={
        <div className="flex flex-wrap gap-2 justify-between w-full">
          <button className="btn" data-testid="spec-reset" onClick={reset} disabled={!custom}><RotateCcw size={15} />Vrati podrazumevanu</button>
          <div className="flex gap-2">
            <button className="btn" onClick={onClose}>Otkaži</button>
            <button className="btn btn-primary" data-testid="spec-save" disabled={errors || parts.length === 0} onClick={save}>Sačuvaj specifikaciju</button>
          </div>
        </div>
      }
    >
      <div data-testid="spec-editor">
        <p className="text-[13px] text-slate-600 mb-2">
          Elementi se računaju za <b>jedno polje</b> ove ograde (i za kapiju sa ovom ispunom) i ulaze u krojnu listu i cenu. Količina i dužina reza su formule; ako element ima dužinu reza, materijal se računa u metrima (količina × dužina).
        </p>
        {dedicated && (
          <p className="text-[12.5px] rounded-md bg-[#fffaeb] text-[#93370d] border border-[#fedf89] px-3 py-1.5 mb-2" data-testid="spec-dedicated-note">
            {custom ? 'Izmenjena specifikacija zamenjuje detaljnu sastavnicu ovog modela (neprekinute cevi u nizu, ugaoni spojevi, stubovi iz sastavnice).' : 'Dok se specifikacija ne sačuva, za ovaj model važi detaljna sastavnica (neprekinute cevi u nizu, ugaoni spojevi, stubovi). Čuvanjem prelazite na obračun po polju sa elementima ispod; stubovi tada ostaju obični stubovi projekta.'}
          </p>
        )}
        <div className="flex flex-wrap items-end gap-3 mb-3 text-sm">
          <label className="grid gap-0.5"><span className="label">Primer polja: svetli otvor W (mm)</span><input className="input w-36" type="number" data-testid="spec-w" value={sample.w} onChange={(e) => setSample((s) => ({ ...s, w: Math.max(100, Number(e.target.value) || 0) }))} /></label>
          <label className="grid gap-0.5"><span className="label">Visina H (mm)</span><input className="input w-32" type="number" data-testid="spec-h" value={sample.h} onChange={(e) => setSample((s) => ({ ...s, h: Math.max(100, Number(e.target.value) || 0) }))} /></label>
          <div className="text-xs text-muted pb-2">N = {vars.N}, R = {vars.R}, K = {vars.K} (iz podrazumevanih mera modela)</div>
        </div>
        <details className="mb-3 text-[12.5px]">
          <summary className="cursor-pointer text-primary font-medium">Promenljive u formulama</summary>
          <ul className="grid sm:grid-cols-2 gap-x-6 mt-1">{SPEC_VARIABLES.map((v) => <li key={v.name}><code className="font-semibold">{v.name}</code> — {v.label}</li>)}</ul>
          <p className="text-muted mt-1">Dozvoljeno: + − × / zagrade i funkcije ceil, floor, round, min, max, abs (npr. <code>N*2+4</code>, <code>W-2*2-2</code>, <code>ceil(W/500)</code>).</p>
        </details>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm" data-testid="spec-table">
            <thead><tr><th className="th w-8"></th><th className="th min-w-[210px]">Element</th><th className="th min-w-[250px]">Materijal</th><th className="th min-w-[150px]">Grupa</th><th className="th">Količina po polju</th><th className="th">Dužina reza (mm)</th><th className="th text-right">Rezultat (primer)</th><th className="th w-8"></th></tr></thead>
            <tbody>
              {parts.map((p, i) => {
                const ev = byId.get(p.id);
                const qErr = p.enabled ? (p.qty.trim() === '' ? 'Unesite formulu' : checkFormula(p.qty, vars)) : null;
                const lErr = p.enabled ? checkFormula(p.lengthMm, vars) : null;
                const mat = matName(p.materialId);
                return (
                  <tr key={p.id} className={p.enabled ? '' : 'opacity-50'} data-testid={`spec-row-${i}`}>
                    <td className="td"><input type="checkbox" aria-label="Uključen u obračun" checked={p.enabled} onChange={(e) => patch(p.id, { enabled: e.target.checked })} /></td>
                    <td className="td"><input className="input" aria-label="Naziv elementa" data-testid={`spec-name-${i}`} value={p.name} onChange={(e) => patch(p.id, { name: e.target.value })} /></td>
                    <td className="td">
                      <select className="input" aria-label="Materijal" data-testid={`spec-material-${i}`} value={p.materialId} onChange={(e) => patch(p.id, { materialId: e.target.value })}>
                        {!mat && <option value={p.materialId}>{p.materialId} (nepoznat)</option>}
                        {materials.map((m) => <option key={m.id} value={m.id}>{m.name} [{m.unit}]</option>)}
                      </select>
                    </td>
                    <td className="td">
                      <select className="input" aria-label="Grupa" value={p.group} onChange={(e) => patch(p.id, { group: e.target.value as SpecPart['group'] })}>
                        {BOM_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
                      </select>
                    </td>
                    <td className="td">
                      <input className={`input font-mono ${qErr ? 'border-[#b42318]' : ''}`} aria-label="Formula količine" data-testid={`spec-qty-${i}`} value={p.qty} onChange={(e) => patch(p.id, { qty: e.target.value })} />
                      {qErr && <div className="text-[11px] text-[#b42318]" role="alert">{qErr}</div>}
                    </td>
                    <td className="td">
                      <input className={`input font-mono ${lErr ? 'border-[#b42318]' : ''}`} aria-label="Formula dužine reza" placeholder="bez dužine" data-testid={`spec-len-${i}`} value={p.lengthMm ?? ''} onChange={(e) => patch(p.id, { lengthMm: e.target.value })} />
                      {lErr && <div className="text-[11px] text-[#b42318]" role="alert">{lErr}</div>}
                    </td>
                    <td className="td text-right tabular-nums text-[13px] whitespace-nowrap" data-testid={`spec-result-${i}`}>
                      {ev && !ev.error ? <>{fmtNum(ev.qty, ev.qty % 1 ? 2 : 0)} {ev.lengthMm !== null ? `× ${fmtNum(ev.lengthMm, 0)} mm` : mat?.unit ?? ''}</> : '—'}
                    </td>
                    <td className="td"><button className="btn btn-sm btn-danger" aria-label="Obriši element" data-testid={`spec-del-${i}`} onClick={() => setParts((ps) => ps.filter((x) => x.id !== p.id))}><Trash2 size={14} /></button></td>
                  </tr>
                );
              })}
              {parts.length === 0 && <tr><td className="td text-muted" colSpan={8}>Specifikacija je prazna: ovaj model neće imati materijal u obračunu.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 mt-3">
          <button className="btn btn-sm" data-testid="spec-add" onClick={add}><Plus size={14} />Dodaj element</button>
          <div className="text-sm" data-testid="spec-total">Materijal za primer polja: <b className="tabular-nums">{fmtNum(total, 0)} {settings.currency}</b> <span className="text-muted">(sa otpadom, bez rada i montaže)</span></div>
        </div>
      </div>
    </Modal>
  );
}
