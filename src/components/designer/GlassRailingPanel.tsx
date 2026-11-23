import { useState } from 'react';
import type { CustomModel, GlassRailingSpec } from '../../domain/models/custom';
import { glassClampMaterials, glassRailingLayout, railingGlassMaterials } from '../../domain/models/glassRailing';
import type { Material } from '../../domain/models/types';
import { NumberField } from '../forms/Fields';
import { Switch } from '../ui/Switch';

export function GlassRailingPanel({ model, materials, onChange }: {
  model: CustomModel; materials: Material[]; onChange: (fn: (m: CustomModel) => CustomModel) => void;
}) {
  const clamps = glassClampMaterials(materials);
  const glasses = railingGlassMaterials(materials);
  const [clampChoice, setClampChoice] = useState('');
  const [glassChoice, setGlassChoice] = useState('');
  const spec = model.glassRailing;
  const clampId = spec?.clampMaterialId ?? (clamps.some((m) => m.id === clampChoice) ? clampChoice : clamps[0]?.id ?? '');
  const glassId = spec?.glassMaterialId ?? (glasses.some((m) => m.id === glassChoice) ? glassChoice : glasses[0]?.id ?? '');
  const draft: GlassRailingSpec = { ...spec, clampMaterialId: clampId };
  const layout = spec ? glassRailingLayout(model, draft, materials) : { parts: [], errors: [] };
  const apply = (patch: Partial<GlassRailingSpec>) => onChange((m) => ({ ...m, glassRailing: { ...draft, ...patch } }));
  return (
    <div className="mb-4">
      <Switch label="Crtam staklenu ogradu" testId="glass-railing-mode" checked={!!spec}
        onChange={(on) => on ? apply({}) : onChange((m) => ({ ...m, glassRailing: undefined }))} />
      {spec && <section className="rounded-lg border border-line p-2.5 mt-2" data-testid="glass-railing-panel">
      <h2 className="font-bold text-[14px] mb-1">Staklena ograda</h2>
      <p className="text-xs text-muted mb-2">Držači se postavljaju na stubove, po četiri za svako stakleno polje.</p>
      <label className="grid gap-1 text-[12.5px] mb-2">
        Držač stakla
        <select className="input !py-1 !text-[12px]" data-testid="glass-clamp-material" value={clampId}
          onChange={(e) => { setClampChoice(e.target.value); if (spec) apply({ clampMaterialId: e.target.value }); }}>
          {!clamps.length && <option value="">Nema držača stakla u cenovniku</option>}
          {clamps.map((m) => <option key={m.id} value={m.id}>{m.sku} · {m.name}</option>)}
        </select>
      </label>
      <button className="btn btn-sm btn-primary w-full mb-2" data-testid="glass-add-clamps" disabled={!layout.parts.length}
        onClick={() => apply({})}>{spec ? 'Osveži držače stakla' : 'Dodaj držače stakla'}</button>
      <Switch label="Staklena ograda – popuni staklom" testId="glass-railing-fill" checked={!!spec?.glassMaterialId} disabled={!layout.parts.length || !glasses.length}
        onChange={(on) => apply({ glassMaterialId: on ? glassId : undefined })} />
      <label className="grid gap-1 text-[12.5px] mt-1">
        Vrsta stakla
        <select className="input !py-1 !text-[12px]" data-testid="glass-pane-material" value={glassId}
          onChange={(e) => { setGlassChoice(e.target.value); if (spec?.glassMaterialId) apply({ glassMaterialId: e.target.value }); }}>
          {!glasses.length && <option value="">Nema stakla u cenovniku</option>}
          {glasses.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </label>
      {spec && <>
        <NumberField label="Tolerancija stakla" testId="glass-tolerance" value={spec.toleranceMm ?? 0} range={{ min: 0, max: 100 }} step={0.5} integer={false}
          onCommit={(v) => apply({ toleranceMm: v })} hint="2 mm umanjuje širinu za ukupno 2 mm (po 1 mm levo i desno). Visina ostaje ista." />
        <NumberField label="Staklo od dna stuba" testId="glass-bottom-gap" value={spec.bottomMm ?? 100} range={{ min: 0, max: 2000 }} onCommit={(v) => apply({ bottomMm: v })} />
        <NumberField label="Staklo od vrha stuba" testId="glass-top-gap" value={spec.topMm ?? 100} range={{ min: 0, max: 2000 }} onCommit={(v) => apply({ topMm: v })} />
        <NumberField label="Držači od ivice stakla" testId="glass-clamp-inset" value={spec.insetMm ?? 100} range={{ min: 0, max: 1000 }} onCommit={(v) => apply({ insetMm: v })} />
        <button className="btn btn-sm w-full mt-1" data-testid="glass-railing-remove" onClick={() => onChange((m) => ({ ...m, glassRailing: undefined }))}>Ukloni automatske držače i staklo</button>
      </>}
      {layout.errors.map((error) => <p key={error} className="text-xs text-[#b42318] mt-1" role="alert">{error}</p>)}
      {!glasses.length && <p className="text-xs text-muted mt-1">Dodajte staklo u cenovnik da uključite popunu.</p>}
      {!!spec?.glassMaterialId && <p className="text-xs text-muted mt-2">Staklo prati razmak stubova i položaj držača. Otvor čeljusti se usklađuje sa debljinom izabranog stakla.</p>}
      </section>}
    </div>
  );
}
