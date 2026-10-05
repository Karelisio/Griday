/**
 * Persistance de la progression (format compact, relu avec validation : une entrée abîmée est
 * ignorée, jamais fatale). Une clé par historique, une pour la série.
 */
import { isValidISODate, type ISODate } from '../../engine/core/date';
import { PUZZLE_TYPE_IDS, type PuzzleTypeId } from '../../engine/core/types';
import { BINAIRO_MAX_SIZE, BINAIRO_MIN_SIZE } from '../../engine/binairo/types';
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

/** [temps ms, indices, taille, palier, 0 = du jour | 1 = archive, résolu le, type (absent : queens)]. */
type DailyRow = [number, number, number, number, 0 | 1, ISODate, PuzzleTypeId?];
/** [taille, palier, temps ms, indices, résolu le, type (absent : queens)]. */
type UnlimitedRow = [number, number, number, number, ISODate, PuzzleTypeId?];

const isType = (v: unknown): v is PuzzleTypeId => typeof v === 'string' && (PUZZLE_TYPE_IDS as readonly string[]).includes(v);
/** Type relu : absent (anciens résultats) = Queens ; inconnu = entrée ignorée. */
const typeOf = (v: unknown): PuzzleTypeId | null => (v === undefined ? 'queens' : isType(v) ? v : null);

export interface ProgressData {
  readonly history: ReadonlyMap<ISODate, DailyResult>;
  /** Parties illimitées récentes (MAX_UNLIMITED_RESULTS au plus). */
  readonly unlimited: readonly UnlimitedResult[];
  /** Total des parties illimitées résolues, y compris celles sorties de la liste (défaut : sa longueur). */
  readonly unlimitedTotal?: number;
  readonly streak: StreakState;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;
/** Tailles possibles par type (un nouveau type doit déclarer les siennes). */
const SIZES: Record<PuzzleTypeId, readonly [min: number, max: number]> = {
  queens: [QUEENS_MIN_SIZE, QUEENS_MAX_SIZE],
  binairo: [BINAIRO_MIN_SIZE, BINAIRO_MAX_SIZE],
};
const isSize = (type: PuzzleTypeId, v: unknown): v is number => Number.isInteger(v) && (v as number) >= SIZES[type][0] && (v as number) <= SIZES[type][1];
const isDate = (v: unknown): v is ISODate => typeof v === 'string' && isValidISODate(v);

export function encodeDailyHistory(history: ReadonlyMap<ISODate, DailyResult>): { v: 1; results: Record<ISODate, DailyRow> } {
  const results: Record<ISODate, DailyRow> = {};
  for (const [date, r] of history) results[date] = [r.timeMs, r.hintsUsed, r.size, r.tier, r.mode === 'daily' ? 0 : 1, r.solvedOn, r.type ?? 'queens'];
  return { v: 1, results };
}

export function decodeDailyHistory(raw: unknown): Map<ISODate, DailyResult> {
  const out = new Map<ISODate, DailyResult>();
  if (!isRecord(raw) || raw['v'] !== 1 || !isRecord(raw['results'])) return out;
  for (const [date, row] of Object.entries(raw['results'])) {
    if (!isDate(date) || !Array.isArray(row) || row.length < 6 || row.length > 7) continue;
    const [timeMs, hintsUsed, size, tier, mode, solvedOn, rawType] = row as unknown[];
    const type = typeOf(rawType);
    if (!type || !isCount(timeMs) || !isCount(hintsUsed) || !isSize(type, size) || !isTier(tier) || (mode !== 0 && mode !== 1) || !isDate(solvedOn)) continue;
    out.set(date, { date, type, timeMs, hintsUsed, size, tier, mode: mode === 0 ? 'daily' : 'archive', solvedOn });
  }
  return out;
}

export function encodeUnlimitedHistory(results: readonly UnlimitedResult[], total = results.length): { v: 1; total: number; results: UnlimitedRow[] } {
  const rows = results.slice(-MAX_UNLIMITED_RESULTS).map((r): UnlimitedRow => [r.size, r.tier, r.timeMs, r.hintsUsed, r.solvedOn, r.type ?? 'queens']);
  return { v: 1, total: Math.max(total, rows.length), results: rows };
}

export function decodeUnlimitedHistory(raw: unknown): { results: UnlimitedResult[]; total: number } {
  if (!isRecord(raw) || raw['v'] !== 1 || !Array.isArray(raw['results'])) return { results: [], total: 0 };
  const out: UnlimitedResult[] = [];
  for (const row of raw['results'] as unknown[]) {
    if (!Array.isArray(row) || row.length < 5 || row.length > 6) continue;
    const [size, tier, timeMs, hintsUsed, solvedOn, rawType] = row as unknown[];
    const type = typeOf(rawType);
    if (!type || !isSize(type, size) || !isTier(tier) || !isCount(timeMs) || !isCount(hintsUsed) || !isDate(solvedOn)) continue;
    out.push({ type, size, tier, timeMs, hintsUsed, solvedOn });
  }
  const results = out.slice(-MAX_UNLIMITED_RESULTS);
  return { results, total: Math.max(isCount(raw['total']) ? raw['total'] : 0, results.length) };
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
  const { results, total } = decodeUnlimitedHistory(unlimited);
  return { history: decodeDailyHistory(daily), unlimited: results, unlimitedTotal: total, streak: decodeStreak(streak) };
}

export const saveDailyHistory = (history: ReadonlyMap<ISODate, DailyResult>) => saveJSON(DAILY_HISTORY_KEY, encodeDailyHistory(history));
export const saveUnlimitedHistory = (results: readonly UnlimitedResult[], total: number) =>
  saveJSON(UNLIMITED_HISTORY_KEY, encodeUnlimitedHistory(results, total));
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
