import en from '../i18n/en.json';

const has = key => Object.hasOwn(en, key);

export function errorText(err, t) {
  const key = err?.code ? `error.${err.code}` : null;
  return key && has(key) ? t(key, err.vars) : (err?.message ?? t('error.server_error'));
}

export function fieldErrors(err, t) {
  const out = {};
  const details = err?.details ?? {};
  const codes = err?.detailCodes ?? {};
  for (const field of new Set([...Object.keys(details), ...Object.keys(codes)])) {
    const c = codes[field];
    const hintKey = c?.hint ? `error.bad_format.${c.hint}` : null;
    if (hintKey && has(hintKey)) out[field] = t(hintKey);
    else if (c && has(`error.${c.code}`)) out[field] = t(`error.${c.code}`, c);
    else out[field] = details[field];
  }
  return out;
}
