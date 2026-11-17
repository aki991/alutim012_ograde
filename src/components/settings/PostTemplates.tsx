import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { colorHex, MOUNTING_LABELS, normalizeColorKey, POST_LABELS } from '../../domain/models/catalog';
import { materialShape } from '../../domain/models/materialShape';
import { newPostTemplate, postSizeFromMaterial } from '../../domain/models/postTemplates';
import type { MountingType, PostTemplate, PostType } from '../../domain/models/types';
import { PLINTH_DEFAULT_MM } from '../../domain/models/types';
import { LIMITS } from '../../domain/validation/limits';
import { useAppStore } from '../../store/useAppStore';
import { uid } from '../../utils/id';
import { MaterialPicker } from '../designer/MaterialPicker';
import { ColorField, NumberField, SelectField, TextField, ToggleField } from '../forms/Fields';
import { NumInput } from '../forms/NumInput';
import { ConfirmDialog, Modal } from '../ui/Modal';

/** tipovi stuba za šablon (stub kapije se postavlja sam uz kapiju) */
export const TEMPLATE_POST_TYPES: PostType[] = ['aluminium', 'decorative', 'concrete', 'concrete_plinth'];

/** Kratak opis šablona: tip, presek, visina, montaža. */
export function postTemplateSummary(t: PostTemplate, materialName?: string): string {
  return [POST_LABELS[t.type], materialName ?? `${t.round ? 'Ø' : ''}${t.widthMm}${t.round ? '' : `×${t.widthMm}`} mm`, t.heightMm ? `visina ${t.heightMm} mm` : 'visina prati ogradu', MOUNTING_LABELS[t.mounting]].join(' · ');
}

/** Forma šablona stuba: tip, materijal (presek), mere, montaža, boja i kape. */
export function PostTemplateForm({ initial, onSave, onClose }: { initial: PostTemplate; onSave: (t: PostTemplate) => void; onClose: () => void }) {
  const materials = useAppStore((s) => s.materials);
  const [t, setT] = useState<PostTemplate>(initial);
  const mat = t.materialId ? materials.find((m) => m.id === t.materialId) : undefined;
  const concrete = t.type === 'concrete' || t.type === 'concrete_plinth';
  const pickMaterial = (id: string) => {
    const m = materials.find((x) => x.id === id);
    const size = m ? postSizeFromMaterial(m) : null;
    setT({ ...t, materialId: id, ...(size ? { widthMm: Math.max(LIMITS.postWidth.min, size.widthMm), round: size.round || undefined } : {}) });
  };
  return (
    <Modal title={useAppStore.getState().settings.postTemplates?.some((x) => x.id === initial.id) ? 'Izmena šablona stuba' : 'Nov šablon stuba'} width={560} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Otkaži</button><button className="btn btn-primary" data-testid="post-tpl-save" disabled={!t.name.trim()} onClick={() => onSave({ ...t, name: t.name.trim() })}>Sačuvaj šablon</button></>}>
      <TextField label="Naziv" testId="post-tpl-name" value={t.name} onChange={(v) => setT({ ...t, name: v })} />
      <SelectField label="Tip" testId="post-tpl-type" value={t.type} options={TEMPLATE_POST_TYPES.map((value) => ({ value, label: POST_LABELS[value] }))} onChange={(v) => setT({ ...t, type: v })} />
      {!concrete && (
        <div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.45fr)] items-center gap-x-3 gap-y-1 py-1.5">
          <span className="label">Presek (materijal)</span>
          <div className="min-w-0">
            <div className="text-[13px] mb-1" data-testid="post-tpl-material-name">{mat ? mat.name : 'uobičajen stub prema tipu'}</div>
            <div className="flex gap-2 items-center">
              <div className="flex-1 min-w-0"><MaterialPicker materials={materials.filter((m) => materialShape(m).type === 'linear')} placeholder="— izaberite profil stuba —" testId="post-tpl-material" ariaLabel="Materijal stuba" onPick={pickMaterial} /></div>
              {mat && <button className="btn btn-sm" data-testid="post-tpl-material-clear" onClick={() => setT({ ...t, materialId: undefined })}>Ukloni</button>}
            </div>
          </div>
        </div>
      )}
      <NumberField label="Širina preseka" testId="post-tpl-width" value={t.widthMm} range={LIMITS.postWidth} integer={false} onCommit={(v) => setT({ ...t, widthMm: v })} />
      <div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.45fr)] items-center gap-x-3 gap-y-1 py-1.5">
        <label className="label">Visina (mm)</label>
        <NumInput testId="post-tpl-height" ariaLabel="Visina stuba" className="!text-left" placeholder="prati ogradu (automatski)" value={t.heightMm} onCommit={(v) => setT({ ...t, heightMm: v && v >= LIMITS.postHeight.min && v <= LIMITS.postHeight.max ? v : undefined })} />
      </div>
      {t.type === 'concrete_plinth' && <NumberField label="Visina podnožja" testId="post-tpl-plinth" value={t.plinthMm ?? PLINTH_DEFAULT_MM} range={{ min: 100, max: 1200 }} onCommit={(v) => setT({ ...t, plinthMm: v })} />}
      <SelectField label="Montaža" testId="post-tpl-mounting" value={t.mounting} options={(Object.entries(MOUNTING_LABELS) as [MountingType, string][]).map(([value, label]) => ({ value, label }))} onChange={(v) => setT({ ...t, mounting: v })} />
      {!concrete && <ColorField testId="post-tpl-color" value={t.color} onChange={(c) => setT({ ...t, color: c })} finish={t.finish} onFinishChange={(f) => setT({ ...t, finish: f })} />}
      {!concrete && <ToggleField label="Okrugao stub" testId="post-tpl-round" checked={!!t.round} onChange={(v) => setT({ ...t, round: v || undefined })} />}
      <p className="text-[12px] text-muted mt-1">Šablon se bira u panelu stuba u projektu (izabran stub → „Šablon stuba“). Prazna visina znači da stub prati visinu ograde.</p>
    </Modal>
  );
}

/** Podešavanja → Šabloni stubova: spisak, nov šablon, izmena i brisanje. */
export function PostTemplatesSection() {
  const templates = useAppStore((s) => s.settings.postTemplates) ?? [];
  const materials = useAppStore((s) => s.materials);
  const { upsertPostTemplate, removePostTemplate } = useAppStore.getState();
  const [edit, setEdit] = useState<PostTemplate | null>(null);
  const [del, setDel] = useState<PostTemplate | null>(null);
  return (
    <section className="card p-5" data-testid="set-post-templates">
      <div className="flex items-center gap-2 mb-1">
        <h2 className="font-bold flex-1">Šabloni stubova</h2>
        <button className="btn btn-sm btn-primary" data-testid="post-tpl-new" onClick={() => setEdit(newPostTemplate(uid('pt')))}><Plus size={15} />Nov šablon</button>
      </div>
      <p className="text-sm text-muted mb-2">Sačuvani stubovi (tip, presek, mere, montaža, boja, kape) koji se biraju za stub u projektu ograde.</p>
      {templates.length === 0 ? <p className="text-sm text-muted" data-testid="post-tpl-empty">Još nema šablona stubova.</p> : (
        <ul className="divide-y divide-line" data-testid="post-tpl-list">
          {templates.map((t) => (
            <li key={t.id} className="flex items-center gap-3 py-2" data-testid="post-tpl-row">
              <span className="w-5 h-5 rounded-full ring-1 ring-black/20 shrink-0" style={{ background: colorHex(t.color) }} title={normalizeColorKey(t.color)} />
              <span className="flex-1 min-w-0"><b className="block text-[14px]">{t.name}</b><span className="text-[12px] text-muted">{postTemplateSummary(t, materials.find((m) => m.id === t.materialId)?.name)}</span></span>
              <button className="btn btn-sm btn-icon" aria-label={`Izmeni ${t.name}`} data-testid="post-tpl-edit" onClick={() => setEdit(t)}><Pencil size={14} /></button>
              <button className="btn btn-sm btn-icon btn-danger" aria-label={`Obriši ${t.name}`} data-testid="post-tpl-delete" onClick={() => setDel(t)}><Trash2 size={14} /></button>
            </li>
          ))}
        </ul>
      )}
      {edit && <PostTemplateForm initial={edit} onClose={() => setEdit(null)} onSave={(t) => { upsertPostTemplate(t); setEdit(null); }} />}
      {del && <ConfirmDialog title="Brisanje šablona stuba" danger confirmLabel="Obriši" message={<>Obrisati šablon <b>{del.name}</b>? Stubovi u projektima koji su napravljeni od njega ostaju kakvi jesu.</>} onCancel={() => setDel(null)} onConfirm={() => { removePostTemplate(del.id); setDel(null); }} />}
    </section>
  );
}
