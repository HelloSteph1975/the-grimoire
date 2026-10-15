import { Button } from './Button.jsx';
import { useT } from '../i18n/I18nProvider.jsx';

export function LoadState({ loading = false, error = null, onRetry, children }) {
  const { t } = useT();
  if (error) {
    return (
      <div className="load-error" role="alert">
        <p>{error.message}</p>
        {onRetry && <Button onClick={onRetry}>{t('common.tryAgain')}</Button>}
      </div>
    );
  }
  if (loading) return <p className="loading" role="status">{t('common.loading')}</p>;
  return children;
}
