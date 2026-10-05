import { cx } from './internal/cx';
import './Divider.css';

export interface DividerProps {
  /** `full` (toute la largeur, défaut), `inset` (retrait de 16 px au début) ou `middle` (retrait des deux côtés). */
  readonly variant?: 'full' | 'inset' | 'middle';
  readonly orientation?: 'horizontal' | 'vertical';
  readonly className?: string;
}

/** Séparateur M3 (trait de 1 px, couleur `outline-variant`). */
export function Divider({ variant = 'full', orientation = 'horizontal', className }: DividerProps) {
  const classes = cx('md-divider', `md-divider--${variant}`, orientation === 'vertical' && 'md-divider--vertical', className);
  return orientation === 'vertical' ? (
    <div role="separator" aria-orientation="vertical" className={classes} />
  ) : (
    <hr className={classes} />
  );
}
