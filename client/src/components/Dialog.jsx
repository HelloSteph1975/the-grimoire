import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import { useT } from '../i18n/I18nProvider.jsx';

export function Dialog({ open, onClose, title, children, footer, wide = false }) {
  const { t } = useT();
  const ref = useRef();
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      if (typeof d.showModal === 'function') d.showModal();
      else d.setAttribute('open', '');
      // Browsers can't focus a button inside a closed dialog, so pick the starting focus here.
      d.querySelector('[data-autofocus]')?.focus();
    }
    if (!open && d.open) {
      if (typeof d.close === 'function') d.close();
      else d.removeAttribute('open');
    }
  }, [open]);
  return (
    <dialog ref={ref} className={`dialog${wide ? ' dialog-wide' : ''}`} onCancel={e => { e.preventDefault(); onClose(); }} aria-labelledby={titleId}>
      {open && (
        <>
          <header className="dialog-head">
            <h2 id={titleId}>{title}</h2>
            <button type="button" className="icon-btn" onClick={onClose} aria-label={t('common.close')}><X size={20} /></button>
          </header>
          <div className="dialog-body">{children}</div>
          {footer && <footer className="dialog-foot">{footer}</footer>}
        </>
      )}
    </dialog>
  );
}
