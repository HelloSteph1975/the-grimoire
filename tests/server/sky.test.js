import { describe, it, expect } from 'vitest';
import { dayInZone, moonPhaseOnDay, moonPhasesOnDays, moonNow, moonQuarters, seasonDays, skyAt, WEEKDAY_PLANET } from '../../server/services/sky.js';

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

describe('skyAt', () => {
  it('has the fixed weekday planets', () => {
    expect(WEEKDAY_PLANET).toEqual({ sun: 'sun', mon: 'moon', tue: 'mars', wed: 'mercury', thu: 'jupiter', fri: 'venus', sat: 'saturn' });
  });

  it('gives the full moon on 2024-06-21 in Chicago, a Friday of Venus', () => {
    const sky = skyAt('2024-06-21', null, 'America/Chicago');
    expect(sky).toMatchObject({ moon: 'full', weekday: 'fri', planet: 'venus' });
    expect(sky.lit).toBeGreaterThan(0.98);
    expect(sky.lit).toBeLessThanOrEqual(1);
    expect(Object.keys(sky).sort()).toEqual(['lit', 'moon', 'planet', 'weekday']);
  });

  it('measures the lit fraction at the time given, in the zone', () => {
    // Near first quarter the lit part grows about 1 percent every 2 hours.
    const morning = skyAt('2026-10-18', '00:30', 'America/Chicago');
    const night = skyAt('2026-10-18', '23:30', 'America/Chicago');
    expect(morning.moon).toBe('first-quarter');
    expect(night.moon).toBe('first-quarter');
    expect(night.lit).toBeGreaterThan(morning.lit + 0.05);
    expect(skyAt('2026-10-18', '12:00', 'America/Chicago')).toEqual(skyAt('2026-10-18', null, 'America/Chicago'));
  });

  it('names every weekday', () => {
    const days = ['2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24'];
    expect(days.map(d => skyAt(d, null, 'UTC').weekday)).toEqual(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']);
    expect(skyAt('2026-10-20', null, 'UTC').planet).toBe('mars');
  });
});

describe('moonPhasesOnDays', () => {
  it('names each day the same as moonPhaseOnDay', () => {
    const days = Array.from({ length: 90 }, (_, i) => new Date(Date.parse('2026-10-17T00:00:00Z') + i * 86400000).toISOString().slice(0, 10));
    for (const zone of ['America/Chicago', 'Pacific/Kiritimati', 'Pacific/Pago_Pago']) {
      const phases = moonPhasesOnDays(days, zone);
      expect(days.map(d => phases[d])).toEqual(days.map(d => moonPhaseOnDay(d, zone)));
    }
    expect(moonPhasesOnDays([], 'UTC')).toEqual({});
  });
});
