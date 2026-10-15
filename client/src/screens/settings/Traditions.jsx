import { useCallback, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '../../components/Button.jsx';
import { LoadState } from '../../components/LoadState.jsx';
import { useToast } from '../../components/ToastProvider.jsx';
import { useResource } from '../../lib/useResource.js';
import { api } from '../../lib/api.js';
import { useT } from '../../i18n/I18nProvider.jsx';
import { TraditionDialog } from './TraditionDialog.jsx';

export function Traditions() {
  const { t, tc } = useT();
  const toast = useToast();
  const list = useResource('/api/traditions');
  const [editing, setEditing] = useState(null); // null: closed, 'new', or a row

  const onSave = useCallback((values, version) => list.act(() => (editing === 'new'
    ? api.post('/api/traditions', values)
    : api.patch(`/api/traditions/${editing.id}`, { ...values, version }))), [list, editing]);

  const nameOf = row => tc(row.is_starter ? row.starter_key : null, 'name', row.name);
  const remove = async row => {
    try {
      await list.act(() => api.del(`/api/traditions/${row.id}`));
      toast.show({
        message: t('traditions.deleted', { name: nameOf(row) }),
        action: { label: t('common.undo'), onClick: async () => {
            try { await list.act(() => api.post(`/api/traditions/${row.id}/restore`)); } catch (err) { toast.show({ message: err.message }); }
          } },
        duration: 8000,
      });
    } catch (err) {
      toast.show({ message: err.message });
    }
  };

  return (
    <section>
      <div className="page-header">
        <h2>{t('traditions.title')}</h2>
        <Button icon={Plus} onClick={() => setEditing('new')}>{t('traditions.add')}</Button>
      </div>
      <LoadState loading={list.loading && !list.data} error={list.error} onRetry={list.reload}>
        {list.data?.length === 0 && <p className="muted">{t('traditions.empty')}</p>}
        <ul className="list">
          {list.data?.map(row => (
            <li key={row.id}>
              <span className="swatch" style={{ background: row.color ?? 'transparent' }} aria-hidden="true" />
              <span className="grow">
                <strong>{nameOf(row)}</strong>
                {row.is_starter === 1 && <> <span className="tag">{t('common.starter')}</span></>}
                {row.description && <><br /><span className="muted">{tc(row.is_starter ? row.starter_key : null, 'description', row.description)}</span></>}
              </span>
              <Button size="sm" variant="ghost" onClick={() => setEditing(row)}>{t('common.edit')}</Button>
              <Button size="sm" variant="ghost" onClick={() => remove(row)}>{t('common.delete')}</Button>
            </li>
          ))}
        </ul>
      </LoadState>
      {editing && <TraditionDialog key={editing === 'new' ? 'new' : editing.id} record={editing === 'new' ? null : editing} onSave={onSave} onClose={() => setEditing(null)} />}
    </section>
  );
}
