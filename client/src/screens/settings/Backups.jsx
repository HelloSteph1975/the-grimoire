import { Button } from '../../components/Button.jsx';
import { LoadState } from '../../components/LoadState.jsx';
import { useConfirm } from '../../components/ConfirmProvider.jsx';
import { useToast } from '../../components/ToastProvider.jsx';
import { useResource } from '../../lib/useResource.js';
import { api } from '../../lib/api.js';
import { useT } from '../../i18n/I18nProvider.jsx';

export function Backups() {
  const { t } = useT();
  const confirm = useConfirm();
  const toast = useToast();
  const list = useResource('/api/backups');
  const folder = useResource('/api/data-folder');

  const backUp = async () => {
    try {
      const b = await list.act(() => api.post('/api/backups'));
      toast.show({ message: t('backups.made', { name: b.name }) });
    } catch (err) { toast.show({ message: err.message }); }
  };
  const openFolder = async () => {
    try { await api.post('/api/data-folder/open'); } catch (err) { toast.show({ message: err.message }); }
  };
  const restore = async name => {
    if (!await confirm({ title: t('backups.restoreTitle'), body: t('backups.restoreBody', { name }), confirmLabel: t('backups.restore'), danger: true })) return;
    try {
      await api.post('/api/backups/restore', { name });
      window.location.reload(); // every screen reloads from the restored data
    } catch (err) { toast.show({ message: err.message, duration: 10000 }); }
  };

  return (
    <section>
      <div className="page-header">
        <h2>{t('backups.title')}</h2>
        <Button onClick={backUp}>{t('backups.now')}</Button>
      </div>
      {folder.data && (
        <p>{t('settings.dataFolder')}: <code>{folder.data.path}</code>{' '}
          <Button size="sm" variant="ghost" onClick={openFolder}>{t('settings.openFolder')}</Button></p>
      )}
      <LoadState loading={list.loading && !list.data} error={list.error} onRetry={list.reload}>
        {list.data?.length === 0 && <p className="muted">{t('backups.none')}</p>}
        <ul className="list">
          {list.data?.map(b => (
            <li key={b.name}>
              <span className="grow">{b.name} <span className="muted">({Math.ceil(b.size / 1024)} KB)</span></span>
              <Button size="sm" variant="ghost" onClick={() => restore(b.name)}>{t('backups.restore')}</Button>
            </li>
          ))}
        </ul>
      </LoadState>
    </section>
  );
}
