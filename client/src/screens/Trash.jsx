import { Button } from '../components/Button.jsx';
import { PageHeader } from '../components/PageHeader.jsx';
import { LoadState } from '../components/LoadState.jsx';
import { useConfirm } from '../components/ConfirmProvider.jsx';
import { useToast } from '../components/ToastProvider.jsx';
import { useResource } from '../lib/useResource.js';
import { api } from '../lib/api.js';
import { useT } from '../i18n/I18nProvider.jsx';

export function Trash() {
  const { t, language } = useT();
  const confirm = useConfirm();
  const toast = useToast();
  const list = useResource('/api/trash');
  const fmt = iso => new Date(iso).toLocaleString(language, { dateStyle: 'medium', timeStyle: 'short' });
  const run = async (fn, message) => {
    try { await list.act(fn); if (message) toast.show({ message }); } catch (err) { toast.show({ message: err.message }); }
  };

  const restore = item => run(() => api.post(`/api/trash/${item.type}/${item.id}/restore`), t('trash.restored', { title: item.title }));
  const forever = async item => {
    if (!await confirm({ title: t('trash.deleteForeverTitle', { title: item.title }), body: t('trash.deleteForeverBody'), confirmLabel: t('trash.deleteForever'), danger: true })) return;
    run(() => api.del(`/api/trash/${item.type}/${item.id}`));
  };
  const emptyAll = async () => {
    if (!await confirm({ title: t('trash.emptyAllTitle'), body: t('trash.emptyAllBody'), confirmLabel: t('trash.emptyAll'), danger: true })) return;
    run(() => api.post('/api/trash/empty'));
  };

  return (
    <>
      <PageHeader title={t('trash.title')}>
        {list.data?.length > 0 && <Button variant="danger" onClick={emptyAll}>{t('trash.emptyAll')}</Button>}
      </PageHeader>
      <LoadState loading={list.loading && !list.data} error={list.error} onRetry={list.reload}>
        {list.data?.length === 0 && <p className="muted">{t('trash.empty')}</p>}
        <ul className="list">
          {list.data?.map(item => (
            <li key={`${item.type}-${item.id}`}>
              <span className="tag">{t(`trash.type.${item.type}`)}</span>
              <span className="grow"><strong>{item.title}</strong> <span className="muted">{fmt(item.deleted_at)}</span></span>
              <Button size="sm" variant="ghost" onClick={() => restore(item)}>{t('trash.restore')}</Button>
              <Button size="sm" variant="ghost" onClick={() => forever(item)}>{t('trash.deleteForever')}</Button>
            </li>
          ))}
        </ul>
      </LoadState>
    </>
  );
}
