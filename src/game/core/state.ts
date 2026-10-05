/**
 * État d'une partie (réducteur pur, commun à tous les types) : marques, annuler/rétablir,
 * chronomètre (temps cumulé hors pauses), victoire, indices utilisés. Les règles du type
 * (`GameRules`) décident de l'effet d'un toucher, des cases données et de la victoire.
 */
import type { GameRules, Mark } from './rules';

/** Historique borné (mémoire et persistance). */
export const MAX_HISTORY = 200;

export interface GameState<P> {
  readonly puzzle: P;
  readonly marks: readonly Mark[];
  readonly past: readonly (readonly Mark[])[];
  readonly future: readonly (readonly Mark[])[];
  /** Temps cumulé des périodes de jeu terminées (ms). */
  readonly elapsedMs: number;
  /** Début de la période en cours (horloge `now` du réducteur), null si en pause. */
  readonly runningSince: number | null;
  readonly solved: boolean;
  readonly hintsUsed: number;
  /** Trait de glisser qui a produit la dernière entrée d'historique (ses peintures suivantes s'y ajoutent). */
  readonly stroke: number | null;
}

export type GameAction =
  | { type: 'tap'; cell: number; now: number }
  /** Second toucher rapide (règle `doubleTap` du type, sinon un toucher de plus). */
  | { type: 'doubleTap'; cell: number; now: number }
  /**
   * Glisser : les cases traversées qui portent `from` prennent `to`. Les peintures d'un même trait
   * (`stroke`) forment une seule entrée d'historique.
   */
  | { type: 'paint'; cells: readonly number[]; from: Mark; to: Mark; stroke?: number; now: number }
  | { type: 'set'; cell: number; mark: Mark; now: number }
  /** Plusieurs cases d'un coup (déduction d'un indice), une seule entrée d'historique. */
  | { type: 'setMany'; changes: readonly { cell: number; mark: Mark }[]; now: number }
  /** Indice consulté (compté même s'il n'est pas joué). */
  | { type: 'hintShown'; now: number }
  | { type: 'undo'; now: number }
  | { type: 'redo'; now: number }
  | { type: 'reset'; now: number }
  | { type: 'pause'; now: number }
  | { type: 'resume'; now: number };

export function newGameState<P>(rules: GameRules<P>, puzzle: P, now: number | null): GameState<P> {
  return { puzzle, marks: rules.initial(puzzle), past: [], future: [], elapsedMs: 0, runningSince: now, solved: false, hintsUsed: 0, stroke: null };
}

/** Partie déjà gagnée reconstituée depuis la solution (sauvegarde effacée, résultat connu). */
export function solvedGameState<P>(rules: GameRules<P>, puzzle: P, elapsedMs: number, hintsUsed: number): GameState<P> {
  return { ...newGameState(rules, puzzle, null), marks: rules.solution(puzzle), elapsedMs, hintsUsed, solved: true };
}

/** Temps écoulé affichable à l'instant `now`. */
export function elapsedAt(g: GameState<unknown>, now: number): number {
  return g.elapsedMs + (g.runningSince === null ? 0 : Math.max(0, now - g.runningSince));
}

function stopClock<P>(g: GameState<P>, now: number): GameState<P> {
  return g.runningSince === null ? g : { ...g, elapsedMs: elapsedAt(g, now), runningSince: null };
}

/**
 * Applique de nouvelles marques comme une entrée d'historique (ou, avec `amend`, en complétant la
 * dernière entrée), puis teste la victoire. Les cases données ne changent jamais.
 */
function commit<P>(rules: GameRules<P>, g: GameState<P>, wanted: readonly Mark[], now: number, stroke: number | null = null, amend = false): GameState<P> {
  const marks = wanted.map((m, i) => (rules.locked(g.puzzle, i) ? g.marks[i]! : m));
  if (marks.every((m, i) => m === g.marks[i])) return g;
  const past = amend ? g.past : [...g.past, g.marks].slice(-MAX_HISTORY);
  let next: GameState<P> = { ...g, marks, past, future: [], stroke };
  // Toute action relance le chronomètre s'il était en pause (sauf partie finie).
  if (next.runningSince === null && !next.solved) next = { ...next, runningSince: now };
  if (rules.check(next.puzzle, marks).solved) next = { ...stopClock(next, now), solved: true };
  return next;
}

export function reduceGame<P>(rules: GameRules<P>, g: GameState<P>, a: GameAction): GameState<P> {
  if (g.solved && a.type !== 'pause' && a.type !== 'resume') return g;
  switch (a.type) {
    case 'tap': {
      const marks = [...g.marks];
      marks[a.cell] = rules.tap(marks[a.cell]!);
      return commit(rules, g, marks, a.now);
    }
    case 'doubleTap': {
      if (!rules.doubleTap) return reduceGame(rules, g, { type: 'tap', cell: a.cell, now: a.now });
      // L'état avant le premier toucher est le sommet de l'historique : on le remplace.
      const before = g.past.at(-1);
      if (!before) return g;
      const marks = [...before];
      marks[a.cell] = rules.doubleTap(before[a.cell]!);
      const rewound: GameState<P> = { ...g, marks: before, past: g.past.slice(0, -1) };
      return commit(rules, rewound, marks, a.now);
    }
    case 'paint': {
      const marks = [...g.marks];
      for (const cell of a.cells) if (marks[cell] === a.from) marks[cell] = a.to;
      const stroke = a.stroke ?? null;
      return commit(rules, g, marks, a.now, stroke, stroke !== null && stroke === g.stroke && g.past.length > 0);
    }
    case 'set': {
      const marks = [...g.marks];
      marks[a.cell] = a.mark;
      return commit(rules, g, marks, a.now);
    }
    case 'setMany': {
      const marks = [...g.marks];
      for (const { cell, mark } of a.changes) marks[cell] = mark;
      return commit(rules, g, marks, a.now);
    }
    case 'hintShown':
      return { ...g, hintsUsed: g.hintsUsed + 1 };
    case 'undo': {
      const prev = g.past.at(-1);
      if (!prev) return g;
      return { ...g, marks: prev, past: g.past.slice(0, -1), future: [g.marks, ...g.future].slice(0, MAX_HISTORY), stroke: null };
    }
    case 'redo': {
      const next = g.future[0];
      if (!next) return g;
      return { ...g, marks: next, past: [...g.past, g.marks].slice(-MAX_HISTORY), future: g.future.slice(1), stroke: null };
    }
    case 'reset':
      // Grille effacée (annulable) ; le chronomètre et les indices comptés continuent.
      return commit(rules, g, rules.initial(g.puzzle), a.now);
    case 'pause':
      return stopClock(g, a.now);
    case 'resume':
      return g.runningSince !== null || g.solved ? g : { ...g, runningSince: a.now };
  }
}

/** Partie entamée : un coup joué, ou des marques différentes de la grille de départ. */
export function isStarted<P>(rules: GameRules<P>, g: GameState<P>): boolean {
  if (g.past.length > 0) return true;
  const initial = rules.initial(g.puzzle);
  return g.marks.some((m, i) => m !== initial[i]);
}
