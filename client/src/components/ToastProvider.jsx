import { createContext, useCallback, useContext, useRef, useState } from 'react';

const Ctx = createContext(null);
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const timer = useRef();
  const show = useCallback(({ message, action, duration = 4000 }) => {
    clearTimeout(timer.current);
    setToast({ message, action, key: Date.now() });
    timer.current = setTimeout(() => setToast(null), duration);
  }, []);
  return (
    <Ctx.Provider value={{ show }}>
      {children}
      <div className="toast-region" role="status" aria-live="polite">
        {toast && (
          <div className="toast" key={toast.key}>
            <span>{toast.message}</span>
            {toast.action && (
              <button className="toast-action" onClick={() => { setToast(null); toast.action.onClick(); }}>
                {toast.action.label}
              </button>
            )}
          </div>
        )}
      </div>
    </Ctx.Provider>
  );
}
