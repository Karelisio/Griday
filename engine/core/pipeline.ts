import { isoWeekday, type ISODate } from './date';
import { cyrb128, hashHex, rngFromString } from './prng';
import { dayNumber, typeForDate, versionForDate, type Schedule } from './schedule';
import type {
  DailyInfo,
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
  // Copie : le résultat ne doit jamais exposer (ni laisser muter) la configuration figée.
  const copy: GenerationTarget = { size: target.size, tier: target.tier };

  let timedOut = false;
  for (let k = 0; k < gen.maxAttempts; k++) {
    // Jamais avant la tentative 0 : une horloge qui avance d'1 ms ne doit pas court-circuiter le chemin nominal.
    if (k > 0 && opts.deadlineMs !== undefined && now() - start > opts.deadlineMs) {
      timedOut = true;
      break;
    }
    const result = gen.attempt(rngFromString(attemptSeed(seed, k)), target);
    if (result) {
      // Champs recopiés explicitement : un champ en trop dans `result` ne peut pas écraser les métadonnées.
      return { type: def.id, version, seed, attempt: k, source: 'generated', target: copy, puzzle: result.puzzle, rating: result.rating };
    }
  }

  const fb = gen.fallback(target, cyrb128(seed)[0]);
  const source = timedOut ? 'emergency' : 'fallback';
  return { type: def.id, version, seed, attempt: -1, source, target: copy, puzzle: fb.puzzle, rating: fb.rating };
}

/** Empreinte d'un puzzle généré (métadonnées + contenu) : tests golden, auto-vérification, validation long terme. */
export function fingerprintPuzzle<P>(def: PuzzleTypeDefinition<P>, g: GeneratedPuzzle<P>): string {
  const { target, rating } = g;
  return hashHex(
    [g.type, `v${g.version}`, g.seed, g.attempt, g.source, target.size, target.tier, rating.tier, rating.score, rating.hardest, def.encode(g.puzzle)].join('|'),
  );
}

/** Métadonnées du puzzle du jour sans le générer (calendrier, archives, numérotation). */
export function dailyInfo(registry: Registry, schedule: Schedule, date: ISODate): DailyInfo {
  const type = typeForDate(schedule, date);
  const version = versionForDate(schedule, type, date);
  const gen = registry[type].versions[version];
  if (!gen) throw new Error(`Version ${version} inconnue pour "${type}"`);
  const weekday = isoWeekday(date);
  const t = gen.weeklyPlan[weekday - 1]!;
  return { date, dayNumber: dayNumber(schedule, date), weekday, type, version, target: { size: t.size, tier: t.tier } };
}

/**
 * Puzzle du jour d'une version donnée, indépendamment du calendrier
 * (tests de gel : une version reste vérifiable même après sa date de fin).
 */
export function generateDailyForVersion<P>(
  def: PuzzleTypeDefinition<P>,
  version: number,
  date: ISODate,
  opts: GenerateOptions = {},
): GeneratedPuzzle<P> {
  const gen = def.versions[version];
  if (!gen) throw new Error(`Version ${version} inconnue pour "${def.id}"`);
  const target = gen.weeklyPlan[isoWeekday(date) - 1]!;
  return generateWithAttempts(def, version, dailySeed(date, def.id, version), target, opts);
}

/** Puzzle du jour, identique pour tous les joueurs à une date donnée. */
export function generateDaily(
  registry: Registry,
  schedule: Schedule,
  date: ISODate,
  opts: GenerateOptions = {},
): DailyPuzzle<unknown> {
  const info = dailyInfo(registry, schedule, date);
  const generated = generateDailyForVersion(registry[info.type], info.version, date, opts);
  return { ...generated, date, dayNumber: info.dayNumber, weekday: info.weekday };
}
