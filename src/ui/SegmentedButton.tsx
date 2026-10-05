import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import { useId, useRef, type KeyboardEvent } from 'react';
import { useMotionTokens } from '../theme/motion';
import { Icon, type IconName } from './Icon';
import { cx } from './internal/cx';
import { Ripple } from './internal/Ripple';
import './SegmentedButton.css';

export interface SegmentedOption<T extends string = string> {
  /** Valeur renvoyée par `onChange`. */
  readonly value: T;
  /** Libellé visible. Sans libellé, `ariaLabel` est obligatoire. */
  readonly label?: string;
  /** Icône avant le libellé (remplacée par la coche quand le segment est sélectionné). */
  readonly icon?: IconName;
  /** Nom accessible quand il n'y a pas de libellé visible. */
  readonly ariaLabel?: string;
  readonly disabled?: boolean;
}

export interface SegmentedButtonProps<T extends string = string> {
  readonly options: readonly SegmentedOption<T>[];
  /** Valeur sélectionnée (composant contrôlé). */
  readonly value: T;
  readonly onChange: (value: T) => void;
  /** Nom du groupe (ex. « Thème »). Fournir `aria-label` ou `aria-labelledby`. */
  readonly 'aria-label'?: string;
  readonly 'aria-labelledby'?: string;
  /** Coche sur le segment sélectionné, à la place de son icône quand il a un libellé (défaut : oui). */
  readonly showCheck?: boolean;
  readonly className?: string;
}

/**
 * Choix unique parmi 2 à 5 options (thème, langue…) : groupe de boutons radio au clavier
 * (flèches, Début, Fin), pastille de sélection qui glisse d'un segment à l'autre (ressort).
 */
export function SegmentedButton<T extends string = string>({
  options,
  value,
  onChange,
  showCheck = true,
  className,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
}: SegmentedButtonProps<T>) {
  const { spatial, effects } = useMotionTokens();
  const groupId = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const select = (index: number): void => {
    const option = options[index];
    if (!option || option.disabled) return;
    onChange(option.value);
    refs.current[index]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    const last = options.length - 1;
    let next = -1;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = index === last ? 0 : index + 1;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        next = index === 0 ? last : index - 1;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = last;
        break;
      default:
        return;
    }
    event.preventDefault();
    // Saute les segments désactivés.
    for (let step = 0; step < options.length && options[next]?.disabled; step++) {
      next = event.key === 'ArrowLeft' || event.key === 'ArrowUp' || event.key === 'End' ? (next === 0 ? last : next - 1) : next === last ? 0 : next + 1;
    }
    select(next);
  };

  return (
    <LayoutGroup id={groupId}>
      <div role="radiogroup" aria-label={ariaLabel} aria-labelledby={ariaLabelledBy} className={cx('md-segmented', className)}>
        {options.map((option, index) => {
          const selected = option.value === value;
          // Coche à la place de l'icône, sauf pour un segment sans libellé (l'icône est alors son seul contenu).
          const leading = selected && showCheck && option.label ? 'check' : option.icon;
          return (
            <button
              key={option.value}
              ref={(el) => {
                refs.current[index] = el;
              }}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={option.label ? undefined : option.ariaLabel}
              disabled={option.disabled}
              tabIndex={selected ? 0 : -1}
              className={cx('md-segmented__segment', 'md-state-host', selected && 'md-segmented__segment--selected')}
              onClick={() => select(index)}
              onKeyDown={(event) => onKeyDown(event, index)}
            >
              {selected ? (
                <motion.span layoutId="md-segmented-selection" className="md-segmented__selection" transition={spatial.default} />
              ) : null}
              <Ripple disabled={option.disabled} />
              <AnimatePresence initial={false}>
                {leading ? (
                  <motion.span
                    key={leading}
                    className="md-segmented__icon"
                    initial={{ width: 0, opacity: 0 }}
                    animate={{ width: 18, opacity: 1 }}
                    exit={{ width: 0, opacity: 0 }}
                    transition={{ default: spatial.fast, opacity: effects.fast }}
                  >
                    <Icon name={leading} size={18} />
                  </motion.span>
                ) : null}
              </AnimatePresence>
              {option.label ? <span className="md-segmented__label md-typescale-label-large">{option.label}</span> : null}
            </button>
          );
        })}
      </div>
    </LayoutGroup>
  );
}
