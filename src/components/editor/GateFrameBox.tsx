import { useMemo } from 'react';
import { customModelOf } from '../../domain/models/customRegistry';
import { framedModelId, frameCandidates, hasRealFrame, suggestFrameMaterial } from '../../domain/models/gateFrame';
import { RAM_LABELS, RAM_TUBE_DEFAULT_MM, isTubesModel } from '../../domain/models/tubes';
import type { Gate } from '../../domain/models/types';
import { setRam } from '../../domain/pricing/projectParts';
import { MaterialSelect } from '../../pages/Stock/StockPage';
import { useAppStore } from '../../store/useAppStore';
import { NumberField, SegmentedField } from '../forms/Fields';

/**
 * Ram kapije (pri vrhu podešavanja): kapija od ručno nacrtanog modela dobija ram od kvadratne cevi koju program predlaže po dubini modela,
 * a cev se ovde menja. Kapija od modela sa cevima u U profilima ima ram po izboru (bez rama, U profil, kvadratna cev) i njegovu širinu.
 */
export function GateFrameBox({ gate }: { gate: Gate }) {
  const materials = useAppStore((s) => s.materials);
  const st = useAppStore.getState();
  const gf = gate.params.gateFrame;
  const baseId = gf?.baseId ?? gate.infillModelId;
  const tubes = isTubesModel(gate.infillModelId);
  const base = tubes ? undefined : customModelOf(baseId);
  const only = useMemo(() => new Set(frameCandidates(materials).map((m) => m.id)), [materials]);
  if (gate.gateType === 'sliding') return null;
  if (tubes) {
    return (
      <div className="mb-2 pb-2 border-b border-line" data-testid="gate-frame-box">
        <SegmentedField label="Ram kapije" testId="gate-ram-kind" value={gate.params.ram ?? 'none'} options={(['none', 'u', 'tube'] as const).map((k) => ({ value: k, label: RAM_LABELS[k] }))}
          onChange={(v) => st.mutate((p) => setRam(p, v === 'none' ? undefined : v), 'ram')} />
        {gate.params.ram === 'tube' && (
          <NumberField label="Širina cevi rama" testId="gate-ram-mm" value={gate.params.ramMm ?? RAM_TUBE_DEFAULT_MM} range={{ min: 10, max: 200 }} onCommit={(v) => st.patchItemParams(gate.id, { ramMm: v }, 'ram-mm')} />
        )}
      </div>
    );
  }
  // ručno nacrtan model sa svojim ramom ili tip kapije: ram je deo crteža i menja se u crtežu
  if (!base || base.kind !== 'fence' || (gf == null && hasRealFrame(base, materials))) return null;
  const current = gf && gate.infillModelId === framedModelId(gf.baseId, gf.materialId) ? gf.materialId : '';
  const suggested = suggestFrameMaterial(base, materials);
  return (
    <div className="mb-2 pb-2 border-b border-line" data-testid="gate-frame-box">
      <div className="text-[13px] font-semibold mb-1">Ram kapije (materijal)</div>
      <MaterialSelect materials={materials} only={(m) => only.has(m.id)} value={current} emptyLabel="Bez rama" testId="gate-frame-material" onChange={(v) => st.setGateFrame(gate.id, v || null)} />
      <div className="flex items-center justify-between mt-1 text-[11.5px] text-muted">
        <span>{current ? 'Kvadratna cev sa sve četiri strane, rez 45°.' : 'Kapija je bez rama.'}</span>
        <span className="flex gap-2">
          {current && <button className="text-primary font-semibold" data-testid="gate-frame-none" onClick={() => st.setGateFrame(gate.id, null)}>Bez rama</button>}
          {suggested && suggested.id !== current && <button className="text-primary font-semibold" data-testid="gate-frame-suggest" title={suggested.name} onClick={() => st.setGateFrame(gate.id, suggested.id)}>Predlog</button>}
        </span>
      </div>
    </div>
  );
}
