import type { HTMLAttributes, MouseEvent, ReactNode, Ref } from 'react';
import { cx } from './internal/cx';
import { Ripple } from './internal/Ripple';
import './Card.css';

export type CardVariant = 'filled' | 'elevated' | 'outlined';

export interface CardProps extends Omit<HTMLAttributes<HTMLElement>, 'onClick' | 'children'> {
  readonly children?: ReactNode;
  /** `filled` (défaut), `elevated` (ombre) ou `outlined` (contour). */
  readonly variant?: CardVariant;
  /** Rend la carte interactive : elle devient un bouton (couche d'état, ondulation, focus). */
  readonly onClick?: (event: MouseEvent<HTMLElement>) => void;
  /** Carte interactive désactivée. */
  readonly disabled?: boolean;
  /** Carte interactive à bascule : `aria-pressed`, contour de sélection. */
  readonly selected?: boolean;
  /** Balise d'une carte non interactive (défaut : `div`). */
  readonly as?: 'div' | 'section' | 'article' | 'li';
  readonly ref?: Ref<HTMLElement>;
}

/** Carte M3 (remplie, surélevée, contour) ; devient un bouton avec `onClick`. */
export function Card({ children, variant = 'filled', onClick, disabled, selected, as = 'div', className, ref, ...rest }: CardProps) {
  const interactive = onClick !== undefined;
  // Une seule balise typée « div » pour le compilateur : les attributs de bouton sont ajoutés si interactive.
  const Tag = (interactive ? 'button' : as) as 'div';
  return (
    <Tag
      {...rest}
      ref={ref as Ref<HTMLDivElement>}
      {...(interactive ? { type: 'button', onClick, disabled, 'aria-pressed': selected } : null)}
      className={cx(
        'md-card',
        `md-card--${variant}`,
        interactive && 'md-card--interactive md-state-host',
        selected && 'md-card--selected',
        className,
      )}
    >
      {interactive ? <Ripple disabled={disabled} /> : null}
      {children}
    </Tag>
  );
}
