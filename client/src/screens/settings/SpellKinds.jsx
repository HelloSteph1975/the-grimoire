import { useCallback, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '../../components/Button.jsx';
import { LoadState } from '../../components/LoadState.jsx';
import { useToast } from '../../components/ToastProvider.jsx';
import { useResource } from '../../lib/useResource.js';
import { api } from '../../lib/api.js';
import { errorText } from '../../lib/errors.js';
import { useReorder } from '../../lib/useReorder.js';
import { ReorderButtons } from '../../components/ReorderButtons.jsx';
import { useConfirm } from '../../components/ConfirmProvider.jsx';
import { useT } from '../../i18n/I18nProvider.jsx';
import { SpellKindDialog } from './SpellKindDialog.jsx';

export function SpellKinds() {
  const { t, tc } = useT();
  const toast = useToast();
  const confirm = useConfirm();
  const list = useResource('/api/spell-kinds');
  const [editing, setEditing] = useState(null); // null: closed, 'new', or a row

  const onSave = useCallback((values, version) => list.act(() => (editing === 'new'
    ? api.post('/api/spell-kinds', values)
    : api.patch(`/api/spell-kinds/${editing.id}`, { ...values, version }))), [list, editing]);

  const move = useReorder(list, '/api/spell-kinds');
  const nameOf = row => tc(row.is_starter ? row.starter_key : null, 'name', row.name);
  const remove = async row => {
    try {
      const { spells } = await api.get(`/api/spell-kinds/${row.id}/usage`);
      const name = nameOf(row);
      const title = spells > 0 ? t('kinds.deleteInUse', { name, n: spells }) : t('kinds.deleteTitle', { name });
      if (!await confirm({ title, confirmLabel: t('common.delete'), danger: true })) return;
      await list.act(() => api.del(`/api/spell-kinds/${row.id}`));
      toast.show({
        message: t('kinds.deleted', { name }),
        action: { label: t('common.undo'), onClick: async () => {
            try { await list.act(() => api.post(`/api/spell-kinds/${row.id}/restore`)); } catch (err) { toast.show({ message: errorText(err, t) }); }
          } },
        duration: 8000,
      });
    } catch (err) {
      toast.show({ message: errorText(err, t) });
    }
  };

  return (
    <section>
      <div className="page-header">
        <h2>{t('kinds.title')}</h2>
        <Button icon={Plus} onClick={() => setEditing('new')}>{t('kinds.add')}</Button>
      </div>
      <LoadState loading={list.loading && !list.data} error={list.error} keepChildren={Boolean(list.data)} onRetry={list.reload}>
        {list.data?.length === 0 && <p className="muted">{t('kinds.empty')}</p>}
        <ul className="list">
          {list.data?.map((row, i) => (
            <li key={row.id}>
              <span className="grow">
                <strong>{nameOf(row)}</strong>
                {row.is_starter === 1 && <> <span className="tag">{t('common.starter')}</span></>}
              </span>
              <ReorderButtons index={i} count={list.data.length} onMove={move} label={nameOf(row)} />
              <Button size="sm" variant="ghost" onClick={() => setEditing(row)}>{t('common.edit')}</Button>
              <Button size="sm" variant="ghost" onClick={() => remove(row)}>{t('common.delete')}</Button>
            </li>
          ))}
        </ul>
      </LoadState>
      {editing && <SpellKindDialog key={editing === 'new' ? 'new' : editing.id} record={editing === 'new' ? null : editing} onSave={onSave} onClose={() => setEditing(null)} />}
    </section>
  );
}
