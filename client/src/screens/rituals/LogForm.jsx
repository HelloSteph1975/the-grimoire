import { useCallback, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Star } from 'lucide-react';
import { Button } from '../../components/Button.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { LoadState } from '../../components/LoadState.jsx';
import { Field, TextArea } from '../../components/Field.jsx';
import { ConflictDialog } from '../../components/ConflictDialog.jsx';
import { useResource } from '../../lib/useResource.js';
import { useRecordForm } from '../../lib/useRecordForm.js';
import { api } from '../../lib/api.js';
import { useT } from '../../i18n/I18nProvider.jsx';

// Planned is there so a ritual logged by mistake can go back.
const STATUSES = ['planned', 'done', 'skipped'];
const RATINGS = [1, 2, 3, 4, 5];

// A planned ritual opens on Done, the usual reason to log it; a logged one keeps its status.
const pick = r => ({
  status: r.status === 'planned' ? 'done' : r.status,
  changes: r.changes ?? '',
  outcome: r.outcome ?? '',
  rating: r.rating ?? null,
});

export function LogFormRoute() {
  const { id } = useParams();
  return <LogFormLoader key={id} id={id} />;
}

function LogFormLoader({ id }) {
  const { t, ready: languageReady } = useT();
  const ritual = useResource(`/api/rituals/${id}`);
  const ready = ritual.data && languageReady;
  return (
    <>
      <PageHeader title={ritual.data?.title ?? t('rituals.logTitle')} />
      <LoadState loading={!ready} error={ready ? null : ritual.error} onRetry={ritual.reload}>
        {ready && <LogForm record={ritual.data} />}
      </LoadState>
      {!ready && ritual.error && <p><Link to="/rituals">{t('rituals.back')}</Link></p>}
    </>
  );
}

function LogForm({ record }) {
  const { t } = useT();
  const navigate = useNavigate();
  const [initial] = useState(() => pick(record));
  const [version, setVersion] = useState(record.version);
  const submit = useCallback(async (values, { version: forced }) => {
    const out = await api.patch(`/api/rituals/${record.id}`, { ...values, version: forced ?? version });
    setVersion(out.version);
    return out;
  }, [record.id, version]);
  const f = useRecordForm({ initial, submit });
  const v = f.values;

  const done = out => { if (out && !f.isDirtyNow()) navigate(`/rituals/${record.id}`); };
  const save = async e => done(await f.onSubmit(e));
  const keep = async () => done(await f.keepMine());
  const takeTheirs = () => { setVersion(f.conflict.version); f.takeTheirs(pick); };
  // A planned ritual can be logged as it stands (Done, nothing else filled in).
  const canSave = f.dirty || record.status === 'planned';

  return (
    <>
      <form className="entry-form log-form" onSubmit={save}>
        <fieldset disabled={f.saving}>
          <fieldset className="field field-group">
            <legend>{t('rituals.logTitle')}</legend>
            <div className="checks">
              {STATUSES.map(s => (
                <label key={s} className="checkbox">
                  <input type="radio" name="status" value={s} checked={v.status === s} onChange={() => f.set('status', s)} />
                  {' '}{t(`rituals.status.${s}`)}
                </label>
              ))}
            </div>
          </fieldset>
          <Field label={t('rituals.changes')} error={f.errors.changes}>
            <TextArea value={v.changes} onChange={e => f.set('changes', e.target.value)} rows={4} maxLength={4000} />
          </Field>
          <Field label={t('rituals.outcome')} error={f.errors.outcome}>
            <TextArea value={v.outcome} onChange={e => f.set('outcome', e.target.value)} rows={6} maxLength={4000} />
          </Field>
          <fieldset className="field field-group">
            <legend>{t('rituals.ratingField')}</legend>
            <RatingPicker value={v.rating} onChange={n => f.set('rating', n)} />
            {f.errors.rating && <small className="field-error" role="alert">{f.errors.rating}</small>}
          </fieldset>
        </fieldset>
        {f.formError && <p className="form-error" role="alert">{f.formError}</p>}
        <div className="form-actions">
          <Button variant="ghost" onClick={() => navigate(`/rituals/${record.id}`)}>{t('common.cancel')}</Button>
          <Button type="submit" disabled={f.saving || !canSave}>{f.saving ? t('common.saving') : t('common.save')}</Button>
        </div>
      </form>
      <ConflictDialog conflict={f.conflict} onKeepMine={keep} onTakeTheirs={takeTheirs} onDismiss={f.dismissConflict} />
    </>
  );
}

// Five star buttons and No rating. Stars up to the chosen one are filled; the pressed state
// is on the chosen button, so it never relies on the fill alone.
function RatingPicker({ value, onChange }) {
  const { t } = useT();
  return (
    <div className="rating-picker">
      {RATINGS.map(n => (
        <button key={n} type="button" className="rating-star" aria-pressed={value === n} aria-label={t('rituals.star', { n })}
          title={t('rituals.star', { n })} onClick={() => onChange(n)}>
          <Star size={22} aria-hidden="true" fill={value != null && n <= value ? 'currentColor' : 'none'} />
        </button>
      ))}
      <button type="button" className="toggle-btn" aria-pressed={value == null} onClick={() => onChange(null)}>{t('rituals.noRating')}</button>
    </div>
  );
}
