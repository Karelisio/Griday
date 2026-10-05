/**
 * Génère engine/binairo/v1/fallbacks.ts : PER_TARGET puzzles de secours par (taille, palier) V1
 * (4 tailles × 4 paliers × 4 = 64 : chaque cible du plan hebdomadaire et du mode illimité).
 * Usage : npx tsx scripts/build-binairo-fallbacks.ts
 * À exécuter UNE fois avant publication de la V1 ; le fichier est ensuite figé.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { generateWithAttempts } from '../engine/core/pipeline';
import { DIFFICULTY_TIERS } from '../engine/core/types';
import { BINAIRO_DEFINITION } from '../engine/binairo';
import type { BinairoFallbackEntry } from '../engine/binairo/v1/fallbacks';
import { encodeCells } from '../engine/binairo/v1/util';
import { BINAIRO_V1 } from '../engine/binairo/v1/version';

const PER_TARGET = 4;
const MAX_SEEDS = 200;

const entries: BinairoFallbackEntry[] = [];
for (const size of BINAIRO_V1.sizes) {
  for (const tier of DIFFICULTY_TIERS) {
    let found = 0;
    for (let i = 0; found < PER_TARGET && i < MAX_SEEDS; i++) {
      const seed = `fallback:binairo:v1:${size}:${tier}:${i}`;
      let res;
      try {
        res = generateWithAttempts(BINAIRO_DEFINITION, 1, seed, { size, tier });
      } catch {
        continue; // budget épuisé et aucun secours encore disponible
      }
      if (res.source !== 'generated') continue;
      const { puzzle, rating } = res;
      entries.push({
        size,
        tier,
        seed,
        attempt: res.attempt,
        givens: encodeCells(puzzle.givens),
        solution: encodeCells(puzzle.solution),
        score: rating.score,
        hardest: rating.hardest,
      });
      found++;
    }
    if (found < PER_TARGET) throw new Error(`Secours insuffisants pour ${size}/${tier} (${found})`);
  }
}

const body = entries
  .map(
    (e) =>
      `  { size: ${e.size}, tier: ${e.tier}, seed: '${e.seed}', attempt: ${e.attempt}, givens: '${e.givens}', solution: '${e.solution}', score: ${e.score}, hardest: '${e.hardest}' },`,
  )
  .join('\n');
const file = `/**
 * Puzzles de secours Binairo V1 — FICHIER GÉNÉRÉ par scripts/build-binairo-fallbacks.ts, FIGÉ.
 * Chaque entrée est reproductible depuis sa graine (vérifié par les tests de version).
 */
export interface BinairoFallbackEntry {
  readonly size: number;
  readonly tier: 1 | 2 | 3 | 4;
  /** Graine de base ayant produit la grille (pipeline V1, tentative indiquée). */
  readonly seed: string;
  readonly attempt: number;
  /** Données, un chiffre par case (0 = vide, 1 = A, 2 = B). */
  readonly givens: string;
  /** Solution, un chiffre par case (1 = A, 2 = B). */
  readonly solution: string;
  readonly score: number;
  readonly hardest: string;
}

export const BINAIRO_FALLBACKS_V1: readonly BinairoFallbackEntry[] = [
${body}
];
`;
const out = fileURLToPath(new URL('../engine/binairo/v1/fallbacks.ts', import.meta.url));
writeFileSync(out, file);
console.log(`${entries.length} puzzles de secours écrits dans ${out}`);
