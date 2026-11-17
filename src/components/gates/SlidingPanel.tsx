import { useMemo, useState } from 'react';
import { computeLayout, postHalfSum } from '../../domain/geometry/layout';
import { variantTitle } from '../../domain/gates/slidingAssembly';
import { leafHeightOf, slidingH } from '../../domain/gates/slidingLayout';
import type { Gate, Project } from '../../domain/models/types';
import { useAppStore } from '../../store/useAppStore';
import { SlidingForm } from './SlidingForm';
import { GateModelPicker } from './GateModelPicker';
import refRailManual from '../../assets/gates/klizna_sina_rucna.svg?url';
import refRailMotor from '../../assets/gates/klizna_sina_motorna.svg?url';
import refCantManual from '../../assets/gates/samonoseca_rucna.svg?url';
import refCantMotor from '../../assets/gates/samonoseca_motorna.svg?url';

export const SLIDING_REFS: Record<string, string> = { 'ground_rail|manual': refRailManual, 'ground_rail|motor': refRailMotor, 'cantilever|manual': refCantManual, 'cantilever|motor': refCantMotor };

/** Panel klizne kapije u projektu: sva podešavanja (zajednička forma) i referentni crtež. */
export function SlidingPanel({ project, gate }: { project: Project; gate: Gate }) {
  const st = useAppStore.getState();
  const spec = gate.sliding!;
  const index = project.items.findIndex((i) => i.id === gate.id);
  const li = useMemo(() => computeLayout(project).items[index], [project, index]);
  const half = postHalfSum(project, index);
  const [part, setPart] = useState<string | null>(null);
  const ref = SLIDING_REFS[`${spec.support}|${spec.actuation}`];
  const frameH = leafHeightOf(gate);

  return (
    <div className="space-y-2" data-testid="sliding-panel">
      <SlidingForm nameSlot={<GateModelPicker gate={gate} />}
        spec={spec} W={li.clearWidth} H={slidingH(gate)} opening={gate.opening} slideId={gate.id} selectedPart={part} onSelectPart={setPart}
        onSpec={(p, key) => st.patchSliding(gate.id, p, key)}
        onWidth={(v) => st.setWidth(gate.id, v + 2 * half, `w:${gate.id}`)}
        onHeight={(v) => st.patchItem(gate.id, { heightMm: v + spec.frameBottomY }, 'h')}
        onFrameBottom={(v) => { st.patchSliding(gate.id, { frameBottomY: v }); st.patchItem(gate.id, { heightMm: frameH + v }); }}
        onOpening={(v) => st.patchItem(gate.id, { opening: v })} />

      {ref && (
        <details className="rounded-lg border border-line p-2">
          <summary className="cursor-pointer text-[13px] font-semibold">Referentni crtež (ilustracija)</summary>
          <img src={ref} alt={`Referentni crtež: ${variantTitle(spec)}`} className="w-full mt-1 rounded" />
        </details>
      )}
    </div>
  );
}
