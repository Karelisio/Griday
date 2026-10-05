/**
 * API publique du moteur Griday (pur TypeScript, sans dépendance UI).
 * À exécuter de préférence dans un Web Worker côté application.
 */
import { SCHEDULE } from './config';
import type { ISODate } from './core/date';
import { generateDaily, generateWithAttempts } from './core/pipeline';
import { versionForDate } from './core/schedule';
import type { GenerateOptions, GenerationTarget, PuzzleTypeId } from './core/types';
import { REGISTRY, type AnyDailyPuzzle, type AnyGeneratedPuzzle } from './registry';

export * from './core/types';
export { addDays, diffDays, compareISO, isoWeekday, isValidISODate, localISODate, type ISODate } from './core/date';
export { dayNumber } from './core/schedule';
export { validateRegistry } from './core/registry-check';
export { SCHEDULE } from './config';
export { REGISTRY, type AnyDailyPuzzle, type AnyGeneratedPuzzle, type PuzzleDataMap } from './registry';
export * as queens from './queens';
export { engineSelfCheck } from './selfcheck';
export { fingerprintPuzzle } from './core/pipeline';

/** Puzzle du jour (identique pour tous à date égale). */
export function getDailyPuzzle(date: ISODate, opts?: GenerateOptions): AnyDailyPuzzle {
  return generateDaily(REGISTRY, SCHEDULE, date, opts) as AnyDailyPuzzle;
}

const TOKEN_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** Graine du mode illimité — FORMAT FIGÉ. `token` : aléa fourni par l'UI (crypto), ASCII. */
export function unlimitedSeed(token: string, type: PuzzleTypeId, version: number, target: GenerationTarget): string {
  if (!TOKEN_RE.test(token)) throw new RangeError(`Jeton de partie invalide : "${token}"`);
  return `unlimited:${token}:${type}:v${version}:${target.size}:${target.tier}`;
}

/** Puzzle aléatoire du mode illimité (version du générateur active à `today`). */
export function getUnlimitedPuzzle(
  type: PuzzleTypeId,
  target: GenerationTarget,
  token: string,
  today: ISODate,
  opts?: GenerateOptions,
): AnyGeneratedPuzzle {
  const version = versionForDate(SCHEDULE, type, today);
  const def = REGISTRY[type];
  return generateWithAttempts(def, version, unlimitedSeed(token, type, version, target), target, opts) as AnyGeneratedPuzzle;
}
