/**
 * Partie de Queens côté React : la session générique (`core/useGameSession.ts`) avec les règles
 * de Queens, plus les croix automatiques et l'API historique (gestes « croix / gomme », coups
 * d'indice nommés).
 */
import { useCallback, useMemo } from 'react';
import type { QueensMark, QueensSolvedPuzzle } from '../../../engine/queens/types';
import { deserializeGame as deserializeAny, serializeGame as serializeAny, useGameSession, type SavedGame } from '../core/useGameSession';
import type { HintMove } from './explain';
import type { GestureEvent } from './gestures';
import { MARK_CROSS, MARK_EMPTY, MARK_QUEEN, attackedCells } from './marks';
import { QUEENS_RULES } from './rules';
import { paintMarks, type QueensGame } from './state';

export type SavedQueensGame = SavedGame;

export const serializeGame = (g: QueensGame, at: number): SavedGame => serializeAny(QUEENS_RULES, g, at);

/** Restaure une sauvegarde (en pause) ; null si elle est illisible ou ne correspond pas à cette grille. */
export const deserializeGame = (s: unknown, puzzle: QueensSolvedPuzzle): QueensGame | null => deserializeAny(QUEENS_RULES, s, puzzle);

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

export function useQueensGame({ autoCross, ...options }: UseQueensGameOptions) {
  const session = useGameSession(QUEENS_RULES, options);
  const { game, gesture: play, applyHint: apply } = session;

  const gesture = useCallback(
    (e: GestureEvent) => (e.type === 'paint' ? play({ type: 'paint', cells: e.cells, ...paintMarks(e.mode), stroke: e.stroke }) : play(e)),
    [play],
  );
  const applyHint = useCallback((moves: readonly HintMove[]) => apply(moves.map((m) => ({ cell: m.cell, mark: HINT_MARK[m.mark] }))), [apply]);
  const attacked = useMemo(() => (game && autoCross ? attackedCells(game.puzzle, game.marks) : undefined), [game, autoCross]);

  return { ...session, gesture, applyHint, attacked };
}
