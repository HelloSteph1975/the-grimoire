import { PageHeader } from '../components/PageHeader.jsx';
import { useT } from '../i18n/I18nProvider.jsx';
import { General } from './settings/General.jsx';
import { Traditions } from './settings/Traditions.jsx';
import { Categories } from './settings/Categories.jsx';
import { SpellKinds } from './settings/SpellKinds.jsx';
import { JournalKinds } from './settings/JournalKinds.jsx';
import { Backups } from './settings/Backups.jsx';

export function Settings() {
  const { t } = useT();
  return (
    <>
      <PageHeader title={t('settings.title')} />
      <General />
      <Traditions />
      <Categories />
      <SpellKinds />
      <JournalKinds />
      <Backups />
    </>
  );
}
