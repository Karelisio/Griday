import { describe, expect, it } from 'vitest';
import type { BinairoSolvedPuzzle } from '../../../engine/binairo/types';
import { newGameState, reduceGame, type GameState } from '../core/state';
import { deserializeGame, serializeGame } from '../core/useGameSession';
import { BINAIRO_RULES } from './rules';

// Grille 6 × 6 à solution unique (1 = soleil, 2 = lune).
const PUZZLE: BinairoSolvedPuzzle = {
  size: 6,
  givens: [2, 0, 0, 2, 2, 0, 0, 1, 0, 2, 1, 2, 1, 2, 0, 0, 0, 2, 0, 0, 2, 0, 2, 1, 0, 0, 0, 0, 1, 2, 0, 2, 0, 0, 0, 0],
  solution: [2, 1, 1, 2, 2, 1, 2, 1, 1, 2, 1, 2, 1, 2, 2, 1, 1, 2, 2, 1, 2, 1, 2, 1, 1, 2, 1, 2, 1, 2, 1, 2, 2, 1, 2, 1],
};
const R = BINAIRO_RULES;
const empties = PUZZLE.givens.flatMap((g, i) => (g === 0 ? [i] : []));
let clock = 0;
const tap = (g: GameState<BinairoSolvedPuzzle>, cell: number) => reduceGame(R, g, { type: 'tap', cell, now: ++clock });

describe('règles de jeu Binairo', () => {
  it('clé, nombre de cases, marques de départ, solution', () => {
    expect(R.key(PUZZLE)).toBe(`b6:${PUZZLE.givens.join('')}`);
    expect(R.key({ ...PUZZLE, givens: [...PUZZLE.givens].fill(0, 0, 1) })).not.toBe(R.key(PUZZLE));
    expect(R.key({ ...PUZZLE, size: 8 })).not.toBe(R.key(PUZZLE));
    expect(R.cells(PUZZLE)).toBe(36);
    expect(R.initial(PUZZLE)).toEqual([...PUZZLE.givens]);
    expect(R.solution(PUZZLE)).toEqual([...PUZZLE.solution]);
    // Copies : modifier le résultat ne touche jamais la grille.
    R.initial(PUZZLE)[1] = 2;
    expect(PUZZLE.givens[1]).toBe(0);
  });

  it('seules les cases données sont verrouillées', () => {
    for (let cell = 0; cell < 36; cell++) expect(R.locked(PUZZLE, cell), `case ${cell}`).toBe(PUZZLE.givens[cell] !== 0);
  });

  it('chaque toucher fait tourner vide → soleil → lune → vide ; pas de double toucher spécial', () => {
    expect([0, 1, 2].map((m) => R.tap(m as 0 | 1 | 2))).toEqual([1, 2, 0]);
    expect(R.doubleTap).toBeUndefined();
    // Le joueur fait tourner la case : l'alerte de conflit attend dans tous les cas.
    for (const m of [0, 1, 2] as const) expect(R.holdConflictsAfterTap(m)).toBe(true);
  });

  it('check : aucune infraction au départ ; victoire sur la solution seulement', () => {
    expect(R.check(PUZZLE, R.initial(PUZZLE))).toEqual({ conflicts: [], solved: false });
    expect(R.check(PUZZLE, R.solution(PUZZLE))).toEqual({ conflicts: [], solved: true });
    // Une grille pleine mais fausse n'est pas une victoire.
    const wrong = R.solution(PUZZLE);
    wrong[1] = 2;
    const r = R.check(PUZZLE, wrong);
    expect(r.solved).toBe(false);
    expect(r.conflicts.length).toBeGreaterThan(0);
  });

  it('check : un triplet signale ses trois cases (données comprises), un excès toutes les cases du symbole', () => {
    // Rangée 3 : . . 2 [2] 2 1 → triplet de lunes en colonnes 2, 3, 4 (3 lunes seulement : pas d'excès).
    const triple = R.initial(PUZZLE);
    triple[3 * 6 + 3] = 2;
    expect(R.check(PUZZLE, triple)).toEqual({ conflicts: [20, 21, 22], solved: false });
    // Rangée 0 : 2 . [2] 2 2 . → triplet en 2, 3, 4 et 4 lunes (> 3) : la lune de la colonne 0 est signalée aussi.
    const excess = R.initial(PUZZLE);
    excess[2] = 2;
    expect(R.check(PUZZLE, excess)).toEqual({ conflicts: [0, 2, 3, 4], solved: false });
  });

  it('session : un toucher sur une case donnée ne change rien ; les autres tournent', () => {
    let g = newGameState(R, PUZZLE, 0);
    const given = PUZZLE.givens.findIndex((v) => v !== 0);
    const same = tap(g, given);
    expect(same.marks).toEqual(g.marks);
    expect(same.past).toHaveLength(0);
    const free = empties[0]!;
    g = tap(g, free);
    expect(g.marks[free]).toBe(1);
    g = tap(g, free);
    expect(g.marks[free]).toBe(2);
    g = tap(g, free);
    expect(g.marks[free]).toBe(0);
    expect(g.past).toHaveLength(3);
  });

  it('session : jouer la solution au toucher termine la partie', () => {
    let g = newGameState(R, PUZZLE, 0);
    for (const cell of empties) {
      const want = PUZZLE.solution[cell]!;
      while (g.marks[cell] !== want) g = tap(g, cell);
    }
    expect(g.solved).toBe(true);
    expect(g.marks).toEqual([...PUZZLE.solution]);
  });

  it('session : « recommencer » revient aux données ; sauvegarde et relecture à l’identique', () => {
    let g = newGameState(R, PUZZLE, 0);
    g = tap(tap(g, empties[0]!), empties[3]!);
    const saved = serializeGame(R, g, 0);
    expect(saved.puzzle).toBe(R.key(PUZZLE));
    const back = deserializeGame(R, JSON.parse(JSON.stringify(saved)), PUZZLE);
    expect(back?.marks).toEqual(g.marks);
    expect(back?.past).toHaveLength(2);
    // Une sauvegarde qui modifie une case donnée ne vient pas de cette grille.
    const forged = { ...saved, marks: saved.marks.replace(/^2/, '1') };
    expect(deserializeGame(R, forged, PUZZLE)).toBeNull();
    // Une autre grille ne relit jamais cette sauvegarde.
    expect(deserializeGame(R, saved, { ...PUZZLE, givens: [...PUZZLE.givens].fill(0, 0, 1) })).toBeNull();
    const reset = reduceGame(R, g, { type: 'reset', now: 9 });
    expect(reset.marks).toEqual([...PUZZLE.givens]);
  });
});
