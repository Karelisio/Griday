/**
 * Partie de Queens côté React : réducteur + chronomètre (pause automatique hors écran / app en
 * arrière-plan) + sauvegarde locale + retour haptique.
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { checkQueensBoard } from '../../../engine/queens/rules';
import type { QueensMark, QueensSolvedPuzzle } from '../../../engine/queens/types';
import { haptic, onAppActiveChange } from '../../platform';
import { loadJSON, saveJSON } from '../../platform/storage';
import type { HintMove } from './explain';
import { DOUBLE_TAP_MS, type GestureEvent } from './gestures';
import { MARK_CROSS, MARK_EMPTY, MARK_QUEEN, attackedCells, decodeMarks, encodeMarks } from './marks';
import { elapsedAt, newGame, reduceQueens, solvedGame, type QueensAction, type QueensGame } from './state';

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

const finiteCount = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);

/** Restaure une sauvegarde (en pause) ; null si elle est illisible ou ne correspond pas à cette grille. */
export function deserializeGame(s: unknown, puzzle: QueensSolvedPuzzle): QueensGame | null {
  if (typeof s !== 'object' || s === null) return null;
  const saved = s as Partial<Record<keyof SavedQueensGame, unknown>>;
  if (saved.v !== 1 || saved.puzzle !== puzzleKey(puzzle) || typeof saved.marks !== 'string') return null;
  const marks = decodeMarks(saved.marks, puzzle);
  if (!marks) return null;
  const list = (codes: unknown) =>
    Array.isArray(codes)
      ? codes.map((c) => (typeof c === 'string' ? decodeMarks(c, puzzle) : null)).filter((m): m is QueensMark[] => m !== null)
      : [];
  return {
    puzzle,
    marks,
    past: list(saved.past),
    future: list(saved.future),
    elapsedMs: finiteCount(saved.elapsedMs),
    runningSince: null,
    solved: saved.solved === true && checkQueensBoard(puzzle, marks).solved,
    hintsUsed: Math.floor(finiteCount(saved.hintsUsed)),
    stroke: null,
  };
}

/** La partie chargée est rattachée à sa clé : une autre grille ne voit jamais l'ancienne partie. */
type Internal = { key: string | null; game: QueensGame | null };
type InternalAction = { type: 'load'; key: string; game: QueensGame } | { type: 'act'; action: QueensAction };

function internalReducer(state: Internal, a: InternalAction): Internal {
  if (a.type === 'load') return { key: a.key, game: a.game };
  if (!state.game) return state;
  const game = reduceQueens(state.game, a.action);
  return game === state.game ? state : { ...state, game };
}


const HINT_MARK: Record<HintMove['mark'], QueensMark> = { queen: MARK_QUEEN, cross: MARK_CROSS, empty: MARK_EMPTY };

export interface UseQueensGameOptions {
  readonly puzzle: QueensSolvedPuzzle | null;
  /** Clé de sauvegarde (une par puzzle du jour / partie illimitée). */
  readonly storageKey: string | null;
  /** Écran visible : le chronomètre ne tourne que dans ce cas (et app au premier plan). */
  readonly visible: boolean;
  readonly autoCross: boolean;
  readonly onSolved?: (game: QueensGame) => void;
  /** Sans sauvegarde : partie reconstituée gagnée (puzzle déjà résolu, sauvegarde nettoyée). */
  readonly solvedFallback?: { readonly timeMs: number; readonly hintsUsed: number } | null;
}

export function useQueensGame({ puzzle, storageKey, visible, autoCross, onSolved, solvedFallback }: UseQueensGameOptions) {
  const [state, dispatch] = useReducer(internalReducer, { key: null, game: null });
  const key = useMemo(() => (puzzle && storageKey ? `${storageKey}|${puzzleKey(puzzle)}` : null), [puzzle, storageKey]);
  const game = key !== null && state.key === key ? state.game : null;
  const appActive = useRef(true);
  const gameRef = useRef<QueensGame | null>(null);
  gameRef.current = game;
  const onSolvedRef = useRef(onSolved);
  onSolvedRef.current = onSolved;
  const fallbackRef = useRef(solvedFallback);
  fallbackRef.current = solvedFallback;

  // Chargement (sauvegarde ou nouvelle partie) à chaque nouvelle grille.
  useEffect(() => {
    if (!puzzle || !storageKey || key === null) return;
    let cancelled = false;
    void loadJSON<unknown>(storageKey).then((saved) => {
      if (cancelled) return;
      const won = fallbackRef.current;
      const fresh = won ? solvedGame(puzzle, won.timeMs, won.hintsUsed) : newGame(puzzle, null);
      dispatch({ type: 'load', key, game: deserializeGame(saved, puzzle) ?? fresh });
    });
    return () => {
      cancelled = true;
    };
  }, [puzzle, storageKey, key]);

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

  // Sauvegarde différée de chaque changement (immédiate en pause), écrite sans attendre au
  // changement de grille et au démontage.
  const pending = useRef<{ storageKey: string; game: QueensGame } | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flush = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = null;
    const p = pending.current;
    pending.current = null;
    if (p) void saveJSON(p.storageKey, serializeGame(p.game, now()));
  }, []);
  useEffect(() => {
    if (!game || !storageKey) return;
    pending.current = { storageKey, game };
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flush, game.runningSince === null ? 0 : 400);
  }, [game, storageKey, flush]);
  useEffect(() => flush, [key, flush]);

  // Victoire : une seule notification, quand elle survient pendant la partie (pas au chargement).
  const seen = useRef<{ key: string; solved: boolean } | null>(null);
  useEffect(() => {
    if (!game || key === null) return;
    const before = seen.current;
    if (before && before.key === key && !before.solved && game.solved) {
      void haptic('success');
      onSolvedRef.current?.(game);
    }
    seen.current = { key, solved: game.solved };
  }, [game, key]);

  // Conflits. Une reine posée par un toucher n'est signalée qu'une fois la fenêtre du double
  // toucher écoulée : si le joueur voulait une croix, aucune alerte ne clignote.
  const rawConflicts = useMemo(() => (game ? checkQueensBoard(game.puzzle, game.marks).conflicts : []), [game]);
  const [held, setHeld] = useState<readonly number[] | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const conflicts = held ?? rawConflicts;
  const shownConflicts = useRef(conflicts);
  shownConflicts.current = conflicts;
  const release = useCallback(() => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
    setHeld(null);
  }, []);
  useEffect(() => release, [release]);
  useEffect(release, [key, release]);

  const prevConflicts = useRef<{ key: string | null; count: number }>({ key: null, count: 0 });
  useEffect(() => {
    const prev = prevConflicts.current;
    if (prev.key === key && conflicts.length > prev.count) void haptic('warning');
    prevConflicts.current = { key, count: conflicts.length };
  }, [conflicts, key]);

  const gesture = useCallback(
    (e: GestureEvent) => {
      const before = gameRef.current;
      if (!before || before.solved) return;
      const t = now();
      if (e.type === 'tap') {
        const placing = before.marks[e.cell] !== MARK_QUEEN;
        if (placing) {
          setHeld(shownConflicts.current);
          if (holdTimer.current) clearTimeout(holdTimer.current);
          holdTimer.current = setTimeout(release, DOUBLE_TAP_MS);
        } else release();
        act({ type: 'tap', cell: e.cell, now: t });
        void haptic(placing ? 'tap' : 'select');
      } else if (e.type === 'doubleTap') {
        release();
        act({ type: 'doubleTap', cell: e.cell, now: t });
        void haptic('select');
      } else {
        release();
        act({ type: 'paint', cells: e.cells, mode: e.mode, stroke: e.stroke, now: t });
        void haptic('select');
      }
    },
    [act, release],
  );

  const attacked = useMemo(() => (game && autoCross ? attackedCells(game.puzzle, game.marks) : undefined), [game, autoCross]);

  // Un même indice redemandé (sans nouvelle déduction) n'est compté qu'une fois.
  const lastHint = useRef<{ key: string | null; hint: string } | null>(null);
  const noteHint = useCallback(
    (hintKey: string) => {
      if (lastHint.current?.key === key && lastHint.current.hint === hintKey) return;
      lastHint.current = { key, hint: hintKey };
      act({ type: 'hintShown', now: now() });
    },
    [act, key],
  );

  const applyHint = useCallback(
    (moves: readonly HintMove[]) => {
      release();
      act({ type: 'setMany', changes: moves.map((m) => ({ cell: m.cell, mark: HINT_MARK[m.mark] })), now: now() });
      void haptic('tap');
    },
    [act, release],
  );

  return {
    game,
    conflicts,
    attacked,
    gesture,
    undo: () => {
      release();
      act({ type: 'undo', now: now() });
    },
    redo: () => {
      release();
      act({ type: 'redo', now: now() });
    },
    reset: () => {
      release();
      act({ type: 'reset', now: now() });
    },
    /** Indice affiché au joueur : compté une fois par déduction distincte (`hintKey`). */
    noteHint,
    /** Joue les cases d'un indice (une seule entrée d'historique). */
    applyHint,
    elapsed: () => (gameRef.current ? elapsedAt(gameRef.current, now()) : 0),
  };
}
