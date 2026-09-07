import { ReactNode, useEffect, useRef } from 'react';
import { X } from 'lucide-react';

export function Sheet({ children, titleId, onClose, closeLabel = 'Close', busy = false }: {
  children: ReactNode; titleId: string; onClose: () => void; closeLabel?: string; busy?: boolean;
}) {
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.focus();
    return () => { document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  return <div className="sheet-backdrop">
    <section ref={panel} tabIndex={-1} className="sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={event => {
      if (event.key === 'Escape' && !busy) { event.stopPropagation(); onClose(); }
      if (event.key !== 'Tab') return;
      const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), summary, [tabindex="0"]'))
        .filter(element => element.getClientRects().length && !element.closest('details:not([open]) :not(summary)'));
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}>
      <button className="sheet__close" type="button" disabled={busy} onClick={onClose} aria-label={closeLabel}><X size={20} /><span>{closeLabel}</span></button>
      {children}
    </section>
  </div>;
}
