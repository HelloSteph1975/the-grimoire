import { describe, it, expect } from 'vitest';
import { errorText, fieldErrors } from '../../client/src/lib/errors.js';
import { ApiError } from '../../client/src/lib/api.js';

const t = (k, v) => ({ 'error.conflict': 'Cambiado en otra ventana', 'error.too_long': `Máximo ${v?.max}`, 'error.required': 'Obligatorio', 'error.bad_format.color': 'Usa un color' }[k] ?? k);

describe('error text', () => {
  it('translates by code and falls back to the message', () => {
    const e = new ApiError('changed', 409); e.code = 'conflict';
    expect(errorText(e, t)).toBe('Cambiado en otra ventana');
    const u = new ApiError('Odd', 500); u.code = 'never_heard_of_it';
    expect(errorText(u, t)).toBe('Odd');
  });
  it('translates field errors with their limits and hints', () => {
    const e = new ApiError('fix', 400, { name: 'Required', note: 'Keep it short', color: 'Use a color' });
    e.detailCodes = { name: { code: 'required' }, note: { code: 'too_long', max: 5 }, color: { code: 'bad_format', hint: 'color' } };
    expect(fieldErrors(e, t)).toEqual({ name: 'Obligatorio', note: 'Máximo 5', color: 'Usa un color' });
  });
});
