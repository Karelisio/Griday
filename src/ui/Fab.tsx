import { AnimatePresence, motion, type HTMLMotionProps } from 'motion/react';
import type { ReactNode, Ref } from 'react';
import { useMotionTokens } from '../theme/motion';
import { Icon, type IconName } from './Icon';
import { cx } from './internal/cx';
import { Ripple } from './internal/Ripple';
import './Fab.css';

export type FabSize = 'sm' | 'md' | 'lg';
export type FabColor = 'primary' | 'secondary' | 'tertiary' | 'surface';

/** Hauteur, icône et arrondis (px) par taille. */
export const FAB_METRICS = {
  sm: { height: 40, icon: 24, radius: 12, pressed: 8 },
  md: { height: 56, icon: 24, radius: 16, pressed: 10 },
  lg: { height: 96, icon: 36, radius: 28, pressed: 18 },
} as const satisfies Record<FabSize, { height: number; icon: number; radius: number; pressed: number }>;

interface FabCommonProps extends Omit<HTMLMotionProps<'button'>, 'children' | 'ref'> {
  /** Taille : `sm` 40, `md` 56 (défaut), `lg` 96 px. */
  readonly size?: FabSize;
  /** Couleur du conteneur : `primary` (défaut), `secondary`, `tertiary` ou `surface`. */
  readonly color?: FabColor;
  /** Affiche ou masque le bouton avec une animation de ressort (défaut : visible). */
  readonly visible?: boolean;
  /** Utilise la variante pleine de l'icône. */
  readonly iconFilled?: boolean;
  readonly ref?: Ref<HTMLButtonElement>;
}

export interface FabProps extends FabCommonProps {
  readonly icon: IconName;
  /** Nom accessible (obligatoire : pas de texte visible). */
  readonly label: string;
}

export interface ExtendedFabProps extends FabCommonProps {
  /** Libellé visible (aussi le nom accessible). */
  readonly children: ReactNode;
  readonly icon?: IconName;
  /** Réduit le bouton à son icône (le libellé reste lu par les lecteurs d'écran). */
  readonly collapsed?: boolean;
}

interface FabShellProps extends FabCommonProps {
  readonly extended: boolean;
  readonly inner: ReactNode;
  readonly ariaLabel?: string;
}

function FabShell({ size = 'md', color = 'primary', visible = true, extended, inner, ariaLabel, disabled, className, type = 'button', ref, ...rest }: FabShellProps) {
  const { spatial, effects } = useMotionTokens();
  const m = FAB_METRICS[size];
  return (
    <AnimatePresence>
      {visible ? (
        <motion.button
          {...rest}
          ref={ref}
          type={type}
          disabled={disabled}
          aria-label={ariaLabel}
          className={cx('md-fab', 'md-state-host', `md-fab--${color}`, `md-fab--${size}`, extended && 'md-fab--extended', className)}
          initial={{ scale: 0.5, opacity: 0, borderRadius: m.radius }}
          animate={{ scale: 1, opacity: 1, borderRadius: m.radius }}
          exit={{ scale: 0.5, opacity: 0 }}
          whileTap={disabled ? undefined : { borderRadius: m.pressed, transition: spatial.fast }}
          transition={{ default: spatial.default, opacity: effects.default }}
        >
          <Ripple disabled={disabled} />
          {inner}
        </motion.button>
      ) : null}
    </AnimatePresence>
  );
}

/** Bouton d'action flottant (icône seule) M3 Expressive. */
export function Fab({ icon, label, iconFilled, ...rest }: FabProps) {
  const m = FAB_METRICS[rest.size ?? 'md'];
  return <FabShell {...rest} extended={false} ariaLabel={label} inner={<Icon name={icon} filled={iconFilled} size={m.icon} />} />;
}

/** Bouton d'action flottant étendu : icône + libellé, repliable en icône seule. */
export function ExtendedFab({ icon, iconFilled, children, collapsed = false, ...rest }: ExtendedFabProps) {
  const { spatial, effects } = useMotionTokens();
  const size = rest.size ?? 'md';
  const m = FAB_METRICS[size];
  return (
    <FabShell
      {...rest}
      extended
      inner={
        <>
          {icon ? <Icon name={icon} filled={iconFilled} size={m.icon} /> : null}
          <motion.span
            className={cx('md-fab__label', size === 'lg' ? 'md-typescale-headline-small' : size === 'sm' ? 'md-typescale-label-large' : 'md-typescale-title-medium')}
            initial={false}
            animate={{ width: collapsed ? 0 : 'auto', opacity: collapsed ? 0 : 1, marginInlineStart: collapsed || !icon ? 0 : 8 }}
            transition={{ default: spatial.default, opacity: effects.default }}
          >
            {children}
          </motion.span>
        </>
      }
    />
  );
}
