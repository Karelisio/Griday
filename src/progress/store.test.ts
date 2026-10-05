import { beforeEach, describe, expect, it } from 'vitest';
import { saveJSON } from '../platform/storage';
import { dailyProgressKey } from '../persistence';
import {
  DAILY_HISTORY_KEY,
  MAX_UNLIMITED_RESULTS,
  decodeDailyHistory,
  decodeStreak,
  decodeUnlimitedHistory,
  encodeDailyHistory,
  encodeUnlimitedHistory,
  isStartedGame,
  loadProgressData,
  loadStartedDays,
} from './store';
import type { DailyResult, UnlimitedResult } from './types';

const result: DailyResult = { date: '2026-10-05', size: 7, tier: 2, timeMs: 61_234, hintsUsed: 1, mode: 'archive', solvedOn: '2026-10-09' };

beforeEach(() => localStorage.clear());

describe('persistance de la progression', () => {
  it('historique du jour : aller-retour compact', () => {
    const map = new Map([[result.date, result]]);
    const encoded = JSON.parse(JSON.stringify(encodeDailyHistory(map)));
    expect(encoded.results['2026-10-05']).toEqual([61_234, 1, 7, 2, 1, '2026-10-09']);
    expect(decodeDailyHistory(encoded)).toEqual(map);
  });

  it('entrées abîmées ignorées une à une', () => {
    const decoded = decodeDailyHistory({
      v: 1,
      results: {
        '2026-10-05': [1, 0, 6, 1, 0, '2026-10-05'],
        '2026-02-30': [1, 0, 6, 1, 0, '2026-10-05'],
        '2026-10-06': [-1, 0, 6, 1, 0, '2026-10-06'],
        '2026-10-07': [1, 0, 3, 1, 0, '2026-10-07'],
        '2026-10-08': [1, 0, 6, 9, 0, '2026-10-08'],
        '2026-10-09': [1, 0, 6, 1, 2, '2026-10-09'],
        '2026-10-10': [1, 0, 6, 1, 0],
        '2026-10-11': 'x',
      },
    });
    expect([...decoded.keys()]).toEqual(['2026-10-05']);
    for (const bad of [null, 'x', [], { v: 2, results: {} }, { v: 1, results: [] }]) expect(decodeDailyHistory(bad).size).toBe(0);
  });

  it('mode illimité : aller-retour, entrées abîmées ignorées, taille bornée', () => {
    const u: UnlimitedResult = { size: 8, tier: 3, timeMs: 5000, hintsUsed: 0, solvedOn: '2026-10-05' };
    expect(decodeUnlimitedHistory(JSON.parse(JSON.stringify(encodeUnlimitedHistory([u]))))).toEqual([u]);
    expect(decodeUnlimitedHistory({ v: 1, results: [[8, 3, 5000, 0, '2026-10-05'], [8, 3, 'x', 0, '2026-10-05'], null] })).toHaveLength(1);
    const many = Array.from({ length: MAX_UNLIMITED_RESULTS + 10 }, (_, i) => ({ ...u, timeMs: i }));
    const kept = decodeUnlimitedHistory(encodeUnlimitedHistory(many));
    expect(kept).toHaveLength(MAX_UNLIMITED_RESULTS);
    expect(kept.at(-1)!.timeMs).toBe(MAX_UNLIMITED_RESULTS + 9);
  });

  it('série : valeurs assainies', () => {
    expect(decodeStreak({ freezes: 9, frozen: ['2026-10-06', 'x', '2026-10-05', '2026-10-05'], rewarded: 3, settledThrough: 'hier' })).toEqual({
      freezes: 2,
      frozen: ['2026-10-05', '2026-10-06'],
      rewarded: [],
      settledThrough: null,
    });
    expect(decodeStreak(undefined).freezes).toBe(0);
  });

  it('chargement : stockage vide ou corrompu sans erreur', async () => {
    await saveJSON(DAILY_HISTORY_KEY, 'corrompu');
    const data = await loadProgressData();
    expect(data.history.size).toBe(0);
    expect(data.unlimited).toEqual([]);
    expect(data.streak.freezes).toBe(0);
  });

  it('parties entamées (au moins une marque ou un coup)', async () => {
    expect(isStartedGame({ marks: '000', past: [] })).toBe(false);
    expect(isStartedGame({ marks: '010', past: [] })).toBe(true);
    expect(isStartedGame({ marks: '000', past: ['010'] })).toBe(true);
    expect(isStartedGame('x')).toBe(false);
    await saveJSON(dailyProgressKey('2026-10-05'), { marks: '0200', past: ['0000'] });
    await saveJSON(dailyProgressKey('2026-10-06'), { marks: '0000', past: [] });
    expect([...(await loadStartedDays(['2026-10-05', '2026-10-06', '2026-10-07']))]).toEqual(['2026-10-05']);
  });
});
