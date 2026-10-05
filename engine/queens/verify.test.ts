import { describe, expect, it } from 'vitest';
import { decodeQueens } from './encoding';
import { QUEENS_DEFINITION, verifyQueens } from './index';
import type { QueensSolvedPuzzle } from './types';

// Grille de secours V1 (6×6, solution unique).
const VALID: QueensSolvedPuzzle = { ...decodeQueens('000122030112400515400555445555455555'), solution: [5, 1, 4, 2, 0, 3] };

describe('verifyQueens (vérification indépendante du générateur)', () => {
  it('grille valide à solution unique → aucune erreur', () => {
    expect(verifyQueens(VALID)).toEqual([]);
    expect(QUEENS_DEFINITION.verify(VALID)).toEqual([]);
    expect(QUEENS_DEFINITION.sizeOf(VALID)).toBe(6);
  });

  it('plusieurs solutions (régions = lignes) → erreur', () => {
    const rows = Array.from({ length: 36 }, (_, i) => Math.floor(i / 6));
    const p: QueensSolvedPuzzle = { size: 6, regions: rows, solution: [1, 3, 5, 0, 2, 4] };
    expect(verifyQueens(p)).toEqual(['2 solutions']);
  });

  it('solution fournie invalide → erreur', () => {
    expect(verifyQueens({ ...VALID, solution: [0, 1, 2, 3, 4, 5] })).toEqual(['solution fournie invalide']);
    expect(verifyQueens({ ...VALID, solution: [5, 1, 4, 2, 0] })).toEqual(['solution fournie invalide']);
  });

  it('structure invalide → erreurs de structure', () => {
    const regions = [...VALID.regions];
    regions[0] = 5; // étiquettes non canoniques, région 5 non connexe
    expect(verifyQueens({ ...VALID, regions }).length).toBeGreaterThan(0);
  });

  it('budget de recherche épuisé → unicité non établie (échec par défaut)', () => {
    expect(verifyQueens(VALID, 0)).toEqual(['unicité non établie (budget de recherche épuisé)']);
  });
});
