/** Binairo pour la vue de jeu commune : règles, plateau (soleils et lunes), indices. */
import type { BinairoSolvedPuzzle } from '../../../engine/binairo/types';
import { engine } from '../../engine-client/client';
import { useTheme } from '../../theme';
import type { BoardProps, GameKindUI } from '../core/kind';
import { BinairoBoard } from './BinairoBoard';
import { explainHint, highlightFocus, hintApplyIcon, hintKey, hintMoves } from './explain';
import { BINAIRO_RULES } from './rules';
import { isBinairoSolvedPuzzle } from './validate';

/** Le plateau lit le thème (clair ou sombre) pour choisir la palette des symboles. */
function BinairoBoardView(props: BoardProps<BinairoSolvedPuzzle>) {
  const { dark } = useTheme();
  return <BinairoBoard {...props} dark={dark} />;
}

export const BINAIRO_KIND: GameKindUI<BinairoSolvedPuzzle> = {
  id: 'binairo',
  icon: 'contrast',
  rules: BINAIRO_RULES,
  isPuzzle: isBinairoSolvedPuzzle,
  size: (p) => p.size,
  Board: BinairoBoardView,
  async hint(puzzle, marks, t) {
    const h = await engine.binairoHint(puzzle, marks);
    const ex = explainHint(h, puzzle, (key, params) => t(key, params));
    return {
      kind: h.kind,
      key: hintKey(h),
      moves: hintMoves(h),
      titleKey: ex.titleKey,
      textKey: ex.textKey,
      params: ex.params,
      highlight: ex.highlight,
      focus: highlightFocus(ex.highlight),
      applyIcon: hintApplyIcon(h),
    };
  },
};
