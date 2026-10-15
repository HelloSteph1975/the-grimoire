import { useCallback, useRef, useState } from 'react';
import { useLeaveGuard } from './useLeaveGuard.js';
import { errorText, fieldErrors } from './errors.js';
import { useT } from '../i18n/I18nProvider.jsx';

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function useRecordForm({ initial, submit }) {
  const { t } = useT();
  const [values, setValues] = useState(initial);
  const [baseline, setBaseline] = useState(initial);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(null);
  const busy = useRef(false);
  // The newest values and baseline, readable after an await (state in the closure would be stale).
  const latest = useRef(initial);
  const saved = useRef(initial);
  const dirty = !same(values, baseline);
  const markSaved = useLeaveGuard(dirty);

  const set = useCallback((key, value) => setValues(v => { latest.current = { ...v, [key]: value }; return latest.current; }), []);
  const setAll = useCallback(next => { latest.current = next; saved.current = next; setValues(next); setBaseline(next); }, []);
  // True when the form holds changes that are not saved, including ones typed during a save.
  const isDirtyNow = useCallback(() => !same(latest.current, saved.current), []);

  const run = useCallback(async version => {
    if (busy.current) return null;
    busy.current = true;
    setSaving(true);
    setErrors({});
    setFormError(null);
    try {
      const out = await submit(values, { version });
      saved.current = values;
      setBaseline(values);
      // Edits made while the save was in flight are not saved, so the leave guard stays on.
      if (!isDirtyNow()) markSaved();
      setConflict(null);
      return out;
    } catch (err) {
      if (err.status === 409 && err.current) setConflict(err.current);
      else if (err.status === 400 && err.details && Object.keys(err.details).length) setErrors(fieldErrors(err, t));
      else setFormError(errorText(err, t));
      return null;
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }, [submit, values, markSaved, isDirtyNow, t]);

  const onSubmit = useCallback(e => { e?.preventDefault?.(); return run(undefined); }, [run]);
  const keepMine = useCallback(() => run(conflict?.version), [run, conflict]);
  const takeTheirs = useCallback(pick => { setAll(pick(conflict)); setConflict(null); }, [conflict, setAll]);

  const dismissConflict = useCallback(() => setConflict(null), []);

  return { dismissConflict, values, set, setAll, dirty, errors, formError, saving, conflict, onSubmit, keepMine, takeTheirs, markSaved, isDirtyNow };
}
