import { ListChecks, PencilRuler, Trash2 } from 'lucide-react';
import { SpecEditor } from '../../components/models/SpecEditor';
import { basicGateRows, type BomRow } from '../../domain/gates/basicBom';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GateDrawingThumb } from '../../components/designer/PartsSvg';
import { ElementThumb, GateModelThumb, SlidingThumb } from '../../components/editor/Catalog';
import { Page, PageHeader } from '../../components/ui/Common';
import { ConfirmDialog, Modal } from '../../components/ui/Modal';
import { GATE_TYPE_LABELS, leafKeyOf } from '../../domain/gates/gateModels';
import { type SlidingPresetId } from '../../domain/gates/slidingAssembly';
import { GATE_LABELS, projectModelId } from '../../domain/models/catalog';
import { allFenceModels } from '../../domain/models/customRegistry';
import type { CustomModel } from '../../domain/models/custom';
import type { FenceModelId } from '../../domain/models/types';
import type { GateType } from '../../domain/models/types';
import { useAppStore, useListedProjects } from '../../store/useAppStore';
import { uid } from '../../utils/id';

/** Osnovne kapije redom: pešačka, jednokrilna, dvokrilna, klizna i samostojeća klizna (klizne sa izborom ručna / motorna). */
type SlidingKind = { id: string; title: string; subtitle: string; preset: SlidingPresetId };
const BASIC: { type: GateType; subtitle: string }[] = [
  { type: 'pedestrian', subtitle: 'Za prolaz ljudi' },
  { type: 'single', subtitle: 'Jedno krilo' },
  { type: 'double', subtitle: 'Dva krila' },
];
const SLIDING: SlidingKind[] = [
  { id: 'sliding', title: 'Klizna kapija', subtitle: 'Klizi po šini u podu', preset: 'klizna_sina_rucna' },
  { id: 'sliding-self', title: 'Samostojeća klizna kapija', subtitle: 'Samonoseća, kolica i rep, bez šine', preset: 'samonoseca_rucna' },
];
/** velika sličica kao na stranici Modeli ograda (odnos 16:10) */
const THUMB = { width: 330, height: 206 };

/**
 * Modeli kapija: ručno nacrtani modeli vrste „Kapija“, isto kao modeli ograda (Koristi model, Otvori crtež, Obriši).
 * U crtežu postoji dugme „Mere kapije“ za podešavanja kapije. Osnovne kapije se mogu obrisati sa ove strane.
 */
export default function GateModelsPage() {
  const navigate = useNavigate();
  const [bomFor, setBomFor] = useState<CustomModel | null>(null);
  const [basicBom, setBasicBom] = useState<{ title: string; rows: BomRow[] } | null>(null);
  const materials = useAppStore((s) => s.materials);
  const customModels = useAppStore((s) => s.settings.customModels);
  const hidden = useAppStore((s) => s.settings.hiddenModels) ?? [];
  const projects = useListedProjects();
  const currentId = useAppStore((s) => s.editor.projectId);
  const current = projects.find((p) => p.id === currentId);
  const models = (customModels ?? []).filter((m) => m.kind === 'gate' && !m.replaces && !m.draft && !m.derivedFrom);
  const [del, setDel] = useState<CustomModel | null>(null);
  const [choice, setChoice] = useState<CustomModel | null>(null);
  const [delAll, setDelAll] = useState(false);
  // ograda na sličicama: model iz otvorenog projekta; bez projekta prvi model sa stranice Modeli ograda
  const shownModel = (current && projectModelId(current.items)) || allFenceModels()[0].id;
  const doradaModel = leafKeyOf(shownModel, customModels);
  // sličice kapija: model ograde sa ramom (ako ga kapija od tog modela dobija)
  const [thumbModel, setThumbModel] = useState<string>(shownModel);
  useEffect(() => { setThumbModel(useAppStore.getState().gateInfillWithFrame(shownModel)); }, [shownModel, customModels, materials]);
  // osnovne kapije se samo gledaju: crtež se otvara bez mogućnosti menjanja, a za izmene se kapija sačuva kao nov tip
  const openSliding = (p: SlidingPresetId) => navigate(`/modeli/crtanje/${useAppStore.getState().startSlidingDorada(p, doradaModel)}`, { state: { kind: 'gate', readOnly: true } });
  const openBasic = (t: GateType) => navigate(`/modeli/crtanje/${useAppStore.getState().startGateDorada(t, doradaModel)}`, { state: { kind: 'gate', readOnly: true } });
  const startSliding = (source: { preset: SlidingPresetId }) => { const id = useAppStore.getState().newProjectFromSliding(source); if (id) navigate(`/editor/${id}`); };

  const usedBy = (modelId: string): string[] => projects.filter((p) => p.items.some((it) => it.kind === 'gate' && it.infillModelId === modelId)).map((p) => p.name);
  const startNew = (m: CustomModel) => { const id = useAppStore.getState().newProjectFromGateModel(m.id); if (id) navigate(`/editor/${id}`); };
  const addToOpen = (m: CustomModel) => { if (useAppStore.getState().addGateFromModel(m.id) && current) navigate(`/editor/${current.id}`); };
  // tip kapije važi samo uz ogradu za koju je nacrtan: u otvorenom projektu sa drugom ogradom se ne dodaje
  const openFence = current ? projectModelId(current.items) : null;
  const fitsOpen = (m: CustomModel) => !openFence || !m.leafModelId || leafKeyOf(openFence, customModels) === m.leafModelId;
  const useModel = (m: CustomModel) => { if (current) setChoice(m); else startNew(m); };
  const useBasic = (t: GateType) => navigate(`/editor/${useAppStore.getState().newProject({ modelId: shownModel, startGate: t, name: `Novi projekat — ${GATE_LABELS[t]}` })}`);

  return (
    <Page>
      <PageHeader title="Modeli kapija"
        actions={<div className="flex gap-2">{hidden.some((h) => h.startsWith('gate:')) && <button className="btn" data-testid="restore-basic-gates" title="Vraća osnovne kapije koje su obrisane sa ove strane" onClick={() => useAppStore.getState().restoreHiddenModels('gate:')}>Vrati obrisane osnovne kapije</button>}<button className="btn btn-primary" data-testid="btn-create-gate-model" onClick={() => navigate(`/modeli/crtanje/${uid('cm')}`, { state: { kind: 'gate' } })}><PencilRuler size={17} />Napravi model</button></div>} />
      <section className="mb-7" data-testid="basic-gates">
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {BASIC.filter((b) => !hidden.includes(`gate:${b.type}`)).map((b) => (
            <article key={b.type} className="card overflow-hidden flex flex-col" data-testid={`basic-gate-${b.type}`}>
              <div className="relative aspect-[16/10] bg-[#eef2f6] overflow-hidden border-b border-line grid place-items-center"><ElementThumb kind={b.type} model={thumbModel as typeof shownModel} size={THUMB} /></div>
              <div className="p-4 flex-1 flex flex-col">
                <h3 className="font-bold text-[17px]">{GATE_LABELS[b.type]}</h3>
                <p className="text-sm text-muted mt-0.5">{b.subtitle}</p>
                <div className="flex gap-2 mt-auto pt-4">
                  <button className="btn flex-1 !px-2" data-testid={`rework-gate-${b.type}`} title="Prikazuje crtež kapije (bez menjanja); za izmene sačuvajte kapiju kao nov tip" onClick={() => openBasic(b.type)}><PencilRuler size={16} />Otvori crtež</button>
                  <button className="btn btn-primary flex-1 !px-2" onClick={() => useBasic(b.type)}>Koristi model</button>
                  <button className="btn !px-2.5 shrink-0" data-testid={`bom-gate-${b.type}`} title="Sastavnica kapije: sav materijal koji se koristi za ovu kapiju" onClick={() => setBasicBom({ title: GATE_LABELS[b.type], rows: basicGateRows(b.type, doradaModel, customModels, materials) })}><ListChecks size={16} />Sastavnica</button>
                </div>
              </div>
            </article>
          ))}
          {/* klizne kapije kao sklop; ručna / motorna se bira u projektu, Doradi pravi nov model koji se menja deo po deo */}
          {SLIDING.filter((k) => !hidden.includes(`gate:slide:${k.preset}`)).map((k) => (
            <article key={k.id} className="card overflow-hidden flex flex-col" data-testid={`basic-${k.id}`}>
              <div className="relative aspect-[16/10] bg-[#eef2f6] overflow-hidden border-b border-line grid place-items-center"><SlidingThumb preset={k.preset} model={thumbModel as typeof shownModel} size={THUMB} /></div>
              <div className="p-4 flex-1 flex flex-col">
                <h3 className="font-bold text-[17px]">{k.title}</h3>
                <p className="text-sm text-muted mt-0.5">{k.subtitle}</p>
                <div className="flex gap-2 mt-auto pt-4">
                  <button className="btn flex-1 !px-2" data-testid={`rework-sliding-${k.preset}`} title="Prikazuje crtež kapije (bez menjanja); za izmene sačuvajte kapiju kao nov tip" onClick={() => openSliding(k.preset)}><PencilRuler size={16} />Otvori crtež</button>
                  <button className="btn btn-primary flex-1 !px-2" data-testid={`use-sliding-${k.preset}`} onClick={() => startSliding({ preset: k.preset })}>Koristi model</button>
                  <button className="btn !px-2.5 shrink-0" data-testid={`bom-${k.id}`} title="Sastavnica kapije: sav materijal koji se koristi za ovu kapiju" onClick={() => setBasicBom({ title: k.title, rows: basicGateRows(k.preset, doradaModel, customModels, materials) })}><ListChecks size={16} />Sastavnica</button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className="mb-7" data-testid="gate-models">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-lg">Moji tipovi kapija</h2>
          {models.length > 0 && <button className="btn btn-danger" data-testid="delete-all-gate-models" onClick={() => setDelAll(true)}><Trash2 size={16} />Obriši sve</button>}
        </div>
        {models.length === 0 ? (
          <p className="text-sm text-muted card p-4" data-testid="gate-models-empty">Još nema modela kapija. Napravite ga dugmetom „Napravi model“ ili u „Mere kapije“ izaberite „Sačuvaj kao model“.</p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {models.map((m) => (
              <article key={m.id} className="card overflow-hidden flex flex-col" data-testid="gate-model-card">
                <div className="relative aspect-[16/10] bg-[#eef2f6] overflow-hidden border-b border-line p-3"><div className="h-full grid place-items-center">{m.gate?.gateType === 'sliding' ? <GateModelThumb model={m} size={THUMB} /> : <GateDrawingThumb model={m} materials={materials} />}</div></div>
                <div className="p-4 flex-1 flex flex-col">
                  <h3 className="font-bold text-[17px]" data-testid="gate-model-name">{m.name || 'Model bez naziva'}</h3>
                  <p className="text-sm text-muted mt-0.5">Kapija · {m.widthMm} × {m.heightMm + (m.gate?.gateType === 'sliding' ? m.gate.sliding?.frameBottomY ?? 0 : 0)} mm · {m.parts.length} delova</p>
                  <p className="text-[12.5px] text-muted">{GATE_TYPE_LABELS[m.gate?.gateType ?? 'pedestrian']} · mere kapije v{m.gate?.version ?? 1}{m.gateDefault ? ' · podrazumevana' : ''}</p>
                  <div className="flex gap-2 mt-auto pt-4">
                    <button className="btn !px-2.5 shrink-0" data-testid="open-gate-model" onClick={() => navigate(`/modeli/crtanje/${m.id}`)}><PencilRuler size={16} />Otvori crtež</button>
                    <button className="btn btn-primary flex-1 !px-2" data-testid="use-gate-model" disabled={m.parts.length === 0} onClick={() => useModel(m)}>Koristi model</button>
                    <button className="btn !px-2.5 shrink-0" data-testid="bom-gate-model" title="Sastavnica kapije: sav materijal koji se koristi za ovu kapiju" onClick={() => setBomFor(m)}><ListChecks size={16} />Sastavnica</button>
                    <button className="btn btn-danger shrink-0" data-testid="delete-gate-model" aria-label={`Obriši model ${m.name}`} title="Obriši model" onClick={() => setDel(m)}><Trash2 size={16} /></button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      {basicBom && <BasicBomModal title={basicBom.title} rows={basicBom.rows} onClose={() => setBasicBom(null)} />}
      {bomFor && <SpecEditor gate modelId={bomFor.id as FenceModelId} onClose={() => setBomFor(null)} />}
      {delAll && (
        <ConfirmDialog title="Brisanje svih modela kapija" danger confirmLabel="Obriši sve"
          message={<>Svi vaši modeli kapija ({models.length}) se trajno brišu. Kapije u projektima koje ih koriste prelaze na podrazumevani model; mere ostaju. Crteži se ne mogu vratiti.</>}
          onCancel={() => setDelAll(false)} onConfirm={() => { models.forEach((m) => useAppStore.getState().removeCustomModel(m.id)); setDelAll(false); }} />
      )}
      {choice && (
        <Modal title="Kako želite da koristite model?" onClose={() => setChoice(null)}>
          <p className="text-sm text-slate-600 mb-3">Trenutno je otvoren projekat <b>{current?.name}</b>.</p>
          <div className="flex flex-col gap-2">
            <button className="btn btn-primary justify-start" data-testid="gate-model-new-project" onClick={() => { startNew(choice); setChoice(null); }}>Napravi novi projekat sa ovom kapijom</button>
            <button className="btn justify-start" data-testid="gate-model-add-to-open" disabled={!fitsOpen(choice)} onClick={() => { addToOpen(choice); setChoice(null); }}>Dodaj kapiju u otvoreni projekat{fitsOpen(choice) ? '' : ' (u projektu je druga ograda)'}</button>
            <button className="btn justify-start" onClick={() => setChoice(null)}>Otkaži</button>
          </div>
        </Modal>
      )}
      {del && (
        <ConfirmDialog title="Brisanje modela kapije" danger confirmLabel="Obriši"
          message={usedBy(del.id).length ? <>Model <b>{del.name}</b> koriste projekti: <b>{usedBy(del.id).join(', ')}</b>. Ako ga obrišete, kapije u tim projektima prelaze na podrazumevani model; mere ostaju.</> : <>Model <b>{del.name}</b> se trajno briše.</>}
          onCancel={() => setDel(null)} onConfirm={() => { useAppStore.getState().removeCustomModel(del.id); setDel(null); }} />
      )}
    </Page>
  );
}


/** Sastavnica osnovne kapije (samo pregled): sav materijal koji se koristi, po crtežu. Za izmene se kapija sačuva kao nov tip. */
function BasicBomModal({ title, rows, onClose }: { title: string; rows: BomRow[]; onClose: () => void }) {
  return (
    <Modal title={`Sastavnica kapije — ${title}`} width={980} onClose={onClose}>
      <p className="text-[13px] text-slate-600 mb-2">Sav materijal koji se koristi za ovu kapiju. Osnovna kapija se ne menja: za izmene sastavnice sačuvajte kapiju kao nov tip kapije.</p>
      {rows.length === 0 ? <p className="text-sm text-muted">Nema stavki.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="basic-bom">
            <thead><tr><th className="th">Element</th><th className="th">Materijal</th><th className="th">Grupa</th><th className="th text-right">Količina</th><th className="th text-right">Dužina</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="bg-slate-50 text-slate-700">
                  <td className="td">{r.name}</td><td className="td">{r.material}</td><td className="td">{r.group}</td>
                  <td className="td text-right tabular-nums whitespace-nowrap">{r.qty}</td><td className="td text-right tabular-nums whitespace-nowrap">{r.length ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
