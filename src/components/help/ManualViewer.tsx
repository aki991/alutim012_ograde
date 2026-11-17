import { AlertTriangle, Download, Lightbulb, Loader2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { MANUAL, MANUAL_DATE, MANUAL_SUBTITLE, MANUAL_TITLE, manualRuns, type ManualBlock } from '../../data/userManual';
import { useAppStore } from '../../store/useAppStore';
import { Modal } from '../ui/Modal';

/** Tekst sa podebljanim delovima (**tekst**). */
function Rich({ text }: { text: string }) {
  return <>{manualRuns(text).map((r, i) => (r.bold ? <b key={i}>{r.text}</b> : <span key={i}>{r.text}</span>))}</>;
}

function Block({ b }: { b: ManualBlock }) {
  if ('p' in b) return <p className="text-[14px] leading-relaxed text-slate-700 mb-3"><Rich text={b.p} /></p>;
  if ('steps' in b) return <ol className="list-decimal pl-6 space-y-1.5 text-[14px] text-slate-700 mb-3">{b.steps.map((s, i) => <li key={i}><Rich text={s} /></li>)}</ol>;
  if ('list' in b) return <ul className="list-disc pl-6 space-y-1.5 text-[14px] text-slate-700 mb-3">{b.list.map((s, i) => <li key={i}><Rich text={s} /></li>)}</ul>;
  const tip = 'tip' in b;
  return (
    <div className={`flex gap-2.5 rounded-lg border px-3 py-2.5 text-[13.5px] mb-3 ${tip ? 'bg-[#ecfdf3] border-[#abefc6] text-[#0f5132]' : 'bg-[#fff7ed] border-[#fed7aa] text-[#7a2e0e]'}`}>
      {tip ? <Lightbulb size={17} className="shrink-0 mt-0.5" /> : <AlertTriangle size={17} className="shrink-0 mt-0.5" />}
      <span><Rich text={tip ? b.tip : b.warn} /></span>
    </div>
  );
}

/** Dugme za preuzimanje uputstva kao PDF (isti tekst kao pregled). */
export function ManualDownloadButton({ className = 'btn' }: { className?: string }) {
  const settings = useAppStore((s) => s.settings);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const download = async () => {
    setBusy(true); setError(null);
    try { const { downloadManualPdf } = await import('../../services/pdfManual'); await downloadManualPdf(settings); } catch (e) { setError((e as Error).message || 'PDF nije napravljen.'); } finally { setBusy(false); }
  };
  return (
    <>
      <button className={className} data-testid="manual-download" disabled={busy} onClick={() => void download()}>{busy ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}Preuzmi PDF</button>
      {error && <span role="alert" className="text-[12.5px] text-[#b42318]">{error}</span>}
    </>
  );
}

/** Pregled uputstva za upotrebu: sadržaj levo (klik vodi na poglavlje), poglavlja desno. */
export function ManualViewer({ onClose }: { onClose: () => void }) {
  const body = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(MANUAL[0].id);
  const go = (id: string) => { setActive(id); body.current?.querySelector(`#uputstvo-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  return (
    <Modal title={MANUAL_TITLE} fullscreen onClose={onClose} headerActions={<ManualDownloadButton className="btn btn-sm" />}>
      <div className="flex gap-6 min-h-0" data-testid="manual-viewer">
        <nav className="hidden md:block w-[250px] shrink-0 sticky top-0 self-start max-h-[calc(100vh-140px)] overflow-y-auto scroll-thin" aria-label="Sadržaj uputstva">
          <div className="text-[12px] font-semibold uppercase tracking-wide text-muted mb-2">Sadržaj</div>
          <ol className="space-y-0.5">
            {MANUAL.map((ch, i) => (
              <li key={ch.id}>
                <button className={`w-full text-left text-[13.5px] px-2 py-1.5 rounded-md hover:bg-slate-100 ${active === ch.id ? 'bg-primary-50 text-primary font-semibold' : 'text-slate-700'}`} onClick={() => go(ch.id)}>{i + 1}. {ch.title}</button>
              </li>
            ))}
          </ol>
        </nav>
        <div ref={body} className="min-w-0 flex-1 max-w-[860px]">
          <header className="mb-6">
            <h1 className="text-[26px] font-extrabold tracking-tight">{MANUAL_TITLE}</h1>
            <p className="text-slate-600">{MANUAL_SUBTITLE} · izdanje {MANUAL_DATE}</p>
          </header>
          {MANUAL.map((ch, i) => (
            <section key={ch.id} id={`uputstvo-${ch.id}`} className="scroll-mt-4 mb-10" data-testid="manual-chapter">
              <h2 className="text-[21px] font-bold border-b-2 border-primary pb-1 mb-3">{i + 1}. {ch.title}</h2>
              {ch.intro && <p className="text-[14px] italic text-slate-600 mb-4"><Rich text={ch.intro} /></p>}
              {ch.sections.map((sec, j) => (
                <div key={sec.title} className="mb-5">
                  <h3 className="text-[16px] font-semibold mb-2">{i + 1}.{j + 1} {sec.title}</h3>
                  {sec.blocks.map((b, k) => <Block key={k} b={b} />)}
                </div>
              ))}
            </section>
          ))}
        </div>
      </div>
    </Modal>
  );
}
