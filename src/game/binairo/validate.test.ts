import { describe, expect, it } from 'vitest';
import { isBinairoSolution } from '../../../engine/binairo/rules';
import { rngFromString } from '../../../engine/core/prng';
import { randomUniqueBinairo } from '../../../engine/binairo/testing';
import type { BinairoSolvedPuzzle } from '../../../engine/binairo/types';
import { isBinairoSolvedPuzzle } from './validate';

// Grille 6 × 6 à solution unique (1 = soleil, 2 = lune).
const puzzle: BinairoSolvedPuzzle = {
  size: 6,
  givens: [2, 0, 0, 2, 2, 0, 0, 1, 0, 2, 1, 2, 1, 2, 0, 0, 0, 2, 0, 0, 2, 0, 2, 1, 0, 0, 0, 0, 1, 2, 0, 2, 0, 0, 0, 0],
  solution: [2, 1, 1, 2, 2, 1, 2, 1, 1, 2, 1, 2, 1, 2, 2, 1, 1, 2, 2, 1, 2, 1, 2, 1, 1, 2, 1, 2, 1, 2, 1, 2, 2, 1, 2, 1],
};

describe('validation des grilles Binairo stockées', () => {
  it('accepte une grille cohérente, aux tailles paires du moteur', () => {
    expect(isBinairoSolution(puzzle, puzzle.solution)).toBe(true);
    expect(isBinairoSolvedPuzzle(puzzle)).toBe(true);
    // Relue du stockage : objet JSON, tableaux ordinaires.
    expect(isBinairoSolvedPuzzle(JSON.parse(JSON.stringify(puzzle)))).toBe(true);
    for (const n of [6, 8, 10]) {
      const p = randomUniqueBinairo(rngFromString(`validate-${n}`), n, 0.5);
      expect(isBinairoSolvedPuzzle(p), `${n}×${n}`).toBe(true);
    }
  });

  it('rejette ce qui n’est pas une grille', () => {
    for (const bad of [null, undefined, 'x', 42, [], {}, { size: 6 }, { ...puzzle, size: undefined }]) {
      expect(isBinairoSolvedPuzzle(bad), JSON.stringify(bad)).toBe(false);
    }
  });

  it('rejette une taille impaire, trop petite, trop grande ou non entière', () => {
    for (const size of [3, 5, 7, 2, 16, 6.5, -6, '6', NaN]) {
      expect(isBinairoSolvedPuzzle({ ...puzzle, size }), String(size)).toBe(false);
    }
  });

  it('rejette des tableaux de mauvaise longueur ou aux valeurs hors codage', () => {
    const bad: unknown[] = [
      { ...puzzle, givens: puzzle.givens.slice(1) },
      { ...puzzle, givens: [...puzzle.givens, 0] },
      { ...puzzle, givens: puzzle.givens.map((g, i) => (i === 1 ? 3 : g)) },
      { ...puzzle, givens: puzzle.givens.map((g, i) => (i === 1 ? '0' : g)) },
      { ...puzzle, givens: 'x'.repeat(36) },
      { ...puzzle, solution: puzzle.solution.slice(1) },
      { ...puzzle, solution: puzzle.solution.map((v, i) => (i === 1 ? 0 : v)) },
      { ...puzzle, solution: puzzle.solution.map((v, i) => (i === 1 ? 3 : v)) },
      { ...puzzle, solution: puzzle.solution.map(String) },
      { ...puzzle, solution: undefined },
    ];
    for (const b of bad) expect(isBinairoSolvedPuzzle(b), JSON.stringify(b)).toBe(false);
  });

  it('rejette une solution qui enfreint les règles ou contredit les données', () => {
    // Triplet : la rangée 0 devient 2 2 2 2 2 1 (et plus de six lunes en excès).
    expect(isBinairoSolvedPuzzle({ ...puzzle, solution: puzzle.solution.map((v, i) => (i === 1 || i === 2 ? 2 : v)) })).toBe(false);
    // Échange de deux symboles : la solution reste équilibrée en nombre mais contredit une donnée.
    expect(isBinairoSolvedPuzzle({ ...puzzle, solution: puzzle.solution.map((v) => (v === 1 ? 2 : 1)) })).toBe(false);
    // Une donnée qui n'est pas celle de la solution.
    expect(isBinairoSolvedPuzzle({ ...puzzle, givens: puzzle.givens.map((g, i) => (i === 0 ? 1 : g)) })).toBe(false);
    // Deux lignes identiques : rangées 0 et 1 recopiées.
    const twin = [...puzzle.solution];
    for (let c = 0; c < 6; c++) twin[6 + c] = twin[c]!;
    expect(isBinairoSolvedPuzzle({ ...puzzle, solution: twin })).toBe(false);
  });
});
