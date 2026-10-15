import { Link } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader.jsx';
import { useT } from '../i18n/I18nProvider.jsx';

export function NotFound() {
  const { t } = useT();
  return (
    <>
      <PageHeader title={t('notfound.title')} />
      <p>{t('notfound.body')}</p>
      <p><Link to="/">{t('notfound.home')}</Link></p>
    </>
  );
}
