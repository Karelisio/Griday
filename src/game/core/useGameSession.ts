/**
 * Session de jeu côté React, commune à tous les types : réducteur + chronomètre (pause automatique
 * hors écran / app en arrière-plan) + sauvegarde locale + victoire + retour haptique.
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { haptic, onAppActiveChange } from '../../platform';
import { loadJSON, saveJSON } from '../../platform/storage';
import type { GameGesture } from './kind';
import { decodeMarks, encodeMarks, type GameRules, type Mark } from './rules';
import { elapsedAt, newGameState, reduceGame, solvedGameState, type GameAction, type GameState } from './state';

/** Sauvegarde d'une partie (marques compactes, historique borné). */
export interface SavedGame {
  readonly v: 1;
  readonly puzzle: string;
  readonly marks: string;
  readonly past: readonly string[];
  readonly future: readonly string[];
  readonly elapsedMs: number;
  readonly solved: boolean;
  readonly hintsUsed: number;
}

const now = () => performance.now();

export function serializeGame<P>(rules: GameRules<P>, g: GameState<P>, at: number): SavedGame {
  return {
    v: 1,
    puzzle: rules.key(g.puzzle),
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
export function deserializeGame<P>(rules: GameRules<P>, s: unknown, puzzle: P): GameState<P> | null {
  if (typeof s !== 'object' || s === null) return null;
  const saved = s as Partial<Record<keyof SavedGame, unknown>>;
  if (saved.v !== 1 || saved.puzzle !== rules.key(puzzle) || typeof saved.marks !== 'string') return null;
  const cells = rules.cells(puzzle);
  const initial = rules.initial(puzzle);
  // Des marques qui modifient une case donnée ne viennent pas de cette grille.
  const decode = (code: string) => {
    const m = decodeMarks(code, cells);
    return m && m.every((x, i) => !rules.locked(puzzle, i) || x === initial[i]) ? m : null;
  };
  const marks = decode(saved.marks);
  if (!marks) return null;
  const list = (codes: unknown) =>
    Array.isArray(codes) ? codes.map((c) => (typeof c === 'string' ? decode(c) : null)).filter((m): m is Mark[] => m !== null) : [];
  return {
    puzzle,
    marks,
    past: list(saved.past),
    future: list(saved.future),
    elapsedMs: finiteCount(saved.elapsedMs),
    runningSince: null,
    solved: saved.solved === true && rules.check(puzzle, marks).solved,
    hintsUsed: Math.floor(finiteCount(saved.hintsUsed)),
    stroke: null,
  };
}

/** La partie chargée est rattachée à sa clé : une autre grille ne voit jamais l'ancienne partie. */
type Internal<P> = { key: string | null; game: GameState<P> | null };
type InternalAction<P> = { type: 'load'; key: string; game: GameState<P> } | { type: 'act'; rules: GameRules<P>; action: GameAction };

function internalReducer<P>(state: Internal<P>, a: InternalAction<P>): Internal<P> {
  if (a.type === 'load') return { key: a.key, game: a.game };
  if (!state.game) return state;
  const game = reduceGame(a.rules, state.game, a.action);
  return game === state.game ? state : { ...state, game };
}

export interface GameSessionOptions<P> {
  readonly puzzle: P | null;
  /** Clé de sauvegarde (une par puzzle du jour / partie illimitée). */
  readonly storageKey: string | null;
  /** Écran visible : le chronomètre ne tourne que dans ce cas (et app au premier plan). */
  readonly visible: boolean;
  readonly onSolved?: (game: GameState<P>) => void;
  /** Sans sauvegarde : partie reconstituée gagnée (puzzle déjà résolu, sauvegarde nettoyée). */
  readonly solvedFallback?: { readonly timeMs: number; readonly hintsUsed: number } | null;
  /**
   * Conflits signalés pendant la partie (réglage, vrai par défaut). Faux : aucune alerte, seule une
   * grille remplie mais fausse est signalée (`filledWrong`).
   */
  readonly showConflicts?: boolean;
}

/** Alertes retenues après un toucher : la case touchée et ce qui était signalé juste avant. */
interface HeldAlerts {
  readonly cell: number;
  readonly conflicts: ReadonlySet<number>;
  readonly filledWrong: boolean;
}

const NO_CELLS: readonly number[] = [];

export function useGameSession<P>(
  rules: GameRules<P>,
  { puzzle, storageKey, visible, onSolved, solvedFallback, showConflicts = true }: GameSessionOptions<P>,
) {
  const [state, dispatch] = useReducer(internalReducer<P>, { key: null, game: null });
  const key = useMemo(() => (puzzle && storageKey ? `${storageKey}|${rules.key(puzzle)}` : null), [rules, puzzle, storageKey]);
  const game = key !== null && state.key === key ? state.game : null;
  const appActive = useRef(true);
  const gameRef = useRef<GameState<P> | null>(null);
  gameRef.current = game;
  const rulesRef = useRef(rules);
  rulesRef.current = rules;
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
      const r = rulesRef.current;
      const won = fallbackRef.current;
      const fresh = won ? solvedGameState(r, puzzle, won.timeMs, won.hintsUsed) : newGameState(r, puzzle, null);
      dispatch({ type: 'load', key, game: deserializeGame(r, saved, puzzle) ?? fresh });
    });
    return () => {
      cancelled = true;
    };
  }, [puzzle, storageKey, key]);

  const act = useCallback((action: GameAction) => dispatch({ type: 'act', rules: rulesRef.current, action }), []);

  // Chronomètre : tourne seulement si l'écran est visible, l'app au premier plan et la partie pas mise en
  // attente par la vue (règles affichées à la première partie d'un type, avant le premier coup).
  const [onHold, setOnHold] = useState(false);
  const running = visible && !onHold && game !== null && !game.solved;
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
  // Les règles voyagent avec la partie : au changement de type (mode illimité), la sauvegarde en
  // attente de l'ancienne grille est écrite avec ses propres règles, pas celles de la nouvelle.
  const pending = useRef<{ storageKey: string; game: GameState<P>; rules: GameRules<P> } | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flush = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = null;
    const p = pending.current;
    pending.current = null;
    if (p) void saveJSON(p.storageKey, serializeGame(p.rules, p.game, now()));
  }, []);
  useEffect(() => {
    if (!game || !storageKey) return;
    pending.current = { storageKey, game, rules: rulesRef.current };
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

  // Alertes : conflits, ou (conflits non signalés) grille remplie mais fausse. Celles d'un toucher qui
  // peut encore être corrigé (toucher suivant sur la même case) attendent la fin de sa fenêtre : aucune
  // alerte ne clignote en passant. Entre-temps, une alerte déjà signalée reste tant qu'elle tient et
  // s'efface dès qu'elle est réglée.
  const checked = useMemo(() => (game ? rules.check(game.puzzle, game.marks) : null), [rules, game]);
  const [held, setHeldState] = useState<HeldAlerts | null>(null);
  const heldRef = useRef<HeldAlerts | null>(null);
  const setHeld = useCallback((h: HeldAlerts | null) => {
    heldRef.current = h;
    setHeldState(h);
  }, []);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const release = useCallback(() => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
    setHeld(null);
  }, [setHeld]);
  useEffect(() => release, [release]);
  useEffect(release, [key, release]);

  const conflicts = useMemo(() => {
    const raw = checked?.conflicts ?? NO_CELLS;
    if (!showConflicts || raw.length === 0) return NO_CELLS;
    return held ? raw.filter((c) => held.conflicts.has(c)) : raw;
  }, [checked, held, showConflicts]);
  const filledWrong =
    !showConflicts && game !== null && !game.solved && rules.filled(game.puzzle, game.marks) && (held === null || held.filledWrong);

  // Vibration à chaque nouveau conflit signalé (pas quand le réglage fait réapparaître les conflits existants).
  const prevConflicts = useRef<{ key: string | null; show: boolean; count: number }>({ key: null, show: showConflicts, count: 0 });
  useEffect(() => {
    const prev = prevConflicts.current;
    if (prev.key === key && prev.show === showConflicts && conflicts.length > prev.count) void haptic('warning');
    prevConflicts.current = { key, show: showConflicts, count: conflicts.length };
  }, [conflicts, key, showConflicts]);

  const gesture = useCallback(
    (e: GameGesture) => {
      const before = gameRef.current;
      if (!before || before.solved) return;
      const t = now();
      // Case donnée (verrouillée) : rien ne change, une vibration le signale.
      if ((e.type === 'tap' || e.type === 'doubleTap') && rulesRef.current.locked(before.puzzle, e.cell)) {
        void haptic('warning');
        return;
      }
      if (e.type === 'tap') {
        const r = rulesRef.current;
        const holdMs = r.conflictHoldAfterTap(before.marks[e.cell]!);
        if (holdMs > 0) {
          // Même case retouchée pendant sa fenêtre : on garde ce qui était signalé avant son premier toucher.
          // Une autre case : le coup précédent est acquis, ses alertes sont signalées sans attendre.
          if (heldRef.current?.cell !== e.cell) {
            setHeld({ cell: e.cell, conflicts: new Set(r.check(before.puzzle, before.marks).conflicts), filledWrong: r.filled(before.puzzle, before.marks) });
          }
          if (holdTimer.current) clearTimeout(holdTimer.current);
          holdTimer.current = setTimeout(release, holdMs);
        } else release();
        act({ type: 'tap', cell: e.cell, now: t });
        void haptic(holdMs > 0 ? 'tap' : 'select');
      } else if (e.type === 'doubleTap') {
        release();
        act({ type: 'doubleTap', cell: e.cell, now: t });
        void haptic('select');
      } else {
        release();
        act({ type: 'paint', cells: e.cells, from: e.from, to: e.to, stroke: e.stroke, now: t });
        void haptic('select');
      }
    },
    [act, release, setHeld],
  );

  // Un même indice redemandé (sans nouvelle déduction) n'est compté qu'une fois.
  const lastHint = useRef<{ key: string | null; hint: string } | null>(null);
  const isNewHint = useCallback((hintKey: string) => !(lastHint.current?.key === key && lastHint.current.hint === hintKey), [key]);
  const noteHint = useCallback(
    (hintKey: string) => {
      if (!isNewHint(hintKey)) return;
      lastHint.current = { key, hint: hintKey };
      act({ type: 'hintShown', now: now() });
    },
    [act, key, isNewHint],
  );

  const applyHint = useCallback(
    (moves: readonly { readonly cell: number; readonly mark: Mark }[]) => {
      release();
      act({ type: 'setMany', changes: moves, now: now() });
      void haptic('tap');
    },
    [act, release],
  );

  return {
    game,
    /** Cases en conflit signalées (vide si le réglage les masque). */
    conflicts,
    /** Conflits masqués par le réglage : grille remplie mais fausse (sans dire où). */
    filledWrong,
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
    /** Cet indice compterait-il comme un nouvel indice ? (faux pour le dernier indice compté, redemandé sans nouvelle déduction) */
    isNewHint,
    /** Indice affiché au joueur : compté une fois par déduction distincte (`hintKey`). */
    noteHint,
    /** Joue les cases d'un indice (une seule entrée d'historique). */
    applyHint,
    elapsed: () => (gameRef.current ? elapsedAt(gameRef.current, now()) : 0),
    /** Met le chronomètre en attente (vrai) ou le libère (faux). */
    hold: setOnHold,
  };
}

export type GameSession<P> = ReturnType<typeof useGameSession<P>>;
