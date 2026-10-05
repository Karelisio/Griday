/**
 * Génère engine/queens/fallbacks.v1.ts : PER_TARGET puzzles de secours par (taille, palier) V1.
 * Usage : npx tsx scripts/build-queens-fallbacks.ts
 * À exécuter UNE fois avant publication de la V1 ; le fichier est ensuite figé.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { generateWithAttempts } from '../engine/core/pipeline';
import { DIFFICULTY_TIERS } from '../engine/core/types';
import { QUEENS_DEFINITION } from '../engine/queens';
import { encodeQueens } from '../engine/queens/encoding';
import type { QueensFallbackEntry } from '../engine/queens/fallbacks.v1';
import { QUEENS_V1 } from '../engine/queens/v1';

const PER_TARGET = 3;
const MAX_SEEDS = 200;

const entries: QueensFallbackEntry[] = [];
for (const size of QUEENS_V1.sizes) {
  for (const tier of DIFFICULTY_TIERS) {
    let found = 0;
    for (let i = 0; found < PER_TARGET && i < MAX_SEEDS; i++) {
      const seed = `fallback:queens:v1:${size}:${tier}:${i}`;
      let res;
      try {
        res = generateWithAttempts(QUEENS_DEFINITION, 1, seed, { size, tier });
      } catch {
        continue; // budget épuisé et aucun secours encore disponible
      }
      if (res.source !== 'generated') continue;
      entries.push({ size, tier, seed, attempt: res.attempt, code: encodeQueens(res.puzzle) });
      found++;
    }
    if (found < PER_TARGET) throw new Error(`Secours insuffisants pour ${size}/${tier} (${found})`);
  }
}

const body = entries
  .map((e) => `  { size: ${e.size}, tier: ${e.tier}, seed: '${e.seed}', attempt: ${e.attempt}, code: '${e.code}' },`)
  .join('\n');
const file = `/**
 * Puzzles de secours Queens V1 — FICHIER GÉNÉRÉ par scripts/build-queens-fallbacks.ts, FIGÉ.
 * Chaque entrée est reproductible depuis sa graine (vérifié par v1.test.ts).
 */
export interface QueensFallbackEntry {
  readonly size: number;
  readonly tier: 1 | 2 | 3 | 4;
  /** Graine de base ayant produit la grille (pipeline V1, tentative indiquée). */
  readonly seed: string;
  readonly attempt: number;
  /** Régions encodées (encodeQueens). */
  readonly code: string;
}

export const QUEENS_FALLBACKS_V1: readonly QueensFallbackEntry[] = [
${body}
];
`;
const out = fileURLToPath(new URL('../engine/queens/fallbacks.v1.ts', import.meta.url));
writeFileSync(out, file);
console.log(`${entries.length} puzzles de secours écrits dans ${out}`);
