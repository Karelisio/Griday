import { motion, type HTMLMotionProps } from 'motion/react';
import type { Ref } from 'react';
import { useMotionTokens } from '../theme/motion';
import { BUTTON_METRICS, type ButtonShape, type ButtonSize } from './Button';
import { Icon, type IconName } from './Icon';
import { cx } from './internal/cx';
import { Ripple } from './internal/Ripple';
import './IconButton.css';

export type IconButtonVariant = 'standard' | 'filled' | 'tonal' | 'outlined';

export interface IconButtonProps extends Omit<HTMLMotionProps<'button'>, 'children' | 'ref' | 'aria-label'> {
  /** Icône affichée. */
  readonly icon: IconName;
  /** Nom accessible du bouton (obligatoire : il n'y a pas de texte visible). */
  readonly label: string;
  /** Style : `standard` (défaut), `filled`, `tonal` ou `outlined`. */
  readonly variant?: IconButtonVariant;
  /** Taille : `xs` 32, `s` 40 (défaut), `m` 56, `l` 96, `xl` 136 px. */
  readonly size?: ButtonSize;
  /** Forme au repos : `round` (cercle, défaut) ou `square`. Les angles se resserrent à l'appui. */
  readonly shape?: ButtonShape;
  /** Bouton à bascule : `true` = sélectionné (`aria-pressed`, icône pleine). Absent = bouton simple. */
  readonly selected?: boolean;
  /** Icône à afficher quand le bouton est sélectionné (défaut : variante pleine de `icon`). */
  readonly selectedIcon?: IconName;
  /** Toujours afficher la variante pleine de l'icône (ex. lecture/pause). */
  readonly iconFilled?: boolean;
  readonly ref?: Ref<HTMLButtonElement>;
}

/** Bouton-icône M3 Expressive (standard, plein, tonal, contour) avec bascule optionnelle. */
export function IconButton({
  icon,
  label,
  variant = 'standard',
  size = 's',
  shape = 'round',
  selected,
  selectedIcon,
  iconFilled = false,
  disabled,
  className,
  type = 'button',
  ref,
  ...rest
}: IconButtonProps) {
  const { spatial } = useMotionTokens();
  const m = BUTTON_METRICS[size];
  const toggle = selected !== undefined;
  const round = (shape === 'round') !== (toggle && selected === true && variant !== 'standard');
  const idleRadius = round ? m.height / 2 : m.square;
  const pressedRadius = round ? m.pressed : Math.max(4, m.pressed - 2);
  const active = toggle && selected === true;

  return (
    <motion.button
      {...rest}
      ref={ref}
      type={type}
      disabled={disabled}
      aria-label={label}
      aria-pressed={toggle ? selected : undefined}
      className={cx(
        'md-icon-button',
        'md-state-host',
        'md-touch-target',
        `md-icon-button--${variant}`,
        `md-icon-button--${size}`,
        toggle && 'md-icon-button--toggle',
        active && 'md-icon-button--selected',
        className,
      )}
      initial={false}
      animate={{ borderRadius: idleRadius }}
      whileTap={disabled ? undefined : { borderRadius: pressedRadius }}
      transition={spatial.fast}
    >
      <Ripple disabled={disabled} />
      <Icon name={active && selectedIcon ? selectedIcon : icon} filled={iconFilled || (active && !selectedIcon)} size={m.icon} />
    </motion.button>
  );
}
