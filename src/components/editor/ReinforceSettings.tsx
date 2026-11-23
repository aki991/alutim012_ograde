import { useMemo, useState } from 'react';
import { customLiftOf, customModelOf, customReinforceInfo, isCustomModel } from '../../domain/models/customRegistry';
import { frameCandidates, suggestFrameMaterial } from '../../domain/models/gateFrame';
import { autoVerticalCount, type Reinforce } from '../../domain/models/reinforce';
import type { FenceModelId, FenceParams } from '../../domain/models/types';
import { MaterialSelect } from '../../pages/Stock/StockPage';
import { useAppStore } from '../../store/useAppStore';
import { NumberField, ToggleField } from '../forms/Fields';

/**
 * Ojačanje platna kvadratnim cevima (polje ograde ili krilo kapije ručno nacrtanog modela): uspravne cevi dele široko platno (automatski
 * na svakih 2,5 m), a vodoravna cev deli platno po visini i spaja se sa bočnim stranama.
 */
export function ReinforceSettings({ id, modelId, widthMm, heightMm, params }: { id: string; modelId: FenceModelId; widthMm: number; heightMm: number; params: FenceParams }) {
  const [open, setOpen] = useState(false);
  const materials = useAppStore((s) => s.materials);
  const tubes = useMemo(() => new Set(frameCandidates(materials).map((m) => m.id)), [materials]);
  if (!isCustomModel(modelId)) return null;
  const st = useAppStore.getState();
  const lift = params.liftMm ?? customLiftOf(modelId);
  const info = customReinforceInfo(modelId, widthMm, heightMm - lift, params.slats);
  const rf: Reinforce = params.slats?.reinforce ?? {};
  const setRf = (patch: Partial<Reinforce>) => st.patchItemParams(id, { slats: { ...params.slats, reinforce: { ...rf, ...patch } } }, 'reinforce');
  const auto = autoVerticalCount(widthMm);
  const vCount = rf.vCount ?? auto;
  const hY = rf.hYs?.[0];
  const inner = Math.round(info?.innerHeightMm ?? heightMm - lift);
  const model = customModelOf(modelId);
  const suggested = model ? suggestFrameMaterial(model, materials) : null;
  const count = vCount + (hY !== undefined ? 1 : 0);
  return (
    <div className="mt-2 rounded-lg border border-line" data-testid="reinforce-settings">
      <button className="w-full flex items-center justify-between px-3 py-2 text-[13.5px] font-semibold" aria-expanded={open} onClick={() => setOpen((o) => !o)} data-testid="reinforce-toggle">
        <span>Ojačanje (cevi){count ? <span className="ml-1.5 text-primary">· {vCount ? `${vCount} uspravn${vCount === 1 ? 'a' : 'e'}` : ''}{vCount && hY !== undefined ? ', ' : ''}{hY !== undefined ? '1 vodoravna' : ''}</span> : null}</span>
        <span className="text-muted text-[12px] font-normal">{open ? 'Sakrij' : 'Prikaži'}</span>
      </button>
      {open && (
        <div className="px-3 pb-2">
          <ToggleField label="Uspravne cevi" testId="reinforce-v-toggle" checked={vCount > 0} onLabel="Da" offLabel="Ne" onChange={(v) => setRf({ vCount: v ? (auto > 0 ? undefined : 1) : 0 })} />
          {vCount > 0 && <>
            <NumberField label="Broj uspravnih cevi" testId="reinforce-v" value={vCount} range={{ min: 1, max: 20 }} unit="" step={1} integer onCommit={(v) => setRf({ vCount: v })} />
            {rf.vCount !== undefined && auto > 0 && <button className="text-[12px] text-primary font-semibold" onClick={() => setRf({ vCount: undefined })}>Vrati automatski ({auto})</button>}
          </>}
          <ToggleField label="Vodoravna cev" testId="reinforce-h-toggle" checked={hY !== undefined} onLabel="Da" offLabel="Ne" onChange={(v) => setRf({ hYs: v ? [Math.round(inner / 2)] : [] })} />
          {hY !== undefined && (
            <NumberField label="Visina ose od dna ispune" testId="reinforce-h" value={hY} range={{ min: 0, max: Math.max(100, inner) }} onCommit={(v) => setRf({ hYs: [v] })} hint={`Unutrašnja visina platna: ${inner} mm.`} />
          )}
          <div className="mt-1">
            <div className="text-[13px] mb-1">Materijal cevi</div>
            <MaterialSelect materials={materials} only={(m) => tubes.has(m.id)} value={rf.materialId ?? ''} emptyLabel={suggested ? `Predlog: ${suggested.name}` : 'Predlog programa (po dubini modela)'} testId="reinforce-material" onChange={(v) => setRf({ materialId: v || undefined })} />
          </div>
        </div>
      )}
    </div>
  );
}
