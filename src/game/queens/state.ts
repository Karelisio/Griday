/**
 * État d'une partie de Queens (réducteur pur, testable) : marques, annuler/rétablir,
 * chronomètre (temps cumulé hors pauses), victoire, indices utilisés.
 */
import { checkQueensBoard } from '../../../engine/queens/rules';
import type { QueensMark, QueensSolvedPuzzle } from '../../../engine/queens/types';
import { MARK_CROSS, MARK_EMPTY, MARK_QUEEN, emptyMarks } from './marks';

/** Historique borné (mémoire et persistance). */
export const MAX_HISTORY = 200;

export interface QueensGame {
  readonly puzzle: QueensSolvedPuzzle;
  readonly marks: readonly QueensMark[];
  readonly past: readonly (readonly QueensMark[])[];
  readonly future: readonly (readonly QueensMark[])[];
  /** Temps cumulé des périodes de jeu terminées (ms). */
  readonly elapsedMs: number;
  /** Début de la période en cours (horloge `now` du réducteur), null si en pause. */
  readonly runningSince: number | null;
  readonly solved: boolean;
  readonly hintsUsed: number;
}

export type QueensAction =
  /** Toucher : reine ↔ vide (une croix devient une reine). */
  | { type: 'tap'; cell: number; now: number }
  /** Second toucher rapide : remplace l'effet du premier par une croix (ou efface une croix). */
  | { type: 'doubleTap'; cell: number; now: number }
  /** Glisser : croix sur les cases vides traversées (ou efface les croix), une seule entrée d'historique. */
  | { type: 'paint'; cells: readonly number[]; mode: 'cross' | 'erase'; now: number }
  | { type: 'set'; cell: number; mark: QueensMark; now: number }
  /** Indice consulté (compté même s'il n'est pas joué). */
  | { type: 'hintShown'; now: number }
  | { type: 'undo'; now: number }
  | { type: 'redo'; now: number }
  | { type: 'reset'; now: number }
  | { type: 'pause'; now: number }
  | { type: 'resume'; now: number };

export function newGame(puzzle: QueensSolvedPuzzle, now: number | null): QueensGame {
  return { puzzle, marks: emptyMarks(puzzle), past: [], future: [], elapsedMs: 0, runningSince: now, solved: false, hintsUsed: 0 };
}

/** Temps écoulé affichable à l'instant `now`. */
export function elapsedAt(g: QueensGame, now: number): number {
  return g.elapsedMs + (g.runningSince === null ? 0 : Math.max(0, now - g.runningSince));
}

function stopClock(g: QueensGame, now: number): QueensGame {
  return g.runningSince === null ? g : { ...g, elapsedMs: elapsedAt(g, now), runningSince: null };
}

/** Applique de nouvelles marques comme une entrée d'historique, puis teste la victoire. */
function commit(g: QueensGame, marks: QueensMark[], now: number, extra: Partial<QueensGame> = {}): QueensGame {
  if (marks.every((m, i) => m === g.marks[i])) return g;
  const past = [...g.past, g.marks].slice(-MAX_HISTORY);
  let next: QueensGame = { ...g, ...extra, marks, past, future: [] };
  // Toute action relance le chronomètre s'il était en pause (sauf partie finie).
  if (next.runningSince === null && !next.solved) next = { ...next, runningSince: now };
  if (checkQueensBoard(next.puzzle, marks).solved) next = { ...stopClock(next, now), solved: true };
  return next;
}

export function reduceQueens(g: QueensGame, a: QueensAction): QueensGame {
  if (g.solved && a.type !== 'pause' && a.type !== 'resume' && a.type !== 'reset') return g;
  switch (a.type) {
    case 'tap': {
      const marks = [...g.marks];
      marks[a.cell] = marks[a.cell] === MARK_QUEEN ? MARK_EMPTY : MARK_QUEEN;
      return commit(g, marks, a.now);
    }
    case 'doubleTap': {
      // L'état avant le premier toucher est le sommet de l'historique : on le remplace.
      const before = g.past.at(-1);
      if (!before) return g;
      const marks = [...before];
      marks[a.cell] = before[a.cell] === MARK_CROSS ? MARK_EMPTY : MARK_CROSS;
      const rewound: QueensGame = { ...g, marks: before, past: g.past.slice(0, -1) };
      return commit(rewound, marks, a.now);
    }
    case 'paint': {
      const marks = [...g.marks];
      for (const cell of a.cells) {
        if (a.mode === 'cross' && marks[cell] === MARK_EMPTY) marks[cell] = MARK_CROSS;
        else if (a.mode === 'erase' && marks[cell] === MARK_CROSS) marks[cell] = MARK_EMPTY;
      }
      return commit(g, marks, a.now);
    }
    case 'set': {
      const marks = [...g.marks];
      marks[a.cell] = a.mark;
      return commit(g, marks, a.now);
    }
    case 'hintShown':
      return { ...g, hintsUsed: g.hintsUsed + 1 };
    case 'undo': {
      const prev = g.past.at(-1);
      if (!prev) return g;
      return { ...g, marks: prev, past: g.past.slice(0, -1), future: [g.marks, ...g.future].slice(0, MAX_HISTORY) };
    }
    case 'redo': {
      const next = g.future[0];
      if (!next) return g;
      return { ...g, marks: next, past: [...g.past, g.marks].slice(-MAX_HISTORY), future: g.future.slice(1) };
    }
    case 'reset':
      return { ...newGame(g.puzzle, a.now), hintsUsed: g.hintsUsed };
    case 'pause':
      return stopClock(g, a.now);
    case 'resume':
      return g.runningSince !== null || g.solved ? g : { ...g, runningSince: a.now };
  }
}

/** Reines en conflit (pour l'affichage). */
export function conflictCells(g: QueensGame): readonly number[] {
  return checkQueensBoard(g.puzzle, g.marks).conflicts;
}
