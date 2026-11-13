import { Download, ExternalLink, FileText, Loader2, Maximize2, Minimize2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { AppSettings, Customer, Material, Project } from '../../domain/models/types';
import { downloadBlob, safeFilename } from '../../services/exports';
import { buildQuotePdfBlob } from '../../services/pdf';
import { buildCuttingList, cutOptions } from '../../domain/pricing/cutting';
import { useAppStore } from '../../store/useAppStore';
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
export function PdfPreviewModal({ project, customer, materials, settings, onClose, kind = 'quote', askOffcuts = false }: {
  project: Project; customer: Customer | null; materials: Material[]; settings: AppSettings; onClose: () => void;
  /** vrsta dokumenta: ponuda (podrazumevano) ili krojna lista */
  kind?: 'quote' | 'cutlist' | 'workorder';
  /** krojna lista: pre PDF-a se prvo pita ima li ostataka materijala (unos ručno ili iz magacina) */
  askOffcuts?: boolean;
}) {
  const cutlist = kind === 'cutlist';
  const workorder = kind === 'workorder';
  const docName = workorder ? 'radnog naloga' : cutlist ? 'krojne liste' : 'ponude';
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [full, setFull] = useState(false);
  const embed = canEmbedPdf();
  const patchProject = useAppStore((s) => s.patchProject);
  // korak pre krojne liste: ostaci materijala; PDF se pravi tek posle potvrde
  const opts = cutOptions(settings);
  const cutProfiles = useMemo(() => (cutlist && askOffcuts ? buildCuttingList(project, settings.modelSpecs, materials, opts) : null), [cutlist, askOffcuts, project, settings.modelSpecs, materials, opts.stockMm, opts.kerfMm]); // eslint-disable-line react-hooks/exhaustive-deps
  const [ready, setReady] = useState(!(cutlist && askOffcuts));
  const offcutsStep = !ready && !!cutProfiles && cutProfiles.totals.pieces > 0;
  useEffect(() => { if (!ready && cutProfiles && cutProfiles.totals.pieces === 0) setReady(true); }, [ready, cutProfiles]);

  useEffect(() => {
    if (!ready) return;
    let alive = true;
    let objectUrl: string | null = null;
    (workorder ? import('../../services/pdfWorkorder').then((m) => m.buildWorkorderPdfBlob(project, customer, materials, settings)) : cutlist ? import('../../services/pdfCutlist').then((m) => m.buildCutlistPdfBlob(project, customer, materials, settings)) : buildQuotePdfBlob(project, customer, materials, settings))
      .then((b) => {
        if (!alive) return;
        objectUrl = URL.createObjectURL(b);
        setBlob(b);
        setUrl(objectUrl);
      })
      .catch((e: Error) => { if (alive) setError(`PDF nije generisan: ${e.message}`); });
    return () => { alive = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const save = () => { if (blob) downloadBlob(blob, workorder ? `radni-nalog_${safeFilename(project.name)}.pdf` : cutlist ? `krojna-lista_${safeFilename(project.name)}.pdf` : `ponuda_${safeFilename(project.quoteNo || project.name)}.pdf`); };

  return (
    <Modal
      title={workorder ? 'Pregled radnog naloga' : cutlist ? 'Pregled krojne liste' : `Pregled ponude${project.quoteNo ? ` ${project.quoteNo}` : ''}`}
      width={900}
      fullscreen={full}
      onClose={onClose}
      headerActions={<button className="btn btn-icon" aria-label={full ? 'Smanji prikaz' : 'Prikaži preko celog ekrana'} title={full ? 'Smanji prikaz' : 'Preko celog ekrana'} aria-pressed={full} onClick={() => setFull((f) => !f)} data-testid="pdf-fullscreen">{full ? <Minimize2 size={18} /> : <Maximize2 size={18} />}</button>}
      footer={
        <div className="flex justify-end gap-2 w-full">
          <button className="btn" onClick={onClose} data-testid="pdf-close">Zatvori</button>
          {offcutsStep
            ? <button className="btn btn-primary" onClick={() => setReady(true)} disabled={project.offcuts === undefined} data-testid="offcuts-continue"><FileText size={16} />Prikaži krojnu listu</button>
            : <button className="btn btn-primary" onClick={save} disabled={!blob} data-testid="pdf-save"><Download size={16} />Sačuvaj PDF</button>}
        </div>
      }
    >
      {offcutsStep ? (
        <div data-testid="offcuts-step">
          <OffcutsPanel project={project} materials={materials} stock={settings.stock ?? []} profiles={cutProfiles!.profiles.map((p) => p.profile)} onChange={(offcuts) => patchProject(project.id, { offcuts })} />
          {project.offcuts !== undefined && <p className="text-sm text-muted">Kad završite unos ostataka, kliknite „Prikaži krojnu listu".</p>}
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
          <iframe title={workorder ? 'Pregled radnog naloga' : cutlist ? 'Pregled krojne liste' : 'Pregled ponude'} src={url} className="w-full h-full border-0" data-testid="pdf-frame" />
        ) : (
          <div className="h-full grid place-items-center text-sm text-muted"><span className="inline-flex items-center gap-2"><Loader2 size={16} className="animate-spin" />Priprema {docName}…</span></div>
        )}
      </div>
      )}
    </Modal>
  );
}
