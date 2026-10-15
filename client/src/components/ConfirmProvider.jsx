import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Dialog } from './Dialog.jsx';
import { Button } from './Button.jsx';
import { useT } from '../i18n/I18nProvider.jsx';

const Ctx = createContext(null);
export const useConfirm = () => useContext(Ctx);

export function ConfirmProvider({ children }) {
  const { t } = useT();
  const [req, setReq] = useState(null);
  const pending = useRef(null);
  const confirm = useCallback(opts => new Promise(resolve => {
    // A newer question replaces an unanswered one; the old caller gets "no".
    pending.current?.resolve(false);
    const next = { ...opts, resolve };
    pending.current = next;
    setReq(next);
  }), []);
  const done = ok => {
    const current = pending.current;
    pending.current = null;
    setReq(null);
    current?.resolve(ok);
  };
  return (
    <Ctx.Provider value={confirm}>
      {children}
      <Dialog open={Boolean(req)} onClose={() => done(false)} title={req?.title ?? ''}
        footer={req && (
          <>
            <Button variant="ghost" onClick={() => done(false)} data-autofocus={req.danger ? '' : undefined}>{req.cancelLabel ?? t('common.cancel')}</Button>
            <Button variant={req.danger ? 'danger' : 'primary'} onClick={() => done(true)} data-autofocus={req.danger ? undefined : ''}>{req.confirmLabel ?? t('common.ok')}</Button>
          </>
        )}>
        {req?.body && <p>{req.body}</p>}
      </Dialog>
    </Ctx.Provider>
  );
}
