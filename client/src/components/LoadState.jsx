import { Button } from './Button.jsx';
import { useT } from '../i18n/I18nProvider.jsx';
import { errorText } from '../lib/errors.js';

// keepChildren: once the data has loaded, a later error shows above the children instead of
// replacing them, so an open form keeps its draft and a list stays readable.
export function LoadState({ loading = false, error = null, onRetry, keepChildren = false, children }) {
  const { t } = useT();
  const box = error && (
    <div className="load-error" role="alert">
      <p>{errorText(error, t)}</p>
      {onRetry && <Button onClick={onRetry}>{t('common.tryAgain')}</Button>}
    </div>
  );
  if (keepChildren) return <>{box}{children}</>;
  if (error) return box;
  if (loading) return <p className="loading" role="status">{t('common.loading')}</p>;
  return children;
}
