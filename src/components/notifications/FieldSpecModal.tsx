import { Download, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { fetchFieldSpecLinks, fmtDateTime, SPEC_STATUS_LABELS, type FieldSpec, type FieldSpecLinks } from '../../services/fieldSpecs';
import { useAuth } from '../../services/auth';
import { fmtNum } from '../../utils/units';
import { Modal } from '../ui/Modal';

const fmtSize = (b: number | null) => (b === null ? '' : b >= 1_048_576 ? `${fmtNum(b / 1_048_576, 1)} MB` : `${fmtNum(b / 1024, 0)} KB`);

export const specAmount = (s: FieldSpec): string => (s.totalAmount === null ? 'bez cene' : `${fmtNum(s.totalAmount, 2)} ${s.currency === 'EUR' ? '€' : s.currency}`);

/** Pregled specifikacije koju su poslali radnici sa terena: PDF u prozoru i preuzimanje. Linkovi ka PDF-u su privremeni i izdaje ih server. */
export function FieldSpecModal({ spec, onClose }: { spec: FieldSpec; onClose: () => void }) {
  const auth = useAuth();
  const [links, setLinks] = useState<FieldSpecLinks | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    let objectUrl: string | null = null;
    (async () => {
      try {
        const token = await auth.getToken();
        if (!token) throw new Error('Prijava je istekla. Prijavite se ponovo.');
        const l = await fetchFieldSpecLinks(token, spec.id);
        if (!alive) return;
        setLinks(l);
        // PDF se učitava u pregledaču i prikazuje iz lokalnog objekta (direktan link iz skladišta ne može u okvir zbog zaštite)
        const res = await fetch(l.viewUrl);
        if (!res.ok) throw new Error('PDF nije mogao da se učita. Pokušajte da ga preuzmete.');
        const blob = new Blob([await res.arrayBuffer()], { type: 'application/pdf' });
        if (!alive) return;
        objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'PDF nije dostupan.');
      }
    })();
    return () => { alive = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec.id]);

  const item = links?.item ?? spec;
  const downloadHref = blobUrl ?? links?.downloadUrl ?? null;
  return (
    <Modal
      title="Specifikacija sa terena"
      width={960}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2 w-full">
          <button className="btn" onClick={onClose} data-testid="spec-close">Zatvori</button>
          {downloadHref ? (
            <a className="btn btn-primary" href={downloadHref} download={item.fileName} data-testid="spec-download"><Download size={16} />Preuzmi PDF</a>
          ) : (
            <button className="btn btn-primary" disabled data-testid="spec-download"><Download size={16} />Preuzmi PDF</button>
          )}
        </div>
      }
    >
      <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2 text-[13px] mb-3" data-testid="spec-meta">
        <div><dt className="text-muted">Kupac</dt><dd className="font-semibold">{item.customerName || '—'}</dd></div>
        <div><dt className="text-muted">Majstor</dt><dd className="font-semibold">{item.technician || '—'}</dd></div>
        <div><dt className="text-muted">Pozicija</dt><dd className="font-semibold">{item.positionCount}</dd></div>
        <div>
          <dt className="text-muted">Okvirna cena</dt>
          <dd className="font-semibold">{specAmount(item)}{item.hasUnpriced && <span className="ml-1.5 text-[11.5px] font-medium text-[#b45309]">ima pozicija bez cene</span>}</dd>
        </div>
        <div><dt className="text-muted">Stiglo</dt><dd>{fmtDateTime(item.createdAt)}</dd></div>
        <div><dt className="text-muted">Status</dt><dd>{SPEC_STATUS_LABELS[item.status] ?? item.status}</dd></div>
        <div><dt className="text-muted">Fajl</dt><dd className="truncate" title={item.fileName}>{item.fileName}{item.fileSize !== null ? ` · ${fmtSize(item.fileSize)}` : ''}</dd></div>
      </dl>
      <div className="h-[62vh] min-h-[300px] bg-slate-100 rounded-lg overflow-hidden" data-testid="spec-preview">
        {error ? (
          <div className="h-full grid place-items-center text-sm text-[#b42318] p-4 text-center" role="alert" data-testid="spec-error">{error}</div>
        ) : blobUrl ? (
          <iframe title="Specifikacija sa terena" src={blobUrl} className="w-full h-full border-0" data-testid="spec-frame" />
        ) : (
          <div className="h-full grid place-items-center text-sm text-muted"><span className="inline-flex items-center gap-2"><Loader2 size={16} className="animate-spin" />Učitavanje specifikacije…</span></div>
        )}
      </div>
    </Modal>
  );
}
