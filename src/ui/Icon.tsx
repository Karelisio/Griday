import type { SVGAttributes } from 'react';
import { cx } from './internal/cx';
import { ICON_PATHS, ICON_VIEW_BOX, type IconName, type IconPaths } from './icons.generated';
import './Icon.css';

export type { IconName };

export interface IconProps extends Omit<SVGAttributes<SVGSVGElement>, 'children' | 'name' | 'viewBox'> {
  /** Nom de l'icône Material Symbols (voir scripts/build-icons.ts pour en ajouter). */
  readonly name: IconName;
  /** Variante pleine (ex. destination active) quand le jeu en propose une. */
  readonly filled?: boolean;
  /** Taille en px (défaut 24). */
  readonly size?: number;
  /** Texte alternatif. Sans lui, l'icône est décorative (masquée aux lecteurs d'écran). */
  readonly label?: string;
}

/** Icône SVG en ligne (couleur = `currentColor`), sans police ni requête réseau. */
export function Icon({ name, filled = false, size = 24, label, className, style, ...rest }: IconProps) {
  const paths: IconPaths = ICON_PATHS[name];
  const d = filled ? (paths.filled ?? paths.outline) : paths.outline;
  return (
    <svg
      {...rest}
      className={cx('md-icon', className)}
      style={{ width: size, height: size, ...style }}
      viewBox={ICON_VIEW_BOX}
      focusable="false"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <path d={d} />
    </svg>
  );
}
