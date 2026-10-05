import { motion, type HTMLMotionProps } from 'motion/react';
import type { ReactNode, Ref } from 'react';
import { useMotionTokens } from '../theme/motion';
import { Icon, type IconName } from './Icon';
import { cx } from './internal/cx';
import { Ripple } from './internal/Ripple';
import './Button.css';

export type ButtonVariant = 'filled' | 'tonal' | 'outlined' | 'text' | 'elevated';
export type ButtonSize = 'xs' | 's' | 'm' | 'l' | 'xl';
export type ButtonShape = 'round' | 'square';

/** Hauteur, icône et arrondis (px) par taille, d'après Material 3 Expressive. */
export const BUTTON_METRICS = {
  xs: { height: 32, icon: 20, square: 12, pressed: 8 },
  s: { height: 40, icon: 20, square: 12, pressed: 8 },
  m: { height: 56, icon: 24, square: 16, pressed: 12 },
  l: { height: 96, icon: 32, square: 28, pressed: 16 },
  xl: { height: 136, icon: 40, square: 28, pressed: 20 },
} as const satisfies Record<ButtonSize, { height: number; icon: number; square: number; pressed: number }>;

export interface ButtonProps extends Omit<HTMLMotionProps<'button'>, 'children' | 'ref'> {
  /** Libellé du bouton. */
  readonly children: ReactNode;
  /** Style : `filled` (défaut), `tonal`, `outlined`, `text` ou `elevated`. */
  readonly variant?: ButtonVariant;
  /** Taille : `xs` 32, `s` 40 (défaut), `m` 56, `l` 96, `xl` 136 px de haut. */
  readonly size?: ButtonSize;
  /** Forme au repos : `round` (pilule, défaut) ou `square` (angles arrondis). Au toucher, les angles se resserrent. */
  readonly shape?: ButtonShape;
  /** Icône avant le libellé. */
  readonly icon?: IconName;
  /** Icône après le libellé. */
  readonly trailingIcon?: IconName;
  /** Utilise la variante pleine des icônes (ex. lecture/pause, plus lisibles pleines). */
  readonly iconFilled?: boolean;
  /**
   * Bouton à bascule : `true` = sélectionné (`aria-pressed`). La forme passe de pilule à angles
   * arrondis à la sélection (et inversement pour `shape="square"`).
   */
  readonly selected?: boolean;
  /** Occupe toute la largeur disponible. */
  readonly fullWidth?: boolean;
  readonly ref?: Ref<HTMLButtonElement>;
}

/** Bouton Material 3 Expressive : cinq styles, cinq tailles, forme qui se resserre à l'appui (ressort). */
export function Button({
  children,
  variant = 'filled',
  size = 's',
  shape = 'round',
  icon,
  trailingIcon,
  iconFilled = false,
  selected,
  fullWidth = false,
  disabled,
  className,
  type = 'button',
  ref,
  ...rest
}: ButtonProps) {
  const { spatial } = useMotionTokens();
  const m = BUTTON_METRICS[size];
  const toggle = selected !== undefined;
  const round = (shape === 'round') !== (toggle && selected === true);
  const idleRadius = round ? m.height / 2 : m.square;
  const pressed = round ? m.pressed : Math.max(4, m.pressed - 2);

  return (
    <motion.button
      {...rest}
      ref={ref}
      type={type}
      disabled={disabled}
      aria-pressed={toggle ? selected : undefined}
      className={cx(
        'md-button',
        'md-state-host',
        'md-touch-target',
        `md-button--${variant}`,
        `md-button--${size}`,
        toggle && selected && 'md-button--selected',
        icon && 'md-button--has-icon',
        trailingIcon && 'md-button--has-trailing-icon',
        fullWidth && 'md-button--full-width',
        className,
      )}
      initial={false}
      animate={{ borderRadius: idleRadius }}
      whileTap={disabled ? undefined : { borderRadius: pressed }}
      transition={spatial.fast}
    >
      <Ripple disabled={disabled} />
      {icon ? <Icon name={icon} filled={iconFilled} size={m.icon} className="md-button__icon" /> : null}
      <span className={cx('md-button__label', LABEL_CLASS[size])}>{children}</span>
      {trailingIcon ? <Icon name={trailingIcon} filled={iconFilled} size={m.icon} className="md-button__icon" /> : null}
    </motion.button>
  );
}

const LABEL_CLASS: Record<ButtonSize, string> = {
  xs: 'md-typescale-label-large',
  s: 'md-typescale-label-large',
  m: 'md-typescale-title-medium',
  l: 'md-typescale-headline-small',
  xl: 'md-typescale-headline-large',
};
