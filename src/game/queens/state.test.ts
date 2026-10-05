import { describe, expect, it } from 'vitest';
import { QUEENS_V1 } from '../../../engine/queens/v1/version';
import { MARK_CROSS, MARK_EMPTY, MARK_QUEEN } from './marks';
import { MAX_HISTORY, conflictCells, elapsedAt, newGame, reduceQueens, type QueensGame } from './state';

const { puzzle } = QUEENS_V1.fallback({ size: 6, tier: 1 }, 0);
const n = puzzle.size;
const sol = puzzle.solution.map((c, r) => r * n + c);

describe('partie Queens', () => {
  it('toucher : reine puis vide ; une croix devient une reine', () => {
    let g = newGame(puzzle, 0);
    g = reduceQueens(g, { type: 'tap', cell: 0, now: 1 });
    expect(g.marks[0]).toBe(MARK_QUEEN);
    g = reduceQueens(g, { type: 'tap', cell: 0, now: 2 });
    expect(g.marks[0]).toBe(MARK_EMPTY);
    g = reduceQueens(g, { type: 'set', cell: 1, mark: MARK_CROSS, now: 3 });
    g = reduceQueens(g, { type: 'tap', cell: 1, now: 4 });
    expect(g.marks[1]).toBe(MARK_QUEEN);
  });

  it('double toucher : remplace le premier toucher (croix, ou efface une croix), une seule entrée d’historique', () => {
    let g = newGame(puzzle, 0);
    g = reduceQueens(g, { type: 'tap', cell: 5, now: 1 });
    g = reduceQueens(g, { type: 'doubleTap', cell: 5, now: 2 });
    expect(g.marks[5]).toBe(MARK_CROSS);
    expect(g.past).toHaveLength(1);
    g = reduceQueens(g, { type: 'tap', cell: 5, now: 3 });
    g = reduceQueens(g, { type: 'doubleTap', cell: 5, now: 4 });
    expect(g.marks[5]).toBe(MARK_EMPTY);
    g = reduceQueens(g, { type: 'undo', now: 5 });
    expect(g.marks[5]).toBe(MARK_CROSS);
  });

  it('peinture : croix sur les cases vides seulement, gomme sur les croix seulement', () => {
    let g = newGame(puzzle, 0);
    g = reduceQueens(g, { type: 'tap', cell: 2, now: 1 });
    g = reduceQueens(g, { type: 'paint', cells: [0, 1, 2, 3], mode: 'cross', now: 2 });
    expect(g.marks.slice(0, 4)).toEqual([MARK_CROSS, MARK_CROSS, MARK_QUEEN, MARK_CROSS]);
    g = reduceQueens(g, { type: 'paint', cells: [1, 2], mode: 'erase', now: 3 });
    expect(g.marks.slice(0, 4)).toEqual([MARK_CROSS, MARK_EMPTY, MARK_QUEEN, MARK_CROSS]);
  });

  it('annuler / rétablir ; une nouvelle action efface le futur', () => {
    let g = newGame(puzzle, 0);
    g = reduceQueens(g, { type: 'tap', cell: 0, now: 1 });
    g = reduceQueens(g, { type: 'tap', cell: 7, now: 2 });
    g = reduceQueens(g, { type: 'undo', now: 3 });
    expect(g.marks[7]).toBe(MARK_EMPTY);
    g = reduceQueens(g, { type: 'redo', now: 4 });
    expect(g.marks[7]).toBe(MARK_QUEEN);
    g = reduceQueens(g, { type: 'undo', now: 5 });
    g = reduceQueens(g, { type: 'tap', cell: 9, now: 6 });
    expect(g.future).toHaveLength(0);
    expect(reduceQueens(g, { type: 'redo', now: 7 })).toBe(g);
  });

  it('historique borné', () => {
    let g = newGame(puzzle, 0);
    for (let i = 0; i < MAX_HISTORY + 50; i++) g = reduceQueens(g, { type: 'tap', cell: 0, now: i });
    expect(g.past).toHaveLength(MAX_HISTORY);
  });

  it('chronomètre : pauses exclues, reprise par une action', () => {
    let g = newGame(puzzle, 1000);
    expect(elapsedAt(g, 4000)).toBe(3000);
    g = reduceQueens(g, { type: 'pause', now: 4000 });
    expect(elapsedAt(g, 9000)).toBe(3000);
    g = reduceQueens(g, { type: 'tap', cell: 0, now: 10_000 });
    expect(elapsedAt(g, 11_000)).toBe(4000);
    g = reduceQueens(g, { type: 'resume', now: 12_000 });
    expect(elapsedAt(g, 12_000)).toBe(5000);
  });

  it('victoire : détectée, chrono arrêté, grille figée ; conflits signalés', () => {
    let g: QueensGame = newGame(puzzle, 0);
    const sameRow = sol[0] === 0 ? 1 : 0; // autre case de la ligne 0
    g = reduceQueens(g, { type: 'tap', cell: sol[0]!, now: 1 });
    g = reduceQueens(g, { type: 'tap', cell: sameRow, now: 2 });
    expect(conflictCells(g)).toEqual([sol[0]!, sameRow].sort((a, b) => a - b));
    g = reduceQueens(g, { type: 'undo', now: 3 });
    for (const [i, cell] of sol.slice(1).entries()) g = reduceQueens(g, { type: 'tap', cell, now: 10 + i });
    expect(g.solved).toBe(true);
    expect(elapsedAt(g, 999_999)).toBe(10 + sol.length - 2);
    expect(reduceQueens(g, { type: 'tap', cell: 0, now: 2000 })).toBe(g);
  });

  it('indice joué : compteur incrémenté, conservé après « recommencer »', () => {
    let g = newGame(puzzle, 0);
    g = reduceQueens(g, { type: 'set', cell: sol[0]!, mark: MARK_QUEEN, now: 1, hint: true });
    expect(g.hintsUsed).toBe(1);
    g = reduceQueens(g, { type: 'reset', now: 2 });
    expect(g.hintsUsed).toBe(1);
    expect(g.marks.every((m) => m === MARK_EMPTY)).toBe(true);
  });
});
