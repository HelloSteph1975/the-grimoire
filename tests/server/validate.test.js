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
  it('checks lists of strings', () => {
    const s = { k: { type: 'strings', maxItems: 2, maxLength: 3 } };
    expect(validate(s, { k: ['a', 'b'] }).data).toEqual({ k: ['a', 'b'] });
    expect(validate(s, { k: ['a', 'b', 'c'] }).codes.k).toEqual({ code: 'too_many', max: 2 });
    expect(validate(s, { k: ['abcd'] }).codes.k).toEqual({ code: 'too_long', max: 3 });
    expect(validate(s, { k: 'a' }).codes.k).toEqual({ code: 'not_text' });
    expect(validate(s, { k: [1] }).codes.k).toEqual({ code: 'not_text' });
    expect(validate(s, { k: null }).data).toEqual({ k: [] });
  });
  it('checks lists of ids', () => {
    const s = { ids: { type: 'ids', maxItems: 2 } };
    expect(validate(s, { ids: [3, 1, 3] }).data).toEqual({ ids: [3, 1] });
    expect(validate(s, { ids: [1, 2, 3] }).codes.ids).toEqual({ code: 'too_many', max: 2 });
    expect(validate(s, { ids: [0] }).codes.ids).toEqual({ code: 'bad_id' });
    expect(validate(s, { ids: ['1'] }).codes.ids).toEqual({ code: 'bad_id' });
    expect(validate(s, { ids: 1 }).codes.ids).toEqual({ code: 'bad_id' });
  });
  it('checks month-days, leap day included', () => {
    const s = { d: { type: 'monthDay', hintKey: 'feast_day' } };
    expect(validate(s, { d: '02-29' }).data).toEqual({ d: '02-29' });
    expect(validate(s, { d: '12-31' }).data).toEqual({ d: '12-31' });
    for (const bad of ['13-01', '02-30', '04-31', '1-01', '00-10', 1231]) expect(validate(s, { d: bad }).codes.d).toEqual({ code: 'bad_format', hint: 'feast_day' });
    expect(validate(s, { d: '' }).data).toEqual({ d: null });
  });
});
