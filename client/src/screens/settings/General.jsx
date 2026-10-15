import { useCallback } from 'react';
import { Field, Select } from '../../components/Field.jsx';
import { Button } from '../../components/Button.jsx';
import { LoadState } from '../../components/LoadState.jsx';
import { useSettings } from '../../components/SettingsProvider.jsx';
import { useToast } from '../../components/ToastProvider.jsx';
import { useResource } from '../../lib/useResource.js';
import { useRecordForm } from '../../lib/useRecordForm.js';
import { useT } from '../../i18n/I18nProvider.jsx';

const ZONES = [...new Set([...Intl.supportedValuesOf('timeZone'), 'UTC'])];

// Always include the current value, so the select shows what is really saved.
const withCurrent = (options, current) => (options.some(o => o.value === current) || !current ? options : [...options, { value: current, label: current }]);
const KEYS = ['language', 'theme', 'hemisphere', 'time_zone'];

function GeneralForm({ settings, save, languages }) {
  const { t } = useT();
  const toast = useToast();
  const submit = useCallback(async values => {
    // Send only what changed, so a stale value elsewhere never blocks this save.
    const changed = Object.fromEntries(KEYS.filter(k => values[k] !== settings[k]).map(k => [k, values[k]]));
    const out = await save(changed);
    toast.show({ message: t('common.saved') });
    return out;
  }, [save, toast, t, settings]);
  const f = useRecordForm({ initial: Object.fromEntries(KEYS.map(k => [k, settings[k]])), submit });
  // Only English ships with the app, so the picker appears once a language pack is added (or a saved choice needs it).
  const showLanguage = languages.some(l => l.code !== 'en') || settings.language !== 'en';
  return (
    <form onSubmit={f.onSubmit}>
      {showLanguage && (
        <Field label={t('settings.language')} error={f.errors.language}>
          <Select value={f.values.language} onChange={e => f.set('language', e.target.value)}
            options={withCurrent(languages.map(l => ({ value: l.code, label: l.name })), settings.language)} />
        </Field>
      )}
      <Field label={t('settings.theme')} error={f.errors.theme}>
        <Select value={f.values.theme} onChange={e => f.set('theme', e.target.value)}
          options={['old-book', 'book-folk'].map(v => ({ value: v, label: t(`settings.theme.${v}`) }))} />
      </Field>
      <Field label={t('settings.hemisphere')} error={f.errors.hemisphere}>
        <Select value={f.values.hemisphere} onChange={e => f.set('hemisphere', e.target.value)}
          options={['north', 'south'].map(v => ({ value: v, label: t(`settings.hemisphere.${v}`) }))} />
      </Field>
      <Field label={t('settings.timeZone')} error={f.errors.time_zone}>
        <Select value={f.values.time_zone} onChange={e => f.set('time_zone', e.target.value)} options={withCurrent(ZONES.map(z => ({ value: z, label: z })), settings.time_zone)} />
      </Field>
      {f.formError && <p className="form-error" role="alert">{f.formError}</p>}
      <Button type="submit" disabled={f.saving || !f.dirty}>{f.saving ? t('common.saving') : t('common.save')}</Button>
    </form>
  );
}

export function General() {
  const { t } = useT();
  const { settings, save, error, reload } = useSettings();
  const langs = useResource('/api/locales');
  return (
    <section>
      <h2>{t('settings.general')}</h2>
      <LoadState loading={!settings || langs.loading} error={error ?? langs.error} onRetry={() => { reload(); langs.reload(); }}>
        {settings && langs.data && <GeneralForm settings={settings} save={save} languages={langs.data} />}
      </LoadState>
    </section>
  );
}
