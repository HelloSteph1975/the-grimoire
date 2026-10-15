import { describe, it, expect } from 'vitest';
import { validate } from '../../server/validate.js';

describe('validate', () => {
  it('requires fields marked with !', () => {
    expect(validate({ name: 'string!' }, {}).errors).toEqual({ name: 'Required' });
  });
  it('trims text and turns empty text into null', () => {
    expect(validate({ a: 'string', b: 'string' }, { a: '  x ', b: '  ' }).data).toEqual({ a: 'x', b: null });
  });
  it('enforces maxLength', () => {
    expect(validate({ name: { type: 'string!', maxLength: 3 } }, { name: 'abcd' }).errors.name).toMatch(/3 characters/);
  });
  it('enforces pattern', () => {
    const s = { color: { type: 'string', pattern: /^#[0-9a-f]{6}$/i, patternHint: 'Use a color like #6e1f24' } };
    expect(validate(s, { color: 'red' }).errors.color).toBe('Use a color like #6e1f24');
    expect(validate(s, { color: '#6E1F24' }).data.color).toBe('#6E1F24');
  });
  it('skips missing fields in partial mode', () => {
    expect(validate({ name: 'string!' }, {}, { partial: true }).data).toEqual({});
  });
  it('returns a code for every error', () => {
    const s = { a: 'string!', b: { type: 'string', maxLength: 2 }, c: { type: 'int', min: 1 }, d: 'date', e: ['x', 'y'] };
    const r = validate(s, { b: 'abc', c: 0, d: 'nope', e: 'z' });
    expect(r.codes).toEqual({ a: { code: 'required' }, b: { code: 'too_long', max: 2 }, c: { code: 'too_small', min: 1 }, d: { code: 'not_date' }, e: { code: 'not_one_of' } });
  });
});
