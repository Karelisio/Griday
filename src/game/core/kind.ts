/**
 * Un type de puzzle côté interface : ses règles, son plateau et ses indices. La vue de jeu et la
 * session sont communes ; chaque type (Queens, Binairo…) fournit ce contrat.
 */
import type { TFunction } from 'i18next';
import type { ComponentType } from 'react';
import type { PuzzleTypeId } from '../../../engine/core/types';
import type { Language } from '../../i18n';
import type { IconName } from '../../ui';
import type { GameRules, Mark } from './rules';

/** Fenêtre du double toucher (ms) : un conflit créé par un toucher est signalé après. */
export const DOUBLE_TAP_MS = 320;

/** Geste du joueur sur le plateau, déjà traduit en intention. */
export type GameGesture =
  | { readonly type: 'tap'; readonly cell: number }
  | { readonly type: 'doubleTap'; readonly cell: number }
  /** Glisser : les cases traversées qui portent `from` prennent `to` (un trait = une entrée d'historique). */
  | { readonly type: 'paint'; readonly cells: readonly number[]; readonly from: Mark; readonly to: Mark; readonly stroke: number };

/** Propriétés communes des plateaux (chaque plateau lit lui-même ses réglages propres). */
export interface BoardProps<P> {
  readonly puzzle: P;
  readonly marks: readonly Mark[];
  readonly conflicts: readonly number[];
  /** Surbrillance d'un indice affiché (donnée propre au type), ou null. */
  readonly highlight: unknown;
  readonly disabled: boolean;
  /** Victoire : animation de célébration. */
  readonly celebrate: boolean;
  readonly onGesture: (e: GameGesture) => void;
}

/** Indice prêt à afficher : explication localisée, surbrillance, coups jouables. */
export interface HintInfo {
  readonly kind: 'step' | 'reveal' | 'mistake' | 'solved';
  /** Identité de la déduction (un même indice redemandé n'est compté qu'une fois). */
  readonly key: string;
  /** « Jouer ce coup » / « Corriger » : toute la déduction, une seule entrée d'historique. */
  readonly moves: readonly { readonly cell: number; readonly mark: Mark }[];
  readonly titleKey: string;
  readonly textKey: string;
  readonly params: Readonly<Record<string, string | number>>;
  /** Passée telle quelle au plateau. */
  readonly highlight: unknown;
  /** Cases à garder visibles au-dessus de la feuille d'indice (vide : tout le plateau). */
  readonly focus: readonly number[];
  readonly applyIcon: IconName;
}

export interface GameKindUI<P> {
  /** Type (textes `puzzle.<id>.name|rules|howTo|conflicts`). */
  readonly id: PuzzleTypeId;
  /** Icône du type (puces, règles). */
  readonly icon: IconName;
  readonly rules: GameRules<P>;
  /** Grille relue du stockage complète et cohérente (structure, solution valide). */
  isPuzzle(v: unknown): v is P;
  /** Côté (n) de la grille. */
  size(p: P): number;
  readonly Board: ComponentType<BoardProps<P>>;
  /** Calcule (dans le worker) et explique l'indice pour l'état du joueur. */
  hint(puzzle: P, marks: readonly Mark[], t: TFunction, lang: Language): Promise<HintInfo>;
}
