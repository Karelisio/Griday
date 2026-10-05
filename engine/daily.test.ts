import { describe, expect, it } from 'vitest';
import { SCHEDULE } from './config';
import { addDays } from './core/date';
import { generateDailyForVersion } from './core/pipeline';
import { getDailyInfo, getDailyPuzzle, isScheduleStale, REGISTRY } from './index';
import { engineSelfCheck } from './selfcheck';

describe('puzzle du jour (câblage calendrier → version)', () => {
  it('getDailyPuzzle = version active du calendrier, métadonnées cohérentes avec getDailyInfo', () => {
    for (let i = 0; i < 21; i++) {
      const date = addDays(SCHEDULE.epoch, i * 5);
      const info = getDailyInfo(date);
      const p = getDailyPuzzle(date);
      expect(p.type).toBe(info.type);
      expect(p.version).toBe(info.version);
      expect(p.target).toEqual(info.target);
      expect(p.dayNumber).toBe(info.dayNumber);
      expect(p.weekday).toBe(info.weekday);
      const { date: _d, dayNumber: _n, weekday: _w, ...core } = p;
      expect(core).toEqual(generateDailyForVersion(REGISTRY[info.type], info.version, date));
    }
  });

  it('getDailyInfo ne génère rien et numérote depuis epoch', () => {
    expect(getDailyInfo(SCHEDULE.epoch)).toEqual({
      date: '2026-10-05',
      dayNumber: 1,
      weekday: 1,
      type: 'queens',
      version: 1,
      target: { size: 6, tier: 1 },
    });
    expect(getDailyInfo('2026-10-11').target).toEqual({ size: 10, tier: 4 });
  });

  it('isScheduleStale', () => {
    expect(isScheduleStale(SCHEDULE.validThrough)).toBe(false);
    expect(isScheduleStale(addDays(SCHEDULE.validThrough, 1))).toBe(true);
  });

  it('auto-vérification de démarrage OK', () => {
    expect(engineSelfCheck()).toEqual([]);
  });
});
