import { Download, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { AppSettings, Customer, Material, Project } from '../../domain/models/types';
import { downloadBlob, safeFilename } from '../../services/exports';
import { buildQuotePdfBlob } from '../../services/pdf';
import { Modal } from '../ui/Modal';

/** Pregled ponude pre čuvanja: PDF se prvo prikaže, a tek „Sačuvaj PDF" ga preuzima. */
export function PdfPreviewModal({ project, customer, materials, settings, onClose }: {
  project: Project; customer: Customer | null; materials: Material[]; settings: AppSettings; onClose: () => void;
}) {
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    let objectUrl: string | null = null;
    buildQuotePdfBlob(project, customer, materials, settings)
      .then((b) => {
        if (!alive) return;
        objectUrl = URL.createObjectURL(b);
        setBlob(b);
        setUrl(objectUrl);
      })
      .catch((e: Error) => { if (alive) setError(`PDF nije generisan: ${e.message}`); });
    return () => { alive = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = () => { if (blob) downloadBlob(blob, `ponuda_${safeFilename(project.quoteNo || project.name)}.pdf`); };

  return (
    <Modal
      title={`Pregled ponude${project.quoteNo ? ` ${project.quoteNo}` : ''}`}
      width={900}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2 w-full">
          <button className="btn" onClick={onClose} data-testid="pdf-close">Zatvori</button>
          <button className="btn btn-primary" onClick={save} disabled={!blob} data-testid="pdf-save"><Download size={16} />Sačuvaj PDF</button>
        </div>
      }
    >
      <div className="h-[68vh] min-h-[320px] bg-slate-100 rounded-lg overflow-hidden" data-testid="pdf-preview">
        {error ? (
          <div className="h-full grid place-items-center text-sm text-[#b42318] p-4" role="alert">{error}</div>
        ) : url ? (
          <iframe title="Pregled ponude" src={url} className="w-full h-full border-0" data-testid="pdf-frame" />
        ) : (
          <div className="h-full grid place-items-center text-sm text-muted"><span className="inline-flex items-center gap-2"><Loader2 size={16} className="animate-spin" />Priprema ponude…</span></div>
        )}
      </div>
    </Modal>
  );
}
