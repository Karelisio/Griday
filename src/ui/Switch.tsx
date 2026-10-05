import { AnimatePresence, motion } from 'motion/react';
import { useState, type ButtonHTMLAttributes, type Ref } from 'react';
import { useMotionTokens } from '../theme/motion';
import { Icon } from './Icon';
import { cx } from './internal/cx';
import { Ripple } from './internal/Ripple';
import './Switch.css';

export interface SwitchProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange' | 'role' | 'aria-checked' | 'children'> {
  /** État actuel (composant contrôlé). */
  readonly checked: boolean;
  /** Appelé avec le nouvel état à chaque bascule (toucher, Espace ou Entrée). */
  readonly onChange: (checked: boolean) => void;
  /** Icône dans le pouce : coche si activé, croix sinon (défaut : oui). */
  readonly showIcons?: boolean;
  /**
   * Nom accessible : passer `aria-label`, `aria-labelledby` ou associer un `<label htmlFor={id}>`.
   */
  readonly ref?: Ref<HTMLButtonElement>;
}

const TRACK_WIDTH = 52;
const TRACK_HEIGHT = 32;

/** Interrupteur M3 Expressive : pouce à ressort qui grossit à l'appui, icône optionnelle. */
export function Switch({ checked, onChange, showIcons = true, disabled, className, onClick, type = 'button', ref, ...rest }: SwitchProps) {
  const { spatial, effects } = useMotionTokens();
  const [pressed, setPressed] = useState(false);
  const size = pressed ? 28 : checked || showIcons ? 24 : 16;
  const center = checked ? TRACK_WIDTH - 16 : 16;

  return (
    <button
      {...rest}
      ref={ref}
      type={type}
      role="switch"
      data-ripple-host=""
      aria-checked={checked}
      disabled={disabled}
      className={cx('md-switch', 'md-touch-target', checked && 'md-switch--checked', pressed && 'md-switch--pressed', className)}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) onChange(!checked);
      }}
      onPointerDown={(event) => {
        rest.onPointerDown?.(event);
        if (!disabled) setPressed(true);
      }}
      onPointerUp={(event) => {
        rest.onPointerUp?.(event);
        setPressed(false);
      }}
      onPointerLeave={(event) => {
        rest.onPointerLeave?.(event);
        setPressed(false);
      }}
      onPointerCancel={(event) => {
        rest.onPointerCancel?.(event);
        setPressed(false);
      }}
      onBlur={(event) => {
        rest.onBlur?.(event);
        setPressed(false);
      }}
      style={{ width: TRACK_WIDTH, height: TRACK_HEIGHT, ...rest.style }}
    >
      <motion.span
        className="md-switch__thumb md-state-host"
        initial={false}
        animate={{ x: center - size / 2, y: -size / 2, width: size, height: size }}
        transition={{ default: spatial.fast, width: spatial.fast, height: spatial.fast }}
        aria-hidden="true"
      >
        <span className="md-switch__halo">
          <Ripple disabled={disabled} />
        </span>
        <AnimatePresence initial={false}>
          {showIcons ? (
            <motion.span
              key={checked ? 'on' : 'off'}
              className="md-switch__icon"
              initial={{ opacity: 0, scale: 0.5, rotate: checked ? -45 : 45 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              exit={{ opacity: 0, scale: 0.5 }}
              transition={{ default: spatial.fast, opacity: effects.fast }}
            >
              <Icon name={checked ? 'check' : 'close'} size={16} />
            </motion.span>
          ) : null}
        </AnimatePresence>
      </motion.span>
    </button>
  );
}
