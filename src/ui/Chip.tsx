import { AnimatePresence, motion } from 'motion/react';
import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import { useMotionTokens } from '../theme/motion';
import { Icon, type IconName } from './Icon';
import { cx } from './internal/cx';
import { Ripple } from './internal/Ripple';
import './Chip.css';

export type ChipVariant = 'assist' | 'filter';

export interface ChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** Libellé de la puce. */
  readonly children: ReactNode;
  /** `assist` : action rapide (défaut) ; `filter` : bascule avec coche quand elle est sélectionnée. */
  readonly variant?: ChipVariant;
  /** Icône avant le libellé (remplacée par la coche d'un filtre sélectionné). */
  readonly icon?: IconName;
  /** Filtre sélectionné (`aria-pressed`). */
  readonly selected?: boolean;
  /** Fond surélevé au lieu du contour. */
  readonly elevated?: boolean;
  readonly ref?: Ref<HTMLButtonElement>;
}

/** Puce M3 : assistance ou filtre (avec coche animée à la sélection). */
export function Chip({ children, variant = 'assist', icon, selected = false, elevated = false, disabled, className, type = 'button', ref, ...rest }: ChipProps) {
  const { spatial, effects } = useMotionTokens();
  const filter = variant === 'filter';
  const checked = filter && selected;
  const leading = checked ? 'check' : icon;
  return (
    <button
      {...rest}
      ref={ref}
      type={type}
      disabled={disabled}
      aria-pressed={filter ? selected : undefined}
      className={cx('md-chip', 'md-state-host', 'md-touch-target', `md-chip--${variant}`, elevated && 'md-chip--elevated', checked && 'md-chip--selected', className)}
    >
      <Ripple disabled={disabled} />
      <AnimatePresence initial={false}>
        {leading ? (
          <motion.span
            key={checked ? 'check' : 'icon'}
            className="md-chip__icon"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 18, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ default: spatial.fast, opacity: effects.fast }}
          >
            <Icon name={leading} size={18} />
          </motion.span>
        ) : null}
      </AnimatePresence>
      <span className="md-chip__label md-typescale-label-large">{children}</span>
    </button>
  );
}
