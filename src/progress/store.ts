/**
 * Persistance de la progression (format compact, relu avec validation : une entrée abîmée est
 * ignorée, jamais fatale). Une clé par historique, une pour la série.
 */
import { isValidISODate, type ISODate } from '../../engine/core/date';
import { QUEENS_MAX_SIZE, QUEENS_MIN_SIZE } from '../../engine/queens/types';
import { isTier } from '../game/queens/validate';
import { dailyProgressKey } from '../persistence';
import { loadJSON, saveJSON } from '../platform/storage';
import { EMPTY_STREAK, MAX_FREEZES } from './streak';
import type { DailyResult, StreakState, UnlimitedResult } from './types';

export const DAILY_HISTORY_KEY = 'daily.history.v1';
export const UNLIMITED_HISTORY_KEY = 'unlimited.history.v1';
export const STREAK_KEY = 'streak.v1';
/** Parties illimitées gardées (les plus récentes). */
export const MAX_UNLIMITED_RESULTS = 1000;

/** [temps ms, indices, taille, palier, 0 = du jour | 1 = archive, résolu le]. */
type DailyRow = [number, number, number, number, 0 | 1, ISODate];
/** [taille, palier, temps ms, indices, résolu le]. */
type UnlimitedRow = [number, number, number, number, ISODate];

export interface ProgressData {
  readonly history: ReadonlyMap<ISODate, DailyResult>;
  readonly unlimited: readonly UnlimitedResult[];
  readonly streak: StreakState;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;
const isSize = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= QUEENS_MIN_SIZE && (v as number) <= QUEENS_MAX_SIZE;
const isDate = (v: unknown): v is ISODate => typeof v === 'string' && isValidISODate(v);

export function encodeDailyHistory(history: ReadonlyMap<ISODate, DailyResult>): { v: 1; results: Record<ISODate, DailyRow> } {
  const results: Record<ISODate, DailyRow> = {};
  for (const [date, r] of history) results[date] = [r.timeMs, r.hintsUsed, r.size, r.tier, r.mode === 'daily' ? 0 : 1, r.solvedOn];
  return { v: 1, results };
}

export function decodeDailyHistory(raw: unknown): Map<ISODate, DailyResult> {
  const out = new Map<ISODate, DailyResult>();
  if (!isRecord(raw) || raw['v'] !== 1 || !isRecord(raw['results'])) return out;
  for (const [date, row] of Object.entries(raw['results'])) {
    if (!isDate(date) || !Array.isArray(row) || row.length !== 6) continue;
    const [timeMs, hintsUsed, size, tier, mode, solvedOn] = row as unknown[];
    if (!isCount(timeMs) || !isCount(hintsUsed) || !isSize(size) || !isTier(tier) || (mode !== 0 && mode !== 1) || !isDate(solvedOn)) continue;
    out.set(date, { date, timeMs, hintsUsed, size, tier, mode: mode === 0 ? 'daily' : 'archive', solvedOn });
  }
  return out;
}

export function encodeUnlimitedHistory(results: readonly UnlimitedResult[]): { v: 1; results: UnlimitedRow[] } {
  return { v: 1, results: results.slice(-MAX_UNLIMITED_RESULTS).map((r) => [r.size, r.tier, r.timeMs, r.hintsUsed, r.solvedOn]) };
}

export function decodeUnlimitedHistory(raw: unknown): UnlimitedResult[] {
  if (!isRecord(raw) || raw['v'] !== 1 || !Array.isArray(raw['results'])) return [];
  const out: UnlimitedResult[] = [];
  for (const row of raw['results'] as unknown[]) {
    if (!Array.isArray(row) || row.length !== 5) continue;
    const [size, tier, timeMs, hintsUsed, solvedOn] = row as unknown[];
    if (!isSize(size) || !isTier(tier) || !isCount(timeMs) || !isCount(hintsUsed) || !isDate(solvedOn)) continue;
    out.push({ size, tier, timeMs, hintsUsed, solvedOn });
  }
  return out.slice(-MAX_UNLIMITED_RESULTS);
}

export function decodeStreak(raw: unknown): StreakState {
  if (!isRecord(raw)) return EMPTY_STREAK;
  const dates = (v: unknown) => (Array.isArray(v) ? [...new Set(v.filter(isDate))].sort() : []);
  const freezes = raw['freezes'];
  const settled = raw['settledThrough'];
  return {
    freezes: isCount(freezes) ? Math.min(MAX_FREEZES, freezes) : 0,
    frozen: dates(raw['frozen']),
    rewarded: dates(raw['rewarded']),
    settledThrough: isDate(settled) ? settled : null,
  };
}

export async function loadProgressData(): Promise<ProgressData> {
  const [daily, unlimited, streak] = await Promise.all([
    loadJSON<unknown>(DAILY_HISTORY_KEY),
    loadJSON<unknown>(UNLIMITED_HISTORY_KEY),
    loadJSON<unknown>(STREAK_KEY),
  ]);
  return { history: decodeDailyHistory(daily), unlimited: decodeUnlimitedHistory(unlimited), streak: decodeStreak(streak) };
}

export const saveDailyHistory = (history: ReadonlyMap<ISODate, DailyResult>) => saveJSON(DAILY_HISTORY_KEY, encodeDailyHistory(history));
export const saveUnlimitedHistory = (results: readonly UnlimitedResult[]) => saveJSON(UNLIMITED_HISTORY_KEY, encodeUnlimitedHistory(results));
export const saveStreak = (state: StreakState) => saveJSON(STREAK_KEY, state);

/** Partie sauvegardée entamée (au moins une marque ou un coup joué). */
export function isStartedGame(saved: unknown): boolean {
  if (!isRecord(saved)) return false;
  const marks = saved['marks'];
  const past = saved['past'];
  return (typeof marks === 'string' && /[12]/.test(marks)) || (Array.isArray(past) && past.length > 0);
}

/** Jours (parmi `dates`) dont la partie du jour est entamée. */
export async function loadStartedDays(dates: readonly ISODate[]): Promise<Set<ISODate>> {
  const started = new Set<ISODate>();
  await Promise.all(
    dates.map(async (date) => {
      if (isStartedGame(await loadJSON<unknown>(dailyProgressKey(date)))) started.add(date);
    }),
  );
  return started;
}
