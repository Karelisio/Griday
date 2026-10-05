/**
 * Série de jours et gels de série (logique pure).
 *
 * - Un jour compte s'il a été résolu comme puzzle du jour (mode `daily`), même fini après minuit.
 * - Un jour manqué juste après un jour tenu (résolu ou gelé) consomme un gel s'il en reste :
 *   la série continue sans compter ce jour. Sinon, la série est rompue.
 * - Un gel est gagné à chaque palier de FREEZE_EVERY jours de série (MAX_FREEZES en réserve).
 * - Les jours sont réglés jusqu'à la veille : aujourd'hui reste jouable jusqu'à minuit.
 */
import { addDays, compareISO, diffDays, type ISODate } from '../../engine/core/date';
import type { StreakState, StreakSummary } from './types';

export const MAX_FREEZES = 2;
export const FREEZE_EVERY = 7;
/** Garde-fou des parcours de jours (≈ 11 ans). */
const MAX_SPAN = 4000;

export const EMPTY_STREAK: StreakState = { freezes: 0, frozen: [], rewarded: [], settledThrough: null };

function firstOf(days: ReadonlySet<ISODate>): ISODate | null {
  let first: ISODate | null = null;
  for (const d of days) if (first === null || compareISO(d, first) < 0) first = d;
  return first;
}

/** Règle les jours passés jusqu'à la veille de `today` : consomme les gels des jours manqués. */
export function settleStreak(state: StreakState, solved: ReadonlySet<ISODate>, today: ISODate): StreakState {
  const yesterday = addDays(today, -1);
  if (state.settledThrough !== null && compareISO(state.settledThrough, yesterday) >= 0) return state;
  let start = state.settledThrough !== null ? addDays(state.settledThrough, 1) : firstOf(solved);
  if (start === null) return { ...state, settledThrough: yesterday };
  if (diffDays(start, yesterday) > MAX_SPAN) start = addDays(yesterday, -MAX_SPAN);

  const frozen = new Set(state.frozen);
  let freezes = state.freezes;
  const kept = (d: ISODate) => solved.has(d) || frozen.has(d);
  for (let d = start; compareISO(d, yesterday) <= 0; d = addDays(d, 1)) {
    if (kept(d)) continue;
    if (freezes > 0 && kept(addDays(d, -1))) {
      frozen.add(d);
      freezes--;
    }
  }
  return { ...state, freezes, frozen: [...frozen].sort(compareISO), settledThrough: yesterday };
}

/** Série en cours, record, gels : à appeler après `settleStreak`. */
export function summarizeStreak(state: StreakState, solved: ReadonlySet<ISODate>, today: ISODate): StreakSummary {
  const frozen = new Set(state.frozen);
  const kept = (d: ISODate) => solved.has(d) || frozen.has(d);
  const todaySolved = solved.has(today);

  let current = 0;
  let d = todaySolved ? today : addDays(today, -1);
  for (let guard = 0; guard < MAX_SPAN && kept(d); guard++, d = addDays(d, -1)) if (solved.has(d)) current++;

  // Record : chaînes de jours consécutifs tenus, seuls les jours résolus comptent.
  const days = [...new Set([...solved, ...frozen])].filter((x) => compareISO(x, today) <= 0).sort(compareISO);
  let best = 0;
  let run = 0;
  let prev: ISODate | null = null;
  for (const day of days) {
    if (prev === null || diffDays(prev, day) !== 1) run = 0;
    if (solved.has(day)) run++;
    best = Math.max(best, run);
    prev = day;
  }

  return { current, best: Math.max(best, current), freezes: state.freezes, todaySolved, atRisk: !todaySolved && current > 0 };
}

/**
 * Après la résolution « du jour » du puzzle `date` (`solved` l'inclut déjà) : un gel posé sur ce
 * jour (minuit passé en cours de partie) est rendu, et chaque palier de série rapporte un gel.
 */
export function applyDailySolve(
  state: StreakState,
  solved: ReadonlySet<ISODate>,
  date: ISODate,
  today: ISODate,
): { state: StreakState; earned: boolean } {
  let next = state;
  if (next.frozen.includes(date)) {
    next = { ...next, frozen: next.frozen.filter((d) => d !== date), freezes: Math.min(MAX_FREEZES, next.freezes + 1) };
  }
  const { current } = summarizeStreak(next, solved, today);
  const milestone = current > 0 && current % FREEZE_EVERY === 0;
  if (!milestone || next.rewarded.includes(date) || next.freezes >= MAX_FREEZES) return { state: next, earned: false };
  return { state: { ...next, freezes: next.freezes + 1, rewarded: [...next.rewarded, date].sort(compareISO) }, earned: true };
}
