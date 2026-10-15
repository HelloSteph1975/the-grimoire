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
});
