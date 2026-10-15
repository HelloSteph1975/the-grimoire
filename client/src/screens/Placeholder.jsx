import { PageHeader } from '../components/PageHeader.jsx';
import { useT } from '../i18n/I18nProvider.jsx';

export function Placeholder({ titleKey, stage }) {
  const { t } = useT();
  return (
    <>
      <PageHeader title={t(titleKey)} />
      <p className="muted">{t('placeholder.coming', { stage })}</p>
    </>
  );
}
