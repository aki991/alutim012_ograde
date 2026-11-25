import { useMemo } from 'react';
import { customModelOf } from '../../domain/models/customRegistry';
import { drawnFrameOf, framedModelId, frameCandidates, frameRotFor, hasRealFrame, modelDepthMm, suggestFrameMaterial } from '../../domain/models/gateFrame';
import { isFramePart } from '../../domain/models/frame';
import { materialShape, sectionFace } from '../../domain/models/materialShape';
import { RAM_LABELS, RAM_TUBE_DEFAULT_MM, isTubesModel } from '../../domain/models/tubes';
import type { Gate } from '../../domain/models/types';
import { setRam } from '../../domain/pricing/projectParts';
import { MaterialSelect } from '../../pages/Stock/StockPage';
import { useAppStore } from '../../store/useAppStore';
import { NumberField, SegmentedField } from '../forms/Fields';

const fmt = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');

/**
 * Ram kapije (pri vrhu podešavanja, za svaku kapiju, i kliznu): cev rama se bira iz cenovnika (npr. 30 × 20 → 60 × 40) zajedno sa
 * stranom cevi koja je čelo (vidi se spreda). Kapija od modela bez rama dobija ram oko modela, a model sa nacrtanim ramom (tip kapije)
 * dobija novu cev umesto nacrtane. Izmena važi za izabrani opseg (ova kapija ili sve kapije). Kapija od modela sa cevima u U profilima
 * ima ram po izboru (bez rama, U profil, kvadratna cev) i njegovu širinu.
 */
export function GateFrameBox({ gate }: { gate: Gate }) {
  const materials = useAppStore((s) => s.materials);
  const st = useAppStore.getState();
  const gf = gate.params.gateFrame;
  const baseId = gf?.baseId ?? customModelOf(gate.infillModelId)?.derivedFrom ?? gate.infillModelId;
  const tubes = isTubesModel(gate.infillModelId);
  const base = tubes ? undefined : customModelOf(baseId);
  const only = useMemo(() => new Set(frameCandidates(materials).map((m) => m.id)), [materials]);
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
  if (!base) return null;
  const drawn = drawnFrameOf(base);
  // ram nacrtan bez reza 45° je deo crteža i menja se u crtežu
  if (!drawn && hasRealFrame(base, materials)) return null;
  const ours = !!gf && gate.infillModelId === framedModelId(gf.baseId, gf.materialId, gf.rot);
  const current = ours ? gf!.materialId : drawn?.materialId ?? '';
  const mat = materials.find((m) => m.id === current);
  const shape = mat ? materialShape(mat) : null;
  const depth = modelDepthMm(drawn ? { parts: base.parts.filter((p) => !isFramePart(p)) } : base, materials);
  const rot: 0 | 90 = ours && gf!.rot !== undefined ? gf!.rot : !ours && drawn ? drawn.rot : mat ? frameRotFor(mat, depth) : 0;
  const faces = shape?.type === 'linear' ? [sectionFace(shape.section, 0).face, sectionFace(shape.section, 90).face] as const : null;
  const suggested = drawn ? null : suggestFrameMaterial(base, materials);
  // nova cev zadržava ručno izabrano čelo; inače se čelo bira po dubini modela
  const pick = (v: string) => st.setGateFrame(gate.id, v || null, ours ? gf!.rot : undefined);
  return (
    <div className="mb-2 pb-2 border-b border-line" data-testid="gate-frame-box">
      <div className="text-[13px] font-semibold mb-1">Ram kapije (materijal)</div>
      <MaterialSelect materials={materials} only={(m) => only.has(m.id)} value={current} emptyLabel={drawn ? 'Ram iz crteža modela' : 'Bez rama'} testId="gate-frame-material" onChange={pick} />
      {mat && faces && Math.abs(faces[0] - faces[1]) > 0.05 && (
        <SegmentedField label="Čelo rama (strana vidljiva spreda)" testId="gate-frame-face" value={String(rot) as '0' | '90'}
          options={[{ value: '0', label: `${fmt(faces[0])} mm` }, { value: '90', label: `${fmt(faces[1])} mm` }]}
          onChange={(v) => st.setGateFrame(gate.id, current, Number(v) as 0 | 90)} />
      )}
      <div className="flex items-center justify-between mt-1 text-[11.5px] text-muted">
        <span>{mat ? `Cev sa sve četiri strane, rez 45°${faces ? `; spreda ${fmt(faces[rot === 90 ? 1 : 0])} mm, u dubinu ${fmt(faces[rot === 90 ? 0 : 1])} mm` : ''}.` : 'Kapija je bez rama.'}</span>
        <span className="flex gap-2">
          {current && !drawn && <button className="text-primary font-semibold" data-testid="gate-frame-none" onClick={() => st.setGateFrame(gate.id, null)}>Bez rama</button>}
          {ours && drawn && <button className="text-primary font-semibold" data-testid="gate-frame-drawn" onClick={() => st.setGateFrame(gate.id, null)}>Ram iz crteža</button>}
          {suggested && suggested.id !== current && <button className="text-primary font-semibold" data-testid="gate-frame-suggest" title={suggested.name} onClick={() => st.setGateFrame(gate.id, suggested.id)}>Predlog</button>}
        </span>
      </div>
    </div>
  );
}
