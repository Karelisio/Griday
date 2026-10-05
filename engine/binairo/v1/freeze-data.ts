/**
 * Calculs des empreintes de gel de Binairo V1 (partagés par freeze.test.ts et scripts/print-golden.ts).
 * Ce fichier n'est PAS figé : il ne fait que mesurer.
 */
import { addDays, type ISODate } from '../../core/date';
import { fingerprintPuzzle, generateDailyForVersion } from '../../core/pipeline';
import { hashHex, rngFromString } from '../../core/prng';
import { DIFFICULTY_TIERS } from '../../core/types';
import { BINAIRO_DEFINITION } from '../index';
import { generateBinairoCandidate } from './generator';
import { BINAIRO_TECHNIQUES_V1, rateBinairo } from './solver';
import { encodeCells } from './util';
import { BINAIRO_V1 } from './version';

/** Fichiers figés (chemins relatifs à engine/). Toute modification change des puzzles publiés. */
export const V1_FROZEN_FILES = [
  'core/prng.ts',
  'binairo/v1/fallbacks.ts',
  'binairo/v1/generator.ts',
  'binairo/v1/solver.ts',
  'binairo/v1/util.ts',
  'binairo/v1/version.ts',
] as const;

/** Empreinte d'un source (fins de ligne normalisées). */
export function sourceHash(text: string): string {
  return hashHex(text.replace(/\r\n?/g, '\n'));
}

export const ATTEMPT_SAMPLES = 30;
export const ATTEMPT_SIZES = [6, 8, 10, 12] as const;

/**
 * Empreinte de chaque candidat (y compris nuls) par palier × taille : données, solution, état du PRNG après
 * génération, note V1 complète.
 */
export function attemptDigests(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const tier of DIFFICULTY_TIERS) {
    for (const size of ATTEMPT_SIZES) {
      const parts: string[] = [];
      for (let k = 0; k < ATTEMPT_SAMPLES; k++) {
        const rng = rngFromString(`freeze:binairo:${tier}:${size}#${k}`);
        const p = generateBinairoCandidate(rng, size, tier);
        const after = rng.nextU32();
        if (!p) {
          parts.push(`null:${after}`);
          continue;
        }
        const r = rateBinairo(p, BINAIRO_TECHNIQUES_V1);
        parts.push(
          `${encodeCells(p.givens)}/${encodeCells(p.solution)}:${after}:${r.solvable}:${r.tier}:${r.score}:${r.hardest}:${r.steps}:${r.levelCounts.join('.')}`,
        );
      }
      out[`${tier}:${size}`] = hashHex(parts.join('|'));
    }
  }
  return out;
}

/** Empreinte de tous les secours servis (chaque taille × palier × plusieurs pick). */
export function fallbackDigest(): string {
  const parts: string[] = [];
  for (const size of BINAIRO_V1.sizes) {
    for (const tier of DIFFICULTY_TIERS) {
      for (const pick of [0, 1, 2, 3, 5, 0xffffffff]) {
        const { puzzle, rating } = BINAIRO_V1.fallback({ size, tier }, pick);
        parts.push(`${size}/${tier}/${pick}:${encodeCells(puzzle.givens)}/${encodeCells(puzzle.solution)}:${rating.tier}:${rating.score}:${rating.hardest}`);
      }
    }
  }
  return hashHex(parts.join('|'));
}

/** Dates « golden » : deux semaines complètes + dates lointaines (bissextiles, fins d'année). */
export const GOLDEN_DATES: readonly ISODate[] = [
  '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11',
  '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18',
  '2027-01-01', '2028-02-29', '2029-12-31', '2031-07-14', '2033-03-27', '2036-02-29', '2036-10-04',
];
export const GOLDEN_DIGEST_START: ISODate = '2026-10-05';
export const GOLDEN_DIGEST_DAYS = 120;

/** Empreinte du puzzle du jour V1 à une date, indépendamment du calendrier (config.ts). */
export function dailyFingerprintV1(date: ISODate): string {
  return fingerprintPuzzle(BINAIRO_DEFINITION, generateDailyForVersion(BINAIRO_DEFINITION, 1, date));
}

/** Condensé des empreintes V1 de jours consécutifs. */
export function dailyDigestV1(start: ISODate, days: number): string {
  const all: string[] = [];
  for (let i = 0; i < days; i++) all.push(dailyFingerprintV1(addDays(start, i)));
  return hashHex(all.join(','));
}

/** Dernier mois des références mensuelles V1 figées (scripts/golden/binairo-v1.json). */
export const V1_GOLDEN_LAST_MONTH = '2056-09';

/** Condensé des références mensuelles jusqu'à `lastMonth` (ordre des clés trié). */
export function goldenFileDigest(data: Readonly<Record<string, string>>, lastMonth: string): string {
  const keys = Object.keys(data)
    .filter((k) => k.slice(0, 7) <= lastMonth)
    .sort();
  return hashHex(keys.map((k) => `${k}=${data[k]}`).join(','));
}
