import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { projectModelId } from '../../domain/models/catalog';
import { RAM_LABELS, RAM_TUBE_DEFAULT_MM, isTubesModel } from '../../domain/models/tubes';
import type { FenceParams, Material, Project } from '../../domain/models/types';
import { partsEditable, projectParts, setPartMaterial, setRam, type ProjectPart } from '../../domain/pricing/projectParts';
import { materialShape } from '../../domain/models/materialShape';
import { MaterialSelect } from '../../pages/Stock/StockPage';
import { useAppStore } from '../../store/useAppStore';
import { NumberField, SegmentedField } from '../forms/Fields';

const ROLE_HINT: Record<NonNullable<ProjectPart['role']>, string> = {
  main: 'menja i visinu/širinu letvice na crtežu',
  rail: 'menja i širinu bočnog profila na crtežu',
  frame: 'menja i debljinu rama na crtežu',
  ram: 'menja i širinu rama na crtežu',
};

/**
 * Delovi ograde u projektu: za svako mesto u sastavnici (letvica/prečka, bočna strana, ram, stub, nosači, vijci, okov kapije)
 * bira se materijal iz cenovnika. Važi za ceo projekat (sva polja i kapije). Kod modela sa horizontalnim kvadratnim cevima
 * ovde se bira i ram (U profil ili kvadratna cev sa sve četiri strane, rez 45°).
 */
export function PartsPanel({ project, params }: { project: Project; params: FenceParams }) {
  const [open, setOpen] = useState(false);
  const materials = useAppStore((s) => s.materials);
  const specs = useAppStore((s) => s.settings.modelSpecs);
  const { mutate } = useAppStore.getState();
  const modelId = projectModelId(project.items);
  const parts = useMemo(() => (open ? projectParts(project, materials, specs) : []), [open, project, materials, specs]);
  const byId = useMemo(() => new Map(materials.map((m) => [m.id, m])), [materials]);
  const linearOnly = (m: Material) => materialShape(m).type === 'linear';
  const pieceOnly = (m: Material) => materialShape(m).type !== 'linear';
  const tubes = isTubesModel(modelId ?? undefined);
  const replacedCount = Object.keys(project.partMaterials ?? {}).length;

  return (
    <div className="mt-2 rounded-lg border border-line" data-testid="parts-panel">
      <button className="w-full flex items-center justify-between px-3 py-2 text-[13.5px] font-semibold" aria-expanded={open} onClick={() => setOpen((o) => !o)} data-testid="parts-panel-toggle">
        <span>Delovi ograde (materijali){replacedCount ? <span className="ml-1.5 text-primary">· {replacedCount} zamenjeno</span> : null}</span>
        <span className="text-muted text-[12px] font-normal">{open ? 'Sakrij' : 'Prikaži'}</span>
      </button>
      {open && (
        <div className="px-3 pb-3">
          {!partsEditable(project) ? (
            <p className="text-[12.5px] text-muted" data-testid="parts-custom-note">Ovaj model je ručno nacrtan: svaki deo se menja u njegovom crtežu (izaberite deo, pa drugi materijal). {modelId && <Link className="text-primary font-semibold" to={`/modeli/crtanje/${modelId}`}>Otvori crtež</Link>}</p>
          ) : (
            <>
              <p className="text-[12px] text-muted mb-2">Za svaki deo izaberite materijal iz cenovnika. Važi za ceo projekat: kalkulaciju, krojnu listu i radni nalog.</p>
              {tubes && (
                <div className="mb-2 pb-2 border-b border-line" data-testid="ram-box">
                  <SegmentedField label="Ram (okvir)" testId="ram-kind" value={params.ram ?? 'none'} options={(['none', 'u', 'tube'] as const).map((k) => ({ value: k, label: RAM_LABELS[k] }))}
                    onChange={(v) => mutate((p) => setRam(p, v === 'none' ? undefined : v), 'ram')} />
                  {params.ram === 'tube' && (
                    <NumberField label="Širina cevi rama" testId="ram-mm" value={params.ramMm ?? RAM_TUBE_DEFAULT_MM} range={{ min: 10, max: 200 }}
                      onCommit={(v) => mutate((p) => ({ ...p, items: p.items.map((it) => (it.kind !== 'opening' && isTubesModel(it.kind === 'fence' ? it.modelId : it.infillModelId) ? { ...it, params: { ...it.params, ramMm: v } } : it)) }), 'ram-mm')} />
                  )}
                  <p className="text-[11.5px] text-muted">{params.ram === 'u' ? 'U profil ide sa sve četiri strane (bočne vođice se zatvaraju gore i dole).' : params.ram === 'tube' ? 'Kvadratna cev čini spoljašnji ram; U vođice i cevi su unutar njega.' : 'Ram je okvir (ojačanje) ograde sa sve četiri strane.'} {params.ram ? 'Delovi rama se seku pod 45° i tako su označeni u krojnoj listi.' : ''}</p>
                </div>
              )}
              {materials.length === 0 && <p className="text-[12.5px] text-[#b45309] mb-2">Cenovnik je prazan: uvezite materijale na strani <Link className="font-semibold underline" to="/materijali">Materijali i cene</Link> da biste mogli da birate delove.</p>}
              {parts.map((p) => {
                const cur = byId.get(p.currentId);
                return (
                  <div key={p.id} className="py-1.5 border-b border-line last:border-b-0" data-testid="part-row" data-part={p.id}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[12.5px] font-semibold leading-tight">{p.label}</span>
                      <span className="text-[11px] text-muted shrink-0">{p.group}</span>
                    </div>
                    <div className="mt-1">
                      <MaterialSelect materials={materials} only={p.linear ? linearOnly : pieceOnly} value={cur ? cur.id : ''} testId={`part-select-${p.id}`}
                        onChange={(v) => mutate((proj) => setPartMaterial(proj, p, v ? byId.get(v) ?? null : null), `part:${p.id}`)} />
                    </div>
                    <div className="text-[11.5px] mt-0.5">
                      {!cur ? <span className="text-[#b45309] font-semibold">Nije izabran materijal — deo je bez cene.</span>
                        : <span className="text-muted">{cur.sku}{p.role ? ` · ${ROLE_HINT[p.role]}` : ''}</span>}
                      {p.replaced && <button className="ml-2 text-primary font-semibold" onClick={() => mutate((proj) => setPartMaterial(proj, p, null), `part:${p.id}`)}>vrati</button>}
                    </div>
                  </div>
                );
              })}
              {parts.length === 0 && <p className="text-[12.5px] text-muted">Projekat još nema delova.</p>}
            </>
          )}
        </div>
      )}
    </div>
  );
}
