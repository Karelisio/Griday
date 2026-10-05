import { describe, expect, it } from 'vitest';
import { getBinairoHint } from '../../engine/binairo/hint';
import { CELL_B, type BinairoCell, type BinairoSolvedPuzzle } from '../../engine/binairo/types';
import { getQueensHint } from '../../engine/queens/hint';
import { queensDailyV1 } from '../../engine/queens/testing';
import type { QueensMark } from '../../engine/queens/types';
import { engine } from './client';
import { handleEngineCall } from './handle';

// Grille 6 × 6 à solution unique (1 = soleil, 2 = lune).
const binairo: BinairoSolvedPuzzle = {
  size: 6,
  givens: [2, 0, 0, 2, 2, 0, 0, 1, 0, 2, 1, 2, 1, 2, 0, 0, 0, 2, 0, 0, 2, 0, 2, 1, 0, 0, 0, 0, 1, 2, 0, 2, 0, 0, 0, 0],
  solution: [2, 1, 1, 2, 2, 1, 2, 1, 1, 2, 1, 2, 1, 2, 2, 1, 1, 2, 2, 1, 2, 1, 2, 1, 1, 2, 1, 2, 1, 2, 1, 2, 2, 1, 2, 1],
};

describe('appels moteur : indices', () => {
  it('binairoHint : déduction du solveur, erreurs du joueur, grille résolue', () => {
    const start: BinairoCell[] = [...binairo.givens];
    const hint = handleEngineCall({ kind: 'binairoHint', puzzle: binairo, marks: start });
    expect(hint).toEqual(getBinairoHint(binairo, start));
    expect(hint).toMatchObject({ kind: 'step' });

    const wrong = [...start];
    wrong[1] = CELL_B; // la solution porte un soleil en case 1
    expect(handleEngineCall({ kind: 'binairoHint', puzzle: binairo, marks: wrong })).toEqual({ kind: 'mistake', cells: [1] });
    expect(handleEngineCall({ kind: 'binairoHint', puzzle: binairo, marks: [...binairo.solution] })).toEqual({ kind: 'solved' });
  });

  it('binairoHint : des marques de mauvaise longueur ou invalides sont refusées', () => {
    expect(() => handleEngineCall({ kind: 'binairoHint', puzzle: binairo, marks: [0, 1] })).toThrow(RangeError);
    expect(() => handleEngineCall({ kind: 'binairoHint', puzzle: binairo, marks: binairo.givens.map(() => 3 as unknown as BinairoCell) })).toThrow(RangeError);
  });

  it('le client appelle le moteur (repli sans Worker) et rend les mêmes indices', async () => {
    const start: BinairoCell[] = [...binairo.givens];
    expect(await engine.binairoHint(binairo, start)).toEqual(getBinairoHint(binairo, start));
  });

  it('queensHint reste servi à côté de binairoHint', async () => {
    const puzzle = queensDailyV1('2026-10-05');
    const marks = new Array<QueensMark>(puzzle.size * puzzle.size).fill(0);
    expect(handleEngineCall({ kind: 'queensHint', puzzle, marks })).toEqual(getQueensHint(puzzle, marks));
    expect(await engine.queensHint(puzzle, marks)).toEqual(getQueensHint(puzzle, marks));
  });
});
