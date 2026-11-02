import { X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Modal sa jednom zonom skrolovanja (telo). Zaglavlje i podnožje su uvek vidljivi.
 * Fokus ulazi u dijalog, Tab ostaje unutra, a Escape/zatvaranje vraća fokus na prethodni element.
 */
export function Modal({ title, onClose, children, footer, width = 480 }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; width?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const root = ref.current;
    const first = root?.querySelector<HTMLElement>('[data-autofocus]') ?? root?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? root)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onCloseRef.current(); return; }
      if (e.key !== 'Tab' || !root) return;
      const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
      if (items.length === 0) return;
      const firstEl = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); firstEl.focus(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      if (previous && document.contains(previous)) previous.focus();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center p-3 sm:p-4 bg-[#0b1119]/50" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className="card w-full max-h-[94vh] flex flex-col outline-none" style={{ maxWidth: width }}>
        <div className="flex items-center justify-between px-5 pt-4 pb-2 shrink-0 border-b border-line">
          <h2 className="text-lg font-bold">{title}</h2>
          <button className="btn btn-icon" aria-label="Zatvori" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="px-5 py-4 flex-1 min-h-0 overflow-auto scroll-thin">{children}</div>
        {footer && <div className="px-5 py-3 shrink-0 border-t border-line flex flex-wrap items-center justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({ title, message, confirmLabel = 'Potvrdi', danger, onConfirm, onCancel }: { title: string; message: ReactNode; confirmLabel?: string; danger?: boolean; onConfirm: () => void; onCancel: () => void }) {
  return (
    <Modal title={title} onClose={onCancel} footer={
      <>
        <button className="btn" onClick={onCancel}>Otkaži</button>
        <button data-autofocus className={`btn ${danger ? 'btn-primary !bg-[#d92d20] !border-[#d92d20]' : 'btn-primary'}`} onClick={onConfirm}>{confirmLabel}</button>
      </>
    }>
      <div className="text-[15px] text-ink/80">{message}</div>
    </Modal>
  );
}
