import { isoWeekday, type ISODate } from './date';
import { cyrb128, rngFromString } from './prng';
import { dayNumber, typeForDate, versionForDate, type Schedule } from './schedule';
import type {
  DailyPuzzle,
  GeneratedPuzzle,
  GenerateOptions,
  GenerationTarget,
  PuzzleTypeDefinition,
  PuzzleTypeId,
} from './types';

export type Registry = { readonly [K in PuzzleTypeId]: PuzzleTypeDefinition<unknown> };

/** Graine du puzzle du jour — FORMAT FIGÉ : "YYYY-MM-DD:type:vN". */
export function dailySeed(date: ISODate, type: PuzzleTypeId, version: number): string {
  return `${date}:${type}:v${version}`;
}

/** Graine de la tentative k (« graine + k ») — FORMAT FIGÉ. */
export function attemptSeed(seed: string, attempt: number): string {
  return `${seed}#${attempt}`;
}

/**
 * Génère un puzzle : essaie graine#0, graine#1, … jusqu'au budget déterministe,
 * puis bascule sur un puzzle de secours choisi de façon déterministe.
 * Le filet temps réel (deadlineMs) n'est vérifié qu'entre deux tentatives.
 */
export function generateWithAttempts<P>(
  def: PuzzleTypeDefinition<P>,
  version: number,
  seed: string,
  target: GenerationTarget,
  opts: GenerateOptions = {},
): GeneratedPuzzle<P> {
  const gen = def.versions[version];
  if (!gen) throw new Error(`Version ${version} inconnue pour "${def.id}"`);
  const now = opts.now ?? Date.now;
  const start = now();

  for (let k = 0; k < gen.maxAttempts; k++) {
    if (opts.deadlineMs !== undefined && now() - start > opts.deadlineMs) break;
    const result = gen.attempt(rngFromString(attemptSeed(seed, k)), target);
    if (result) {
      return { type: def.id, version, seed, attempt: k, source: 'generated', target, ...result };
    }
  }

  const fb = gen.fallback(target, cyrb128(seed)[0]);
  return { type: def.id, version, seed, attempt: -1, source: 'fallback', target, ...fb };
}

/** Puzzle du jour, identique pour tous les joueurs à une date donnée. */
export function generateDaily(
  registry: Registry,
  schedule: Schedule,
  date: ISODate,
  opts: GenerateOptions = {},
): DailyPuzzle<unknown> {
  const type = typeForDate(schedule, date);
  const version = versionForDate(schedule, type, date);
  const def = registry[type];
  const gen = def.versions[version];
  if (!gen) throw new Error(`Version ${version} inconnue pour "${type}"`);
  const weekday = isoWeekday(date);
  const target = gen.weeklyPlan[weekday - 1]!;
  const generated = generateWithAttempts(def, version, dailySeed(date, type, version), target, opts);
  return { ...generated, date, dayNumber: dayNumber(schedule, date), weekday };
}
