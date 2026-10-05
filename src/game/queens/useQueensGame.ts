/**
 * Partie de Queens côté React : réducteur + chronomètre (pause automatique hors écran / app en
 * arrière-plan) + sauvegarde locale + retour haptique.
 */
import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { checkQueensBoard } from '../../../engine/queens/rules';
import type { QueensMark, QueensSolvedPuzzle } from '../../../engine/queens/types';
import { haptic, onAppActiveChange } from '../../platform';
import { loadJSON, saveJSON } from '../../platform/storage';
import type { GestureEvent } from './gestures';
import { MARK_CROSS, MARK_QUEEN, attackedCells, decodeMarks, encodeMarks } from './marks';
import { elapsedAt, newGame, reduceQueens, type QueensAction, type QueensGame } from './state';

/** Sauvegarde d'une partie (marques compactes, historique borné). */
export interface SavedQueensGame {
  readonly v: 1;
  readonly puzzle: string;
  readonly marks: string;
  readonly past: readonly string[];
  readonly future: readonly string[];
  readonly elapsedMs: number;
  readonly solved: boolean;
  readonly hintsUsed: number;
}

const puzzleKey = (p: QueensSolvedPuzzle) => `${p.size}:${p.regions.join('')}`;
const now = () => performance.now();

export function serializeGame(g: QueensGame, at: number): SavedQueensGame {
  return {
    v: 1,
    puzzle: puzzleKey(g.puzzle),
    marks: encodeMarks(g.marks),
    past: g.past.map(encodeMarks),
    future: g.future.map(encodeMarks),
    elapsedMs: Math.round(elapsedAt(g, at)),
    solved: g.solved,
    hintsUsed: g.hintsUsed,
  };
}

/** Restaure une sauvegarde (en pause) ; null si elle ne correspond pas à cette grille. */
export function deserializeGame(s: SavedQueensGame | undefined, puzzle: QueensSolvedPuzzle): QueensGame | null {
  if (!s || s.v !== 1 || s.puzzle !== puzzleKey(puzzle)) return null;
  const marks = decodeMarks(s.marks, puzzle);
  if (!marks) return null;
  const list = (codes: readonly string[]) => codes.map((c) => decodeMarks(c, puzzle)).filter((m): m is QueensMark[] => m !== null);
  return {
    puzzle,
    marks,
    past: list(s.past),
    future: list(s.future),
    elapsedMs: Math.max(0, s.elapsedMs || 0),
    runningSince: null,
    solved: s.solved && checkQueensBoard(puzzle, marks).solved,
    hintsUsed: Math.max(0, s.hintsUsed || 0),
  };
}

type Internal = { game: QueensGame | null };
type InternalAction = { type: 'load'; game: QueensGame } | { type: 'act'; action: QueensAction };

function internalReducer(state: Internal, a: InternalAction): Internal {
  if (a.type === 'load') return { game: a.game };
  return state.game ? { game: reduceQueens(state.game, a.action) } : state;
}

export interface UseQueensGameOptions {
  readonly puzzle: QueensSolvedPuzzle | null;
  /** Clé de sauvegarde (une par puzzle du jour / partie illimitée). */
  readonly storageKey: string | null;
  /** Écran visible : le chronomètre ne tourne que dans ce cas (et app au premier plan). */
  readonly visible: boolean;
  readonly autoCross: boolean;
  readonly onSolved?: (game: QueensGame) => void;
}

export function useQueensGame({ puzzle, storageKey, visible, autoCross, onSolved }: UseQueensGameOptions) {
  const [{ game }, dispatch] = useReducer(internalReducer, { game: null });
  const appActive = useRef(true);
  const gameRef = useRef<QueensGame | null>(null);
  gameRef.current = game;
  const onSolvedRef = useRef(onSolved);
  onSolvedRef.current = onSolved;

  // Chargement (sauvegarde ou nouvelle partie) à chaque nouvelle grille.
  useEffect(() => {
    if (!puzzle || !storageKey) return;
    let cancelled = false;
    void loadJSON<SavedQueensGame>(storageKey).then((saved) => {
      if (cancelled) return;
      dispatch({ type: 'load', game: deserializeGame(saved, puzzle) ?? newGame(puzzle, null) });
    });
    return () => {
      cancelled = true;
    };
  }, [puzzle, storageKey]);

  const act = useCallback((action: QueensAction) => dispatch({ type: 'act', action }), []);

  // Chronomètre : tourne seulement si l'écran est visible et l'app au premier plan.
  const running = visible && game !== null && !game.solved;
  useEffect(() => {
    if (!running) return;
    if (appActive.current) act({ type: 'resume', now: now() });
    const off = onAppActiveChange((active) => {
      appActive.current = active;
      act({ type: active ? 'resume' : 'pause', now: now() });
    });
    return () => {
      off();
      act({ type: 'pause', now: now() });
    };
  }, [running, act]);

  // Sauvegarde (différée) de chaque changement, et immédiate à la mise en pause.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!game || !storageKey) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const delay = game.runningSince === null ? 0 : 400;
    saveTimer.current = setTimeout(() => void saveJSON(storageKey, serializeGame(game, now())), delay);
  }, [game, storageKey]);

  // Victoire : une seule notification par partie.
  const wasSolved = useRef<boolean | null>(null);
  useEffect(() => {
    if (!game) return;
    if (wasSolved.current === false && game.solved) {
      void haptic('success');
      onSolvedRef.current?.(game);
    }
    wasSolved.current = game.solved;
  }, [game]);
  useEffect(() => {
    wasSolved.current = null;
  }, [puzzle]);

  const gesture = useCallback(
    (e: GestureEvent) => {
      const before = gameRef.current;
      if (!before || before.solved) return;
      const t = now();
      if (e.type === 'tap') {
        act({ type: 'tap', cell: e.cell, now: t });
        void haptic(before.marks[e.cell] === MARK_QUEEN ? 'select' : 'tap');
      } else if (e.type === 'doubleTap') {
        act({ type: 'doubleTap', cell: e.cell, now: t });
        void haptic('select');
      } else {
        act({ type: 'paint', cells: e.cells, mode: e.mode, now: t });
        void haptic('select');
      }
    },
    [act],
  );

  const conflicts = useMemo(() => (game ? checkQueensBoard(game.puzzle, game.marks).conflicts : []), [game]);
  const prevConflicts = useRef(0);
  useEffect(() => {
    if (conflicts.length > prevConflicts.current) void haptic('warning');
    prevConflicts.current = conflicts.length;
  }, [conflicts]);

  const attacked = useMemo(() => (game && autoCross ? attackedCells(game.puzzle, game.marks) : undefined), [game, autoCross]);

  return {
    game,
    conflicts,
    attacked,
    gesture,
    undo: () => act({ type: 'undo', now: now() }),
    redo: () => act({ type: 'redo', now: now() }),
    reset: () => act({ type: 'reset', now: now() }),
    /** Indice affiché au joueur (compté). */
    noteHint: () => act({ type: 'hintShown', now: now() }),
    /** Joue la case révélée par un indice. */
    applyHint: (cell: number, mark: 'queen' | 'cross') => {
      act({ type: 'set', cell, mark: mark === 'queen' ? MARK_QUEEN : MARK_CROSS, now: now() });
      void haptic('tap');
    },
    elapsed: () => (gameRef.current ? elapsedAt(gameRef.current, now()) : 0),
  };
}
