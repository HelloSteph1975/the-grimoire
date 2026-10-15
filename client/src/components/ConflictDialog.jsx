import { Dialog } from './Dialog.jsx';
import { Button } from './Button.jsx';
import { useT } from '../i18n/I18nProvider.jsx';

export function ConflictDialog({ conflict, onKeepMine, onTakeTheirs, onDismiss }) {
  const { t } = useT();
  return (
    <Dialog open={Boolean(conflict)} onClose={onDismiss} title={t('conflict.title')}
      footer={(
        <>
          <Button variant="ghost" onClick={onTakeTheirs} data-autofocus="">{t('conflict.reload')}</Button>
          <Button variant="danger" onClick={onKeepMine}>{t('conflict.keep')}</Button>
        </>
      )}>
      <p>{t('conflict.body')}</p>
    </Dialog>
  );
}
