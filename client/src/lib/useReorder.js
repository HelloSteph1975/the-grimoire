import { useCallback } from 'react';
import { api } from './api.js';
import { errorText } from './errors.js';
import { useToast } from '../components/ToastProvider.jsx';
import { useT } from '../i18n/I18nProvider.jsx';

export function useReorder(list, url) {
  const toast = useToast();
  const { t } = useT();
  return useCallback(async (index, delta) => {
    const rows = [...(list.data ?? [])];
    const to = index + delta;
    if (to < 0 || to >= rows.length) return;
    [rows[index], rows[to]] = [rows[to], rows[index]];
    try {
      await list.act(() => api.post(`${url}/reorder`, { items: rows.map(r => ({ id: r.id, version: r.version })) }));
    } catch (err) {
      toast.show({ message: errorText(err, t) });
      list.reload(); // a failed save does not reload by itself
    }
  }, [list, url, toast, t]);
}
