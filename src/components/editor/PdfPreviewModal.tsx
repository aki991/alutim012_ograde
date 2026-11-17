import { Download, ExternalLink, FileText, Loader2, Maximize2, Minimize2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { AppSettings, Customer, Material, Project } from '../../domain/models/types';
import { downloadBlob, safeFilename } from '../../services/exports';
import { buildQuotePdfBlob } from '../../services/pdf';
import { buildCuttingList, cutOptions, PRINT_SCOPE_LABELS, type PrintScope } from '../../domain/pricing/cutting';
import { useAppStore } from '../../store/useAppStore';
import { ConfirmCuttingButton } from '../production/ConfirmCuttingButton';
import { OffcutsPanel } from '../production/OffcutsPanel';
import { Modal } from '../ui/Modal';

/**
 * Telefoni i tableti ne mogu da prikažu PDF unutar stranice (Android pregledač nema ugrađen PDF pregledač, a iOS prikazuje samo prvu
 * stranicu ili prazan okvir): tamo se umesto okvira nudi otvaranje PDF-a u novom listu / aplikaciji i čuvanje.
 */
function canEmbedPdf(): boolean {
  if (typeof navigator === 'undefined') return true;
  return !(typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches);
}

/** Pregled ponude pre čuvanja: PDF se prvo prikaže, a tek „Sačuvaj PDF" ga preuzima. */
export function PdfPreviewModal({ project, customer, materials, settings, onClose, kind = 'quote', askOffcuts = false, itemId }: {
  project: Project; customer: Customer | null; materials: Material[]; settings: AppSettings; onClose: () => void;
  /** vrsta dokumenta: ponuda (podrazumevano), krojna lista, radni nalog, skica ili mere kapije */
  kind?: 'quote' | 'cutlist' | 'workorder' | 'sketch' | 'gate';
  /** krojna lista: pre PDF-a se prvo prikazuje unos ostataka materijala (ručno ili iz magacina) */
  askOffcuts?: boolean;
  /** mere kapije: ID kapije u projektu */
  itemId?: string;
}) {
  const cutlist = kind === 'cutlist';
  const workorder = kind === 'workorder';
  const sketch = kind === 'sketch';
  const gate = kind === 'gate';
  const docName = gate ? 'mera kapije' : sketch ? 'skice' : workorder ? 'radnog naloga' : cutlist ? 'krojne liste' : 'ponude';
  const docTitle = gate ? 'Pregled mera kapije' : sketch ? 'Pregled skice' : workorder ? 'Pregled radnog naloga' : cutlist ? 'Pregled krojne liste' : 'Pregled ponude';
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [full, setFull] = useState(false);
  const embed = canEmbedPdf();
  const patchProject = useAppStore((s) => s.patchProject);
  // korak pre krojne liste: ostaci materijala; PDF se pravi tek posle potvrde
  // krojna lista i radni nalog mogu da se štampaju za ceo projekat, samo za kapije ili za ogradu bez kapija
  const [scope, setScope] = useState<PrintScope>('all');
  const canScope = (cutlist || workorder || sketch) && project.items.some((i) => i.kind === 'gate') && project.items.some((i) => i.kind === 'fence');
  const opts = { ...cutOptions(settings), scope };
  const cutProfiles = useMemo(() => (cutlist && askOffcuts ? buildCuttingList(project, settings.modelSpecs, materials, opts) : null), [cutlist, askOffcuts, project, settings.modelSpecs, materials, opts.stockMm, opts.kerfMm, opts.saveMaterial, scope]); // eslint-disable-line react-hooks/exhaustive-deps
  const [ready, setReady] = useState(!(cutlist && askOffcuts));
  const offcutsStep = !ready && !!cutProfiles && cutProfiles.totals.pieces > 0;
  useEffect(() => { if (!ready && cutProfiles && cutProfiles.totals.pieces === 0) setReady(true); }, [ready, cutProfiles]);

  useEffect(() => {
    if (!ready) return;
    setBlob(null); setUrl(null); setError(null);
    let alive = true;
    let objectUrl: string | null = null;
    (gate ? import('../../services/pdfGate').then((m) => m.buildGatePdfBlob(project, itemId ?? '', materials, settings)) : sketch ? import('../../services/pdfSketch').then((m) => m.buildProjectSketchPdfBlob(project, customer, materials, settings, scope)) : workorder ? import('../../services/pdfWorkorder').then((m) => m.buildWorkorderPdfBlob(project, customer, materials, settings, scope)) : cutlist ? import('../../services/pdfCutlist').then((m) => m.buildCutlistPdfBlob(project, customer, materials, settings, undefined, scope)) : buildQuotePdfBlob(project, customer, materials, settings))
      .then((b) => {
        if (!alive) return;
        objectUrl = URL.createObjectURL(b);
        setBlob(b);
        setUrl(objectUrl);
      })
      .catch((e: Error) => { if (alive) setError(`PDF nije generisan: ${e.message}`); });
    return () => { alive = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, scope]);

  const suffix = scope === 'gates' ? '-kapije' : scope === 'fence' ? '-ograda' : '';
  const save = () => { if (blob) downloadBlob(blob, gate ? `mere_kapije_${safeFilename(project.name)}.pdf` : sketch ? `skica${suffix}_${safeFilename(project.name)}.pdf` : workorder ? `radni-nalog${suffix}_${safeFilename(project.name)}.pdf` : cutlist ? `krojna-lista${suffix}_${safeFilename(project.name)}.pdf` : `ponuda_${safeFilename(project.quoteNo || project.name)}.pdf`); };

  return (
    <Modal
      title={kind === 'quote' ? `Pregled ponude${project.quoteNo ? ` ${project.quoteNo}` : ''}` : docTitle}
      width={900}
      fullscreen={full}
      onClose={onClose}
      headerActions={<button className="btn btn-icon" aria-label={full ? 'Smanji prikaz' : 'Prikaži preko celog ekrana'} title={full ? 'Smanji prikaz' : 'Preko celog ekrana'} aria-pressed={full} onClick={() => setFull((f) => !f)} data-testid="pdf-fullscreen">{full ? <Minimize2 size={18} /> : <Maximize2 size={18} />}</button>}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2 w-full">
          {cutlist && askOffcuts && ready && <ConfirmCuttingButton project={project} materials={materials} />}
          <button className="btn" onClick={onClose} data-testid="pdf-close">Zatvori</button>
          {offcutsStep
            ? <button className="btn btn-primary" onClick={() => setReady(true)} data-testid="offcuts-continue"><FileText size={16} />Prikaži krojnu listu</button>
            : <button className="btn btn-primary" onClick={save} disabled={!blob} data-testid="pdf-save"><Download size={16} />Sačuvaj PDF</button>}
        </div>
      }
    >
      {canScope && (
        <div className="flex flex-wrap items-center gap-2 mb-2" data-testid="pdf-scope">
          <span className="text-sm text-muted">Štampa:</span>
          <span className="inline-flex rounded-lg border border-line overflow-hidden">
            {(['all', 'gates', 'fence'] as PrintScope[]).map((s) => (
              <button key={s} type="button" data-testid={`pdf-scope-${s}`} aria-pressed={scope === s} className={`px-3 py-1.5 text-[13px] font-semibold ${scope === s ? 'bg-brand-black text-white' : 'hover:bg-slate-50'}`} onClick={() => setScope(s)}>{PRINT_SCOPE_LABELS[s]}</button>
            ))}
          </span>
        </div>
      )}
      {offcutsStep ? (
        <div data-testid="offcuts-step">
          <OffcutsPanel project={project} materials={materials} stock={settings.stock ?? []} profiles={cutProfiles!.profiles.map((p) => p.profile)} onChange={(offcuts) => patchProject(project.id, { offcuts })} />
          <p className="text-sm text-muted">Kad završite unos ostataka (ili ako ih nemate), kliknite „Prikaži krojnu listu".</p>
        </div>
      ) : (
      <div className={`${full ? 'h-[calc(100vh-10.5rem)]' : 'h-[68vh]'} min-h-[320px] bg-slate-100 rounded-lg overflow-hidden`} data-testid="pdf-preview">
        {error ? (
          <div className="h-full grid place-items-center text-sm text-[#b42318] p-4" role="alert">{error}</div>
        ) : url && !embed ? (
          <div className="h-full grid place-items-center p-4 text-center" data-testid="pdf-nofallback">
            <div className="max-w-sm">
              <FileText size={40} className="mx-auto text-muted mb-3" />
              <p className="font-semibold mb-1">{docName[0].toUpperCase() + docName.slice(1)} je spremna</p>
              <p className="text-sm text-muted mb-4">Pregled PDF-a unutar stranice nije podržan na telefonu i tabletu. Otvori ga u pregledaču ili aplikaciji za PDF, ili ga sačuvaj.</p>
              <a className="btn btn-primary" href={url} target="_blank" rel="noopener" data-testid="pdf-open"><ExternalLink size={16} />Otvori PDF</a>
            </div>
          </div>
        ) : url ? (
          <iframe title={docTitle} src={url} className="w-full h-full border-0" data-testid="pdf-frame" />
        ) : (
          <div className="h-full grid place-items-center text-sm text-muted"><span className="inline-flex items-center gap-2"><Loader2 size={16} className="animate-spin" />Priprema {docName}…</span></div>
        )}
      </div>
      )}
    </Modal>
  );
}
