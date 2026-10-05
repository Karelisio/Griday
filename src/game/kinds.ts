/** Types de puzzle jouables dans l'app (vue de jeu, session) : un par type du moteur. */
import type { PuzzleTypeId } from '../../engine/core/types';
import type { GameKindUI } from './core/kind';
import { QUEENS_KIND } from './queens/kind';

const KINDS: Partial<Record<PuzzleTypeId, GameKindUI<unknown>>> = {
  queens: QUEENS_KIND as GameKindUI<unknown>,
};

/** Type jouable correspondant au puzzle (null si l'app ne sait pas encore l'afficher). */
export function gameKind(type: PuzzleTypeId): GameKindUI<unknown> | null {
  return KINDS[type] ?? null;
}
