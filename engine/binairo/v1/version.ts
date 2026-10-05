/**
 * Binairo — générateur V1.
 *
 * FIGÉ APRÈS PUBLICATION. Tout le dossier v1/ (hors *.test.ts et freeze-data.ts) et core/prng.ts déterminent
 * chaque puzzle publié : ne jamais les modifier (freeze.test.ts vérifie leur empreinte). Le dossier ne dépend
 * d'aucun code partagé à l'exécution (imports de types uniquement, utilitaires recopiés).
 * Évolution = copier les fichiers utiles dans v2/, modifier la copie, l'ajouter au registre et activer la v2
 * à une date future dans config.ts.
 */
import type { Rng } from '../../core/prng';
import type { DifficultyRating, GenerationTarget, GeneratorVersion, RatedPuzzle } from '../../core/types';
import type { BinairoCell, BinairoPuzzle, BinairoSolvedPuzzle, BinairoSymbol } from '../types';
import { BINAIRO_FALLBACKS_V1, type BinairoFallbackEntry } from './fallbacks';
import { generateBinairoCandidate } from './generator';
import { BINAIRO_TECHNIQUES_V1, rateBinairo } from './solver';
import { decodeCells } from './util';

/**
 * Bandes de score [min, max] par « taille/palier » (mesures : scripts/binairo-gen-stats.ts, 1000 candidats) :
 * écartent le bas de chaque palier (jour à peine plus dur que la veille) et les extrêmes (dimanches interminables).
 * Médianes servies ≈ 30, 50, 60, 76, 91, 108, 142 du lundi au dimanche. Cibles absentes (lundi, mardi, mode
 * illimité) : pas de bande.
 */
const SCORE_BANDS: Readonly<Record<string, readonly [number, number]>> = {
  '8/2': [54, 70],
  '8/3': [66, 90],
  '10/2': [82, 106],
  '10/3': [96, 125],
  '10/4': [120, 190],
};

/** Note V1 (null si non résoluble par logique pure). */
export function rateBinairoV1(p: BinairoPuzzle): DifficultyRating | null {
  const r = rateBinairo(p, BINAIRO_TECHNIQUES_V1);
  return r.solvable ? { tier: r.tier, score: r.score, hardest: r.hardest } : null;
}

/** Vrai si la note convient à la cible (palier exact + bande de score éventuelle). */
export function acceptsV1(target: GenerationTarget, rating: DifficultyRating): boolean {
  if (rating.tier !== target.tier) return false;
  const band = SCORE_BANDS[`${target.size}/${target.tier}`];
  return !band || (rating.score >= band[0] && rating.score <= band[1]);
}

/** Secours pour une cible : même taille et palier, sinon même taille et palier le plus proche. */
function fallbackEntries(target: GenerationTarget): readonly BinairoFallbackEntry[] {
  const sameSize = BINAIRO_FALLBACKS_V1.filter((e) => e.size === target.size);
  for (let delta = 0; delta < 4; delta++) {
    for (const tier of [target.tier - delta, target.tier + delta]) {
      const list = sameSize.filter((e) => e.tier === tier);
      if (list.length > 0) return list;
    }
  }
  return [];
}

export const BINAIRO_V1: GeneratorVersion<BinairoSolvedPuzzle> = Object.freeze({
  version: 1,
  // Lundi facile → dimanche expert.
  weeklyPlan: Object.freeze([
    Object.freeze({ size: 6, tier: 1 }),
    Object.freeze({ size: 8, tier: 1 }),
    Object.freeze({ size: 8, tier: 2 }),
    Object.freeze({ size: 8, tier: 3 }),
    Object.freeze({ size: 10, tier: 2 }),
    Object.freeze({ size: 10, tier: 3 }),
    Object.freeze({ size: 10, tier: 4 }),
  ] as const),
  sizes: Object.freeze([6, 8, 10, 12]),
  maxAttempts: 200,
  rate: rateBinairoV1,
  accepts: acceptsV1,

  attempt(rng: Rng, target: GenerationTarget): RatedPuzzle<BinairoSolvedPuzzle> | null {
    const puzzle = generateBinairoCandidate(rng, target.size, target.tier);
    if (!puzzle) return null;
    const rating = rateBinairoV1(puzzle);
    if (!rating || !acceptsV1(target, rating)) return null;
    return { puzzle, rating };
  },

  fallback(target: GenerationTarget, pick: number): RatedPuzzle<BinairoSolvedPuzzle> {
    const list = fallbackEntries(target);
    if (list.length === 0) throw new Error(`Binairo V1 : aucun secours ${target.size}/${target.tier}`);
    const e = list[pick % list.length]!;
    return {
      puzzle: { size: e.size, givens: decodeCells(e.givens) as BinairoCell[], solution: decodeCells(e.solution) as BinairoSymbol[] },
      rating: { tier: e.tier, score: e.score, hardest: e.hardest },
    };
  },
});
