import { describe, it, expect } from 'vitest';
import { dayInZone, moonPhaseOnDay, moonNow, moonQuarters, seasonDays } from '../../server/services/sky.js';

describe('dayInZone', () => {
  it('uses the zone day', () => {
    expect(dayInZone(new Date('2024-03-20T03:00:00Z'), 'America/Chicago')).toBe('2024-03-19');
    expect(dayInZone(new Date('2024-03-20T03:00:00Z'), 'UTC')).toBe('2024-03-20');
  });
});

describe('moonPhaseOnDay', () => {
  it.each([
    ['2026-10-16', 'America/Chicago', 'waxing-crescent'],
    ['2026-10-18', 'America/Chicago', 'first-quarter'],
    ['2026-10-19', 'America/Chicago', 'waxing-gibbous'],
    ['2024-06-21', 'America/Chicago', 'full'],
    ['2024-06-21', 'UTC', 'waxing-gibbous'],
    ['2024-06-22', 'America/Chicago', 'waning-gibbous'],
    ['2024-01-11', 'UTC', 'new'],
  ])('%s in %s is %s', (day, zone, code) => expect(moonPhaseOnDay(day, zone)).toBe(code));
});

describe('seasonDays', () => {
  it('finds the 2024 seasons', () => {
    expect(seasonDays(2024, 'UTC')).toEqual({
      'march-equinox': '2024-03-20', 'june-solstice': '2024-06-20',
      'september-equinox': '2024-09-22', 'december-solstice': '2024-12-21',
    });
    expect(seasonDays(2024, 'America/Chicago')['march-equinox']).toBe('2024-03-19');
  });
});

describe('moonQuarters', () => {
  it('finds the June 2024 full moon in UTC and Chicago', () => {
    expect(moonQuarters('2024-06-01', '2024-06-30', 'UTC')).toContainEqual(expect.objectContaining({ quarter: 'full', day: '2024-06-22' }));
    expect(moonQuarters('2024-06-01', '2024-06-30', 'America/Chicago')).toContainEqual(expect.objectContaining({ quarter: 'full', day: '2024-06-21' }));
  });
  it('finds the January 2024 new and full moons', () => {
    const q = moonQuarters('2024-01-01', '2024-01-31', 'UTC');
    expect(q).toContainEqual(expect.objectContaining({ quarter: 'new', day: '2024-01-11' }));
    expect(q).toContainEqual(expect.objectContaining({ quarter: 'full', day: '2024-01-25' }));
  });
  it('includes quarters whose zone day is in range though the UTC instant is outside it', () => {
    // Full moon 2024-06-22 01:08 UTC is 2024-06-21 in Chicago.
    expect(moonQuarters('2024-06-21', '2024-06-21', 'America/Chicago').map(x => x.quarter)).toEqual(['full']);
    expect(moonQuarters('2024-06-22', '2024-06-22', 'America/Chicago')).toEqual([]);
  });
});

describe('moonNow', () => {
  it('describes the full moon', () => {
    const m = moonNow(new Date('2024-01-25T18:00:00Z'), 'UTC');
    expect(m.code).toBe('full');
    expect(m.lit).toBeGreaterThanOrEqual(0.99);
    expect(m.next).toHaveLength(4);
    expect(m.next[0].quarter).toBe('last-quarter');
    expect(m.next.map(n => n.at)).toEqual([...m.next.map(n => n.at)].sort());
  });
  it('knows waxing from waning', () => {
    expect(moonNow(new Date('2024-01-18T00:00:00Z'), 'UTC').waxing).toBe(true);
    expect(moonNow(new Date('2024-01-28T00:00:00Z'), 'UTC').waxing).toBe(false);
  });
  it('names the phase by the zone day, so a quarter covers only its own day', () => {
    // 11 PM on 2026-10-16 in Chicago (angle about 74): the first quarter is on the 18th, so not yet.
    expect(moonNow(new Date('2026-10-17T04:00:00Z'), 'America/Chicago').code).toBe('waxing-crescent');
    // Noon on 2024-06-21 in UTC (angle about 173): the full moon is on the 22nd there.
    expect(moonNow(new Date('2024-06-21T12:00:00Z'), 'UTC').code).toBe('waxing-gibbous');
    // The same instant is the full moon's day in Chicago.
    expect(moonNow(new Date('2024-06-21T12:00:00Z'), 'America/Chicago').code).toBe('full');
  });
});
