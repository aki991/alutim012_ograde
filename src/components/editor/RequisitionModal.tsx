import { Download, Printer, RotateCcw } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { AppSettings, Customer, Material, Project } from '../../domain/models/types';
import { cutOptions } from '../../domain/pricing/cutting';
import { buildRequisition, resetRequisition, setRequisitionQty, type RequisitionLine } from '../../domain/pricing/requisition';
import { STATUS_LABELS } from '../../domain/models/catalog';
import { fmtDate } from '../../utils/units';
import { downloadBlob, safeFilename } from '../../services/exports';
import { useAppStore } from '../../store/useAppStore';
import { Modal } from '../ui/Modal';

const fmt = (n: number): string => String(Math.round(n * 100) / 100).replace('.', ',');

/** Polje količine: menja se kucanjem, a upisuje u projekat na Enter ili kad polje izgubi fokus. */
function QtyInput({ line, onCommit }: { line: RequisitionLine; onCommit: (v: number) => void }) {
  const [text, setText] = useState<string | null>(null);
  const commit = () => {
    if (text === null) return;
    const v = Number(text.replace(',', '.'));
    setText(null);
    if (Number.isFinite(v) && v >= 0 && v !== line.qty) onCommit(v);
  };
  return (
    <input className={`input !w-24 !py-1 text-right tabular-nums ${line.edited ? '!border-primary font-semibold' : ''}`} type="text" inputMode="decimal" aria-label={`Količina: ${line.name}`} data-testid={`req-qty-${line.key}`}
      value={text ?? fmt(line.qty)} onChange={(e) => setText(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); } else if (e.key === 'Escape') setText(null); }} />
  );
}

/**
 * Trebovanje materijala: sav materijal iz sastavnica projekta, profili u celim šipkama (koliko traži krojna lista). Svaka količina
 * može da se promeni pre štampe; izmene se čuvaju uz projekat, a „Vrati početne vrednosti“ vraća izračunate količine.
 */
export function RequisitionModal({ project, customer, materials, settings, onClose }: { project: Project; customer: Customer | null; materials: Material[]; settings: AppSettings; onClose: () => void }) {
  const req = useMemo(() => buildRequisition(project, materials, settings.modelSpecs, cutOptions(settings)), [project, materials, settings]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const st = useAppStore.getState();
  const anyEdited = req.groups.some((g) => g.lines.some((l) => l.edited));
  const setQty = (l: RequisitionLine, v: number | null) => st.mutate((p) => setRequisitionQty(p, l.key, v === null || v === l.calc ? null : v), `req:${l.key}`);
  const pdf = async (mode: 'download' | 'print') => {
    setBusy(true); setError(null);
    // za štampu se prozor otvara odmah (pre čekanja na PDF), inače ga pregledač blokira kao iskačući prozor
    const win = mode === 'print' ? window.open('', '_blank') : null;
    try {
      const { buildRequisitionPdfBlob } = await import('../../services/pdfRequisition');
      const blob = await buildRequisitionPdfBlob(project, customer, req, settings);
      if (mode === 'download' || !win) downloadBlob(blob, `trebovanje_${safeFilename(project.quoteNo || project.name)}.pdf`);
      else win.location.href = URL.createObjectURL(blob);
    } catch (e) {
      win?.close();
      setError(`PDF nije napravljen: ${(e as Error).message}`);
    } finally { setBusy(false); }
  };
  const lines = req.groups.flatMap((g) => g.lines).filter((l) => l.qty > 0);
  const bars = lines.filter((l) => l.unit === 'šipka');
  const info = settings.companyInfo ?? {};
  const contact = [info.address, info.phone, info.email, info.pib ? `PIB: ${info.pib}` : ''].filter(Boolean).join('  ·  ');
  const count = req.groups.reduce((n, g) => n + g.lines.length, 0);
  return (
    <Modal title="Trebovanje materijala" width={1040} onClose={onClose}
      footer={
        <div className="flex flex-wrap items-center gap-2 w-full">
          <button className="btn" data-testid="req-reset" disabled={!anyEdited} onClick={() => st.mutate((p) => resetRequisition(p), 'req-reset')}><RotateCcw size={16} />Vrati početne vrednosti</button>
          <span className="flex-1" />
          <button className="btn" data-testid="req-download" disabled={busy || count === 0} onClick={() => pdf('download')}><Download size={16} />Sačuvaj PDF</button>
          <button className="btn btn-primary" data-testid="req-print" disabled={busy || count === 0} onClick={() => pdf('print')}><Printer size={16} />Štampaj</button>
        </div>
      }>
      <div data-testid="requisition" className="bg-white text-ink border border-line rounded-md p-5">
        {/* pregled PDF-a: isto zaglavlje, traka, podaci i kartice kao krojna lista; količine se menjaju u tabeli */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[20px] font-extrabold tracking-wide">TREBOVANJE</div>
            <div className="text-[12px] text-muted">Ponuda: {project.quoteNo || '—'} · {fmtDate(new Date().toISOString())}</div>
          </div>
          <div className="text-right">
            <div className="font-bold text-[14px]">{settings.companyName}</div>
            {contact && <div className="text-[11px] text-muted">{contact}</div>}
          </div>
        </div>
        <div className="h-[3px] bg-primary my-3" />
        <div className="grid grid-cols-2 md:grid-cols-5 gap-x-4 gap-y-2 bg-slate-50 rounded px-3 py-2 mb-3">
          {[['PROJEKAT', project.name], ['KUPAC', customer ? [customer.name, customer.address].filter(Boolean).join(', ') : ''], ['STATUS', STATUS_LABELS[project.status]], ['ŠIPKA', `${req.stockMm} mm`], ['DATUM', fmtDate(new Date().toISOString())]].map(([l, v]) => (
            <div key={l}><div className="text-[10px] font-bold text-muted tracking-wide">{l}</div><div className="text-[13px] font-bold">{v || '—'}</div></div>
          ))}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 border border-line rounded mb-4">
          {[['STAVKI', String(lines.length), ''], ['VRSTA PROFILA', String(bars.length), ''], ['ŠIPKI ZA NABAVKU', fmt(bars.reduce((a, l) => a + l.qty, 0)), 'text-primary'], ['IZMENJENO RUČNO', String(lines.filter((l) => l.edited).length), '']].map(([l, v, c], i) => (
            <div key={l} className={`px-3 py-2 ${i ? 'md:border-l border-line' : ''}`}><div className="text-[10px] font-bold text-muted tracking-wide">{l}</div><div className={`text-[20px] font-bold ${c}`}>{v}</div></div>
          ))}
        </div>
        {error && <p className="text-[13px] text-[#b42318] mb-2" role="alert">{error}</p>}
        {count === 0 ? <p className="text-sm text-muted">Projekat nema materijala za trebovanje.</p> : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[10.5px] text-muted tracking-wide border-b border-line"><th className="py-1.5 px-2">NAZIV MATERIJALA</th><th className="py-1.5 pr-2 text-right">KOLIČINA</th><th className="py-1.5 pr-2">JM</th><th className="py-1.5">NAPOMENA</th><th className="w-8" /></tr></thead>
            <tbody>
              {req.groups.map((g) => [
                <tr key={`g-${g.group}`}><td colSpan={5} className="py-1 px-2 text-[13px] font-bold bg-slate-50 border-b border-line">{g.group}</td></tr>,
                ...g.lines.map((l) => (
                  <tr key={l.key} className={`border-b border-line align-middle ${l.edited ? 'bg-primary/5' : ''}`} data-testid="req-line">
                    <td className="py-2 px-2 font-semibold">{l.name}</td>
                    <td className="py-1.5 pr-2 text-right"><QtyInput line={l} onCommit={(v) => setQty(l, v)} /></td>
                    <td className="py-2 pr-2">{l.unit}</td>
                    <td className="py-2 text-[11.5px] text-muted">{[l.note ?? '', l.edited ? `izračunato ${fmt(l.calc)}` : ''].filter(Boolean).join(' · ')}</td>
                    <td className="py-1.5 w-8">{l.edited && <button className="btn btn-icon !w-7 !h-7" title={`Vrati izračunato (${fmt(l.calc)})`} aria-label="Vrati izračunatu količinu" onClick={() => setQty(l, null)}><RotateCcw size={14} /></button>}</td>
                  </tr>
                )),
              ])}
            </tbody>
          </table>
        )}
        <div className="mt-4">
          <div className="text-[12px] font-bold mb-1">Napomene</div>
          <ul className="list-disc pl-5 text-[11.5px] text-muted">
            <li>Profili se poručuju u celim šipkama od {req.stockMm} mm, prema rasporedu komada iz krojne liste.</li>
            <li>Količine su proverene i po potrebi ručno izmenjene pre štampe.</li>
            {project.notes && <li>Napomena projekta: {project.notes}</li>}
          </ul>
          <div className="flex justify-between mt-6 text-[12px]"><span>Trebovao: ________________</span><span>Odobrio: ________________</span></div>
        </div>
      </div>
    </Modal>
  );
}
