/**
 * API publique du moteur Griday (pur TypeScript, sans dépendance UI).
 * À exécuter de préférence dans un Web Worker côté application.
 */
import { SCHEDULE } from './config';
import type { ISODate } from './core/date';
import { dailyInfo, generateDaily, generateWithAttempts } from './core/pipeline';
import { hasOwn, isScheduleStale as staleFor, versionForDate } from './core/schedule';
import { DIFFICULTY_TIERS, type DailyInfo, type GenerateOptions, type GenerationTarget, type PuzzleTypeId } from './core/types';
import { REGISTRY, type AnyDailyPuzzle, type AnyGeneratedPuzzle } from './registry';

export * from './core/types';
export { addDays, diffDays, compareISO, isoWeekday, isValidISODate, localISODate, type ISODate } from './core/date';
export { dayNumber } from './core/schedule';
export { validateRegistry } from './core/registry-check';
export { fingerprintPuzzle } from './core/pipeline';
export { SCHEDULE } from './config';
export { REGISTRY, type AnyDailyPuzzle, type AnyGeneratedPuzzle, type PuzzleDataMap } from './registry';
export { engineSelfCheck } from './selfcheck';
export * as queens from './queens';

/**
 * Puzzle du jour (identique pour tous à date égale).
 * Ne pas passer `deadlineMs` ici : un dépassement donnerait un puzzle « emergency » propre à l'appareil.
 */
export function getDailyPuzzle(date: ISODate, opts?: GenerateOptions): AnyDailyPuzzle {
  return generateDaily(REGISTRY, SCHEDULE, date, opts) as AnyDailyPuzzle;
}

/** Type, version, cible et numéro d'un jour, sans génération (calendrier des archives). */
export function getDailyInfo(date: ISODate): DailyInfo {
  return dailyInfo(REGISTRY, SCHEDULE, date);
}

/** Vrai si ce build ne garantit plus le calendrier à `today` (inviter à mettre à jour). */
export function isScheduleStale(today: ISODate): boolean {
  return staleFor(SCHEDULE, today);
}

const TOKEN_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** Graine du mode illimité — FORMAT FIGÉ. `token` : aléa fourni par l'UI (crypto), ASCII. */
export function unlimitedSeed(token: string, type: PuzzleTypeId, version: number, target: GenerationTarget): string {
  if (!TOKEN_RE.test(token)) throw new RangeError(`Jeton de partie invalide : "${token}"`);
  return `unlimited:${token}:${type}:v${version}:${target.size}:${target.tier}`;
}

export interface UnlimitedOptions extends GenerateOptions {
  /** Version du générateur (partie sauvegardée / partagée). Par défaut : version active à `today`. */
  readonly version?: number;
}

/** Puzzle aléatoire du mode illimité. Conserver `version` avec la partie pour la reproduire. */
export function getUnlimitedPuzzle(
  type: PuzzleTypeId,
  target: GenerationTarget,
  token: string,
  today: ISODate,
  opts: UnlimitedOptions = {},
): AnyGeneratedPuzzle {
  if (!hasOwn(REGISTRY, type)) throw new RangeError(`Type de puzzle inconnu : "${type}"`);
  const def = REGISTRY[type];
  const version = opts.version ?? versionForDate(SCHEDULE, type, today);
  const gen = hasOwn(def.versions, version) ? def.versions[version] : undefined;
  if (!gen) throw new RangeError(`Version ${version} inconnue pour "${type}"`);
  if (!gen.sizes.includes(target.size) || !DIFFICULTY_TIERS.includes(target.tier)) {
    throw new RangeError(`Cible invalide pour "${type}" v${version} : ${target.size}/${String(target.tier)}`);
  }
  const t: GenerationTarget = { size: target.size, tier: target.tier };
  return generateWithAttempts(def, version, unlimitedSeed(token, type, version, t), t, opts) as AnyGeneratedPuzzle;
}
