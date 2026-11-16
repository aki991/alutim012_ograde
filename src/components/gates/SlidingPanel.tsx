import { useMemo, useState } from 'react';
import { Save } from 'lucide-react';
import { computeLayout, postHalfSum } from '../../domain/geometry/layout';
import { variantTitle } from '../../domain/gates/slidingAssembly';
import { leafHeightOf, slidingH } from '../../domain/gates/slidingLayout';
import type { Gate, Project } from '../../domain/models/types';
import { useAppStore } from '../../store/useAppStore';
import { SlidingForm } from './SlidingForm';
import refRailManual from '../../assets/gates/klizna_sina_rucna.svg?url';
import refRailMotor from '../../assets/gates/klizna_sina_motorna.svg?url';
import refCantManual from '../../assets/gates/samonoseca_rucna.svg?url';
import refCantMotor from '../../assets/gates/samonoseca_motorna.svg?url';

export const SLIDING_REFS: Record<string, string> = { 'ground_rail|manual': refRailManual, 'ground_rail|motor': refRailMotor, 'cantilever|manual': refCantManual, 'cantilever|motor': refCantMotor };

/** Panel klizne kapije u projektu: sva podešavanja (zajednička forma), čuvanje kao model i referentni crtež. */
export function SlidingPanel({ project, gate }: { project: Project; gate: Gate }) {
  const st = useAppStore.getState();
  const spec = gate.sliding!;
  const index = project.items.findIndex((i) => i.id === gate.id);
  const li = useMemo(() => computeLayout(project).items[index], [project, index]);
  const half = postHalfSum(project, index);
  const [tplName, setTplName] = useState('');
  const [tplMsg, setTplMsg] = useState('');
  const [part, setPart] = useState<string | null>(null);
  const ref = SLIDING_REFS[`${spec.support}|${spec.actuation}`];
  const frameH = leafHeightOf(gate);

  return (
    <div className="space-y-2" data-testid="sliding-panel">
      <SlidingForm
        spec={spec} W={li.clearWidth} H={slidingH(gate)} opening={gate.opening} slideId={gate.id} selectedPart={part} onSelectPart={setPart}
        onSpec={(p, key) => st.patchSliding(gate.id, p, key)}
        onWidth={(v) => st.setWidth(gate.id, v + 2 * half, `w:${gate.id}`)}
        onHeight={(v) => st.patchItem(gate.id, { heightMm: v + spec.frameBottomY }, 'h')}
        onFrameBottom={(v) => { st.patchSliding(gate.id, { frameBottomY: v }); st.patchItem(gate.id, { heightMm: frameH + v }); }}
        onOpening={(v) => st.patchItem(gate.id, { opening: v })} />

      <div className="rounded-lg border border-line p-2 space-y-1.5" data-testid="sl-template">
        <div className="text-[13px] font-semibold">Sačuvaj kao šablon</div>
        <div className="flex gap-1.5">
          <input className="input !py-1 flex-1" placeholder={spec.name} aria-label="Naziv modela" data-testid="sl-tpl-name" value={tplName} onChange={(e) => setTplName(e.target.value)} />
          <button className="btn btn-sm" data-testid="sl-tpl-save" onClick={() => { const id = st.saveSlidingTemplate(gate.id, tplName || spec.name); if (id) { setTplMsg(`Šablon „${tplName || spec.name}“ je sačuvan u katalogu editora.`); setTplName(''); } }}><Save size={14} />Sačuvaj</button>
        </div>
        {tplMsg && <p className="text-[12px] text-emerald-700" data-testid="sl-tpl-msg">{tplMsg}</p>}
        <p className="text-[11px] text-muted">Šablon čuva klizni okov sa merama i okovima, smer, oslonac i pogon. Ubacivanje šablona pravi nezavisnu kopiju. Za crtanje krila deo po deo koristite „Modeli kapija“ → Doradi.</p>
      </div>

      {ref && (
        <details className="rounded-lg border border-line p-2">
          <summary className="cursor-pointer text-[13px] font-semibold">Referentni crtež (ilustracija)</summary>
          <img src={ref} alt={`Referentni crtež: ${variantTitle(spec)}`} className="w-full mt-1 rounded" />
        </details>
      )}
    </div>
  );
}
