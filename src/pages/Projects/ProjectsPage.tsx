import { Download, FileUp, Plus, Search } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { SelectField, TextField } from '../../components/forms/Fields';
import { ActionsMenu, EmptyState, Page, PageHeader, ProjectThumb, StatusPill } from '../../components/ui/Common';
import { ConfirmDialog, Modal } from '../../components/ui/Modal';
import { STATUS_LABELS } from '../../domain/models/catalog';
import type { Project, ProjectStatus } from '../../domain/models/types';
import { computeLayout } from '../../domain/geometry/layout';
import { parseProject } from '../../domain/validation/project';
import { exportProjectJson } from '../../services/exports';
import { useAppStore } from '../../store/useAppStore';
import { fmtDate, fmtM } from '../../utils/units';

export default function ProjectsPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const projects = useAppStore((s) => s.projects);
  const customers = useAppStore((s) => s.customers);
  const { newProject, copyProject, removeProject, patchProject, importProject } = useAppStore.getState();
  const q = params.get('q') ?? '';
  const [status, setStatus] = useState<ProjectStatus | 'all'>('all');
  const [editing, setEditing] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState<Project | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importOk, setImportOk] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const customerName = (id: string | null) => customers.find((c) => c.id === id)?.name ?? '—';
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return [...projects]
      .filter((p) => (status === 'all' || p.status === status) && (!t || p.name.toLowerCase().includes(t) || customerName(p.customerId).toLowerCase().includes(t) || p.quoteNo.toLowerCase().includes(t)))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, customers, q, status]);

  const onImport = async (file: File | undefined) => {
    setImportError(null);
    setImportOk(null);
    if (!file) return;
    const res = parseProject(await file.text());
    if (!res.ok) { setImportError(`Uvoz nije uspeo: ${res.error}`); return; }
    const id = importProject(res.project);
    setImportOk(`Projekat „${res.project.name}" je uvezen.`);
    void id;
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <Page>
      <PageHeader title="Projekti" subtitle={`${projects.length} projekata sačuvanih lokalno u ovom pregledaču`} actions={
        <>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" data-testid="import-file" onChange={(e) => void onImport(e.target.files?.[0])} />
          <button className="btn" onClick={() => fileRef.current?.click()} data-testid="btn-import"><FileUp size={17} />Uvezi JSON</button>
          <button className="btn btn-primary" data-testid="btn-new-project" onClick={() => navigate(`/editor/${newProject()}`)}><Plus size={17} />Novi projekat</button>
        </>
      } />
      {importError && <div role="alert" className="mb-3 rounded-lg bg-[#fef3f2] text-[#b42318] px-4 py-2.5 text-sm">{importError}</div>}
      {importOk && <div role="status" className="mb-3 rounded-lg bg-[#ecfdf3] text-[#067647] px-4 py-2.5 text-sm">{importOk}</div>}
      <div className="card p-4">
        <div className="flex flex-wrap gap-3 mb-4">
          <div className="relative flex-1 min-w-[220px] max-w-[420px]">
            <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input className="input !pl-10" placeholder="Pretraga po nazivu, kupcu, broju ponude" aria-label="Pretraga projekata" value={q} onChange={(e) => setParams(e.target.value ? { q: e.target.value } : {})} />
          </div>
          <select className="input !w-auto" aria-label="Filter statusa" value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus | 'all')}>
            <option value="all">Svi statusi</option>
            {(Object.keys(STATUS_LABELS) as ProjectStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </select>
        </div>
        {list.length === 0 ? <EmptyState title="Nema projekata" text="Nijedan projekat ne odgovara pretrazi ili filteru." /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]" data-testid="projects-table">
              <thead><tr><th className="th">Naziv projekta</th><th className="th">Kupac</th><th className="th">Status</th><th className="th">Dužina</th><th className="th">Izmenjeno</th><th className="th w-12"><span className="sr-only">Akcije</span></th></tr></thead>
              <tbody>
                {list.map((p) => (
                  <tr key={p.id} data-testid="project-row">
                    <td className="td"><button className="flex items-center gap-3 text-left font-medium hover:text-primary max-w-[320px]" onClick={() => navigate(`/editor/${p.id}`)}><ProjectThumb project={p} width={72} /><span className="truncate">{p.name}</span></button></td>
                    <td className="td text-slate-600">{customerName(p.customerId)}</td>
                    <td className="td"><StatusPill status={p.status} /></td>
                    <td className="td tabular-nums text-slate-600">{fmtM(computeLayout(p).totalModularMm)}</td>
                    <td className="td text-slate-600">{fmtDate(p.updatedAt)}</td>
                    <td className="td"><ActionsMenu actions={[
                      { label: 'Otvori', onClick: () => navigate(`/editor/${p.id}`) },
                      { label: 'Izmeni podatke', onClick: () => setEditing(p) },
                      { label: 'Dupliraj', onClick: () => { copyProject(p.id); } },
                      { label: 'Izvezi JSON', onClick: () => exportProjectJson(p) },
                      { label: 'Obriši', danger: true, onClick: () => setDeleting(p) },
                    ]} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {editing && (
        <Modal title="Izmena projekta" onClose={() => setEditing(null)} footer={<button className="btn btn-primary" onClick={() => setEditing(null)}>Gotovo</button>}>
          <TextField label="Naziv" value={editing.name} onChange={(v) => { setEditing({ ...editing, name: v }); patchProject(editing.id, { name: v }); }} />
          <SelectField label="Kupac" value={editing.customerId ?? ''} options={[{ value: '', label: '— nije izabran —' }, ...customers.map((c) => ({ value: c.id, label: c.name }))]} onChange={(v) => { setEditing({ ...editing, customerId: v || null }); patchProject(editing.id, { customerId: v || null }); }} />
          <SelectField label="Status" value={editing.status} options={(Object.keys(STATUS_LABELS) as ProjectStatus[]).map((s) => ({ value: s, label: STATUS_LABELS[s] }))} onChange={(v) => { setEditing({ ...editing, status: v }); patchProject(editing.id, { status: v }); }} />
          <TextField label="Napomena" multiline value={editing.notes} onChange={(v) => { setEditing({ ...editing, notes: v }); patchProject(editing.id, { notes: v }); }} />
        </Modal>
      )}
      {deleting && <ConfirmDialog title="Brisanje projekta" danger confirmLabel="Obriši" message={<>Projekat <b>{deleting.name}</b> biće trajno obrisan iz lokalne baze. Nastaviti?</>} onCancel={() => setDeleting(null)} onConfirm={() => { removeProject(deleting.id); setDeleting(null); }} />}
      <p className="text-xs text-muted mt-3 flex items-center gap-1"><Download size={12} />Izvoz/uvoz u JSON čuva ceo projekat (elemente, stubove, podešavanja). Uvoz proverava strukturu i prijavljuje grešku ako format nije ispravan.</p>
    </Page>
  );
}
