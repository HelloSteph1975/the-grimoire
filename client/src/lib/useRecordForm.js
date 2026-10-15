import { useCallback, useRef, useState } from 'react';
import { useLeaveGuard } from './useLeaveGuard.js';

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function useRecordForm({ initial, submit }) {
  const [values, setValues] = useState(initial);
  const [baseline, setBaseline] = useState(initial);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(null);
  const busy = useRef(false);
  const dirty = !same(values, baseline);
  const markSaved = useLeaveGuard(dirty);

  const set = useCallback((key, value) => setValues(v => ({ ...v, [key]: value })), []);
  const setAll = useCallback(next => { setValues(next); setBaseline(next); }, []);

  const run = useCallback(async version => {
    if (busy.current) return null;
    busy.current = true;
    setSaving(true);
    setErrors({});
    setFormError(null);
    try {
      const saved = await submit(values, { version });
      setBaseline(values);
      markSaved();
      setConflict(null);
      return saved;
    } catch (err) {
      if (err.status === 409 && err.current) setConflict(err.current);
      else if (err.status === 400 && err.details && Object.keys(err.details).length) setErrors(err.details);
      else setFormError(err.message);
      return null;
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }, [submit, values, markSaved]);

  const onSubmit = useCallback(e => { e?.preventDefault?.(); return run(undefined); }, [run]);
  const keepMine = useCallback(() => run(conflict?.version), [run, conflict]);
  const takeTheirs = useCallback(pick => { setAll(pick(conflict)); setConflict(null); }, [conflict, setAll]);

  const dismissConflict = useCallback(() => setConflict(null), []);

  return { dismissConflict, values, set, setAll, dirty, errors, formError, saving, conflict, onSubmit, keepMine, takeTheirs, markSaved };
}
