import type { HTMLAttributes, MouseEvent, ReactNode, Ref } from 'react';
import { cx } from './internal/cx';
import { Ripple } from './internal/Ripple';
import './List.css';

export interface ListProps extends HTMLAttributes<HTMLUListElement> {
  readonly children?: ReactNode;
  /**
   * `plain` : lignes sur le fond (défaut).
   * `segmented` : lignes en blocs arrondis séparés par un filet (angles extérieurs très arrondis,
   * angles intérieurs serrés), comme les réglages d'Android 16.
   */
  readonly variant?: 'plain' | 'segmented';
  readonly ref?: Ref<HTMLUListElement>;
}

/** Liste M3 (`<ul role="list">`) de `ListItem`. */
export function List({ children, variant = 'plain', className, ref, ...rest }: ListProps) {
  return (
    <ul {...rest} ref={ref} role="list" className={cx('md-list', variant === 'segmented' && 'md-list--segmented', className)}>
      {children}
    </ul>
  );
}

export interface ListItemProps {
  /** Texte principal. */
  readonly headline: ReactNode;
  /** Texte secondaire (une ou deux lignes). */
  readonly supporting?: ReactNode;
  /** Petit texte au-dessus du titre. */
  readonly overline?: ReactNode;
  /** Élément de début (icône 24 px, avatar…). */
  readonly leading?: ReactNode;
  /** Élément de fin (icône, texte, `Switch`…). */
  readonly trailing?: ReactNode;
  /** Rend toute la ligne cliquable (un bouton). Incompatible avec `control`. */
  readonly onClick?: (event: MouseEvent<HTMLElement>) => void;
  /**
   * La ligne entière active le contrôle de `trailing` (ex. `Switch`) : elle est rendue dans un
   * `<label>`, sans bouton imbriqué ; le nom accessible du contrôle vient du texte de la ligne.
   */
  readonly control?: boolean;
  readonly disabled?: boolean;
  /** Ligne sélectionnée (fond tonal). */
  readonly selected?: boolean;
  /** Balise du conteneur : `li` (défaut, dans une `List`) ou `div` (hors liste). */
  readonly as?: 'li' | 'div';
  readonly className?: string;
  readonly ref?: Ref<HTMLElement>;
}

/** Ligne de liste M3 : titre, texte secondaire, éléments de début et de fin, cliquable ou non. */
export function ListItem({ headline, supporting, overline, leading, trailing, onClick, control = false, disabled, selected, as = 'li', className, ref }: ListItemProps) {
  const Outer = as as 'div';
  const clickable = onClick !== undefined && !control;
  const lines = 1 + (supporting ? 1 : 0) + (overline ? 1 : 0);
  const body = (
    <>
      {clickable || control ? <Ripple disabled={disabled} /> : null}
      {leading ? <span className="md-list-item__leading">{leading}</span> : null}
      <span className="md-list-item__text">
        {overline ? <span className="md-list-item__overline md-typescale-label-small">{overline}</span> : null}
        <span className="md-list-item__headline md-typescale-body-large">{headline}</span>
        {supporting ? <span className="md-list-item__supporting md-typescale-body-medium">{supporting}</span> : null}
      </span>
      {trailing ? <span className="md-list-item__trailing">{trailing}</span> : null}
    </>
  );
  const classes = cx('md-list-item__content', `md-list-item__content--lines-${Math.min(lines, 3)}`);
  return (
    <Outer
      ref={ref as Ref<HTMLDivElement>}
      className={cx('md-list-item', clickable && 'md-list-item--clickable', control && 'md-list-item--control', selected && 'md-list-item--selected', disabled && 'md-list-item--disabled', className)}
    >
      {clickable ? (
        <button type="button" className={cx(classes, 'md-state-host')} disabled={disabled} aria-pressed={selected} onClick={onClick}>
          {body}
        </button>
      ) : control ? (
        <label className={cx(classes, 'md-state-host')} aria-disabled={disabled || undefined}>
          {body}
        </label>
      ) : (
        <div className={classes}>{body}</div>
      )}
    </Outer>
  );
}
