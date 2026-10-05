import { LayoutGroup, motion } from 'motion/react';
import { useEffect, useId, useRef } from 'react';
import { useMotionTokens } from '../theme/motion';
import { Icon, type IconName } from './Icon';
import { cx } from './internal/cx';
import { Ripple } from './internal/Ripple';
import './NavigationBar.css';

export interface NavigationDestination {
  /** Identifiant unique, renvoyé par `onChange`. */
  readonly id: string;
  /** Libellé visible sous l'icône. */
  readonly label: string;
  /** Icône (contour au repos, variante pleine quand la destination est active). */
  readonly icon: IconName;
  /** Nom accessible si différent du libellé. */
  readonly ariaLabel?: string;
}

export interface NavigationBarProps {
  /** 3 à 5 destinations. */
  readonly destinations: readonly NavigationDestination[];
  /** Identifiant de la destination active. */
  readonly value: string;
  readonly onChange: (id: string) => void;
  /** Nom de la zone de navigation (ex. « Navigation principale »). */
  readonly 'aria-label': string;
  readonly className?: string;
}

const HEIGHT_VAR = '--md-navigation-bar-height';

/**
 * Barre de navigation inférieure M3 Expressive : pastille d'état actif qui glisse (ressort),
 * icône pleine à l'état actif, marge de zone sûre en bas. Publie sa hauteur dans `--md-navigation-bar-height`
 * (les snackbars se placent au-dessus).
 */
export function NavigationBar({ destinations, value, onChange, 'aria-label': ariaLabel, className }: NavigationBarProps) {
  const { spatial, effects } = useMotionTokens();
  const groupId = useId();
  const barRef = useRef<HTMLElement>(null);

  // Publie la hauteur réelle (zone sûre comprise) pour les éléments posés au-dessus (snackbar).
  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const publish = (): void => document.documentElement.style.setProperty(HEIGHT_VAR, `${bar.offsetHeight}px`);
    publish();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(publish) : null;
    observer?.observe(bar);
    return () => {
      observer?.disconnect();
      document.documentElement.style.removeProperty(HEIGHT_VAR);
    };
  }, []);

  return (
    <LayoutGroup id={groupId}>
      <nav ref={barRef} aria-label={ariaLabel} className={cx('md-nav-bar', className)}>
        <ul className="md-nav-bar__list">
          {destinations.map((destination) => {
            const active = destination.id === value;
            return (
              <li key={destination.id} className="md-nav-bar__item">
                <button
                  type="button"
                  data-ripple-host=""
                  aria-current={active ? 'page' : undefined}
                  aria-label={destination.ariaLabel}
                  className={cx('md-nav-bar__button', active && 'md-nav-bar__button--active')}
                  onClick={() => onChange(destination.id)}
                >
                  <span className="md-nav-bar__pill">
                    {active ? (
                      <motion.span layoutId="md-nav-indicator" className="md-nav-bar__indicator" transition={spatial.default} />
                    ) : null}
                    <Ripple />
                    <span className="md-nav-bar__icons">
                      <motion.span
                        className="md-nav-bar__icon"
                        initial={false}
                        animate={{ opacity: active ? 0 : 1, scale: active ? 0.6 : 1 }}
                        transition={{ default: spatial.fast, opacity: effects.fast }}
                      >
                        <Icon name={destination.icon} />
                      </motion.span>
                      <motion.span
                        className="md-nav-bar__icon"
                        initial={false}
                        animate={{ opacity: active ? 1 : 0, scale: active ? 1 : 0.6 }}
                        transition={{ default: spatial.fast, opacity: effects.fast }}
                      >
                        <Icon name={destination.icon} filled />
                      </motion.span>
                    </span>
                  </span>
                  <span className={cx('md-nav-bar__label', active ? 'md-typescale-label-medium-emphasized' : 'md-typescale-label-medium')}>{destination.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </LayoutGroup>
  );
}
