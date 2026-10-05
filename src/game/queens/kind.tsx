/** Queens pour la vue de jeu commune : règles, plateau (couleurs, motifs, croix automatiques), indices. */
import { useCallback, useMemo } from 'react';
import { QUEENS_MAX_SIZE, type QueensMark, type QueensSolvedPuzzle } from '../../../engine/queens/types';
import { engine } from '../../engine-client/client';
import { useSettings } from '../../settings/SettingsContext';
import { useTheme } from '../../theme';
import type { BoardProps, GameKindUI } from '../core/kind';
import { explainHint, hintKey, hintMoves, type HintHighlight, type HintMove } from './explain';
import type { GestureEvent } from './gestures';
import { MARK_CROSS, MARK_EMPTY, MARK_QUEEN, attackedCells } from './marks';
import { QueensBoard } from './QueensBoard';
import { assignRegionColors } from './regionColors';
import { QUEENS_RULES } from './rules';
import { isQueensSolvedPuzzle } from './validate';
import { paintMarks } from './state';

/** Palette de départ des régions (taille maximale d'une grille) : plus de choix, voisines plus distinctes. */
const PALETTE_SIZE = QUEENS_MAX_SIZE;
const HINT_MARK: Record<HintMove['mark'], QueensMark> = { queen: MARK_QUEEN, cross: MARK_CROSS, empty: MARK_EMPTY };

function QueensBoardView({ puzzle, marks, conflicts, highlight, disabled, celebrate, onGesture }: BoardProps<QueensSolvedPuzzle>) {
  const { regionColors } = useTheme();
  const { settings } = useSettings();
  // Couleurs et textures réparties selon le voisinage : deux régions voisines restent bien distinctes.
  const colors = useMemo(() => assignRegionColors(puzzle, regionColors(PALETTE_SIZE)), [regionColors, puzzle]);
  const attacked = useMemo(() => (settings.autoCross ? attackedCells(puzzle, marks) : undefined), [settings.autoCross, puzzle, marks]);
  const gesture = useCallback(
    (e: GestureEvent) => onGesture(e.type === 'paint' ? { type: 'paint', cells: e.cells, ...paintMarks(e.mode), stroke: e.stroke } : e),
    [onGesture],
  );
  return (
    <QueensBoard
      puzzle={puzzle}
      marks={marks}
      regionColors={colors}
      conflicts={conflicts}
      attacked={attacked}
      highlight={highlight as HintHighlight | null}
      patterns={settings.regionPatterns}
      disabled={disabled}
      celebrate={celebrate}
      onGesture={gesture}
    />
  );
}

export const QUEENS_KIND: GameKindUI<QueensSolvedPuzzle> = {
  id: 'queens',
  icon: 'crown',
  rules: QUEENS_RULES,
  isPuzzle: isQueensSolvedPuzzle,
  size: (p) => p.size,
  Board: QueensBoardView,
  async hint(puzzle, marks, t, lang) {
    const h = await engine.queensHint(puzzle, marks);
    const ex = explainHint(h, puzzle, lang, (key, n) => t(key, { n }));
    const hl = ex.highlight;
    return {
      kind: h.kind,
      key: hintKey(h),
      moves: hintMoves(h, marks).map((m) => ({ cell: m.cell, mark: HINT_MARK[m.mark] })),
      titleKey: ex.titleKey,
      textKey: ex.textKey,
      params: ex.params,
      highlight: hl,
      focus: [...hl.focus, ...hl.targets, ...hl.eliminate, ...hl.mistakes, ...(hl.reveal === null ? [] : [hl.reveal])],
      applyIcon: h.kind === 'mistake' ? 'backspace' : hl.revealMark === 'cross' ? 'close' : 'crown',
    };
  },
};
