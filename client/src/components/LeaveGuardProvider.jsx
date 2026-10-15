import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useBlocker } from 'react-router-dom';
import { useConfirm } from './ConfirmProvider.jsx';
import { useT } from '../i18n/I18nProvider.jsx';

const Ctx = createContext(null);
export const useLeaveGuardRegistry = () => useContext(Ctx);

// Owns the app's only navigation blocker and only beforeunload listener. React Router consults
// just the most recent useBlocker, so forms register here instead of blocking on their own.
// Leaving is blocked while any registered form is dirty and not marked saved.
export function LeaveGuardProvider({ children }) {
  const confirm = useConfirm();
  const { t } = useT();
  const sources = useRef(new Map());
  const [blocking, setBlocking] = useState(false);

  const isBlocking = useCallback(() => [...sources.current.values()].some(s => s.dirty && !s.saved), []);
  const refresh = useCallback(() => setBlocking(isBlocking()), [isBlocking]);

  const registry = useMemo(() => ({
    // A form that turns dirty again needs saving again.
    set(id, dirty) {
      const prev = sources.current.get(id);
      sources.current.set(id, { dirty, saved: dirty ? false : (prev?.saved ?? false) });
      refresh();
    },
    markSaved(id) {
      const prev = sources.current.get(id) ?? { dirty: false };
      sources.current.set(id, { ...prev, saved: true });
      refresh();
    },
    remove(id) {
      sources.current.delete(id);
      refresh();
    },
  }), [refresh]);

  const blocker = useBlocker(isBlocking);
  const asking = useRef(false);
  useEffect(() => {
    if (blocker.state !== 'blocked' || asking.current) return;
    asking.current = true;
    confirm({ title: t('leave.title'), body: t('leave.body'), confirmLabel: t('leave.confirm'), danger: true })
      .then(ok => {
        asking.current = false;
        if (ok) blocker.proceed(); else blocker.reset();
      });
  }, [blocker, confirm, t]);

  useEffect(() => {
    if (!blocking) return undefined;
    const onBeforeUnload = e => {
      if (!isBlocking()) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [blocking, isBlocking]);

  return <Ctx.Provider value={registry}>{children}</Ctx.Provider>;
}
