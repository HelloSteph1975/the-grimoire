import { describe, it, expect } from 'vitest';
import { sortByName } from '../../client/src/lib/collate.js';

describe('sortByName', () => {
  it('orders by the language, ignoring accents and case', () => {
    const rows = [{ id: 1, n: 'Cobre' }, { id: 2, n: 'Ámbar' }, { id: 3, n: 'Agua' }];
    expect(sortByName(rows, r => r.n, 'es').map(r => r.id)).toEqual([3, 2, 1]);
  });
  it('keeps id order for equal names and leaves the input alone', () => {
    const rows = [{ id: 5, n: 'Sal' }, { id: 2, n: 'sal' }, { id: 9, n: 'Ajo' }];
    const out = sortByName(rows, r => r.n, 'en');
    expect(out.map(r => r.id)).toEqual([9, 2, 5]);
    expect(rows.map(r => r.id)).toEqual([5, 2, 9]);
    expect(out).not.toBe(rows);
  });
  it('sorts numbers by value', () => {
    const rows = [{ id: 1, n: 'Day 10' }, { id: 2, n: 'Day 2' }];
    expect(sortByName(rows, r => r.n, 'en').map(r => r.id)).toEqual([2, 1]);
  });
});
