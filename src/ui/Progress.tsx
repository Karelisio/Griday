import { useEffect, useRef } from 'react';
import { usePrefersReducedMotion } from '../theme/motion';
import { cx } from './internal/cx';
import './Progress.css';

export type ProgressVariant = 'wavy' | 'flat';

interface ProgressBaseProps {
  /** Avancement de 0 à 1. Absent = indéterminé (attente de durée inconnue). */
  readonly value?: number;
  /** `wavy` : indicateur ondulé M3 Expressive (défaut) ; `flat` : indicateur droit classique. */
  readonly variant?: ProgressVariant;
  /** Nom accessible (ex. « Chargement ») : fournir `aria-label` ou `aria-labelledby`. */
  readonly 'aria-label'?: string;
  readonly 'aria-labelledby'?: string;
  readonly className?: string;
}

export type LinearProgressProps = ProgressBaseProps;

export interface CircularProgressProps extends ProgressBaseProps {
  /** Diamètre en px (défaut 48). */
  readonly size?: number;
}

const TAU = Math.PI * 2;
const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const smoothstep = (a: number, b: number, x: number): number => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
/** Accélération/décélération douce (cubique) de 0 à 1. */
const easeInOut = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** Boucle d'animation : appelle `frame(tempsMs)` à chaque image tant que `active` ; une image fixe sinon. */
function useFrameLoop(frame: (timeMs: number) => void, active: boolean): void {
  const frameRef = useRef(frame);
  frameRef.current = frame;
  useEffect(() => {
    frameRef.current(0);
    if (!active) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number): void => {
      frameRef.current(now - start);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active]);
}

/** Tracé d'une onde sinusoïdale de x0 à x1 (px). */
function wavePath(x0: number, x1: number, cy: number, amplitude: number, wavelength: number, phase: number): string {
  if (x1 <= x0) return '';
  const step = 2.5;
  let d = '';
  for (let x = x0; ; x += step) {
    const px = Math.min(x, x1);
    const y = cy + amplitude * Math.sin((TAU * (px - phase)) / wavelength);
    d += `${d ? 'L' : 'M'}${px.toFixed(1)} ${y.toFixed(2)}`;
    if (px >= x1) break;
  }
  return d;
}

// --- Linéaire --------------------------------------------------------------------------------

const LINEAR_STROKE = 4;
const LINEAR_AMPLITUDE = 3;
const LINEAR_WAVELENGTH = 40;
const LINEAR_GAP = 4;
const LINEAR_HEIGHT = LINEAR_STROKE + 2 * LINEAR_AMPLITUDE + 2;

/** Barre de progression linéaire M3 Expressive (ondulée ou droite, déterminée ou non). */
export function LinearProgress({ value, variant = 'wavy', className, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledBy }: LinearProgressProps) {
  const reduced = usePrefersReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<SVGPathElement>(null);
  const trackRef = useRef<SVGPathElement>(null);
  const stopRef = useRef<SVGCircleElement>(null);
  const indeterminate = value === undefined;
  const wavy = variant === 'wavy';
  const progress = indeterminate ? 0 : clamp01(value);

  const frame = (timeMs: number): void => {
    const root = rootRef.current;
    const active = activeRef.current;
    const track = trackRef.current;
    const stop = stopRef.current;
    if (!root || !active || !track || !stop) return;
    const width = root.clientWidth || 300;
    const r = LINEAR_STROKE / 2;
    const cy = LINEAR_HEIGHT / 2;
    const left = r;
    const right = width - r;
    const gap = LINEAR_GAP + LINEAR_STROKE;
    const phase = reduced ? 0 : (timeMs / 1000) * LINEAR_WAVELENGTH;

    let from: number;
    let to: number;
    let amplitudeFactor: number;
    if (indeterminate) {
      // Un segment parcourt la barre en boucle (2,2 s), la tête allant plus vite que la queue.
      const t = reduced ? 0.5 : (timeMs % 2200) / 2200;
      const head = left + (right - left + 0.45 * width) * easeInOut(clamp01(t * 1.15)) - 0.45 * width * 0.1;
      const tail = head - (0.15 + 0.3 * Math.sin(Math.PI * t)) * width;
      from = Math.max(left, tail);
      to = Math.min(right, head);
      amplitudeFactor = 1;
    } else {
      from = left;
      to = left + progress * (right - left);
      amplitudeFactor = smoothstep(0, 0.1, progress) * (1 - smoothstep(0.92, 1, progress));
    }
    const amplitude = wavy ? LINEAR_AMPLITUDE * amplitudeFactor : 0;
    active.setAttribute('d', wavePath(from, Math.max(from, to), cy, amplitude, LINEAR_WAVELENGTH, phase));
    active.style.visibility = to > from || !indeterminate ? 'visible' : 'hidden';

    // Piste : à droite de l'indicateur, et à gauche en mode indéterminé.
    const trackFrom = indeterminate ? left : to + gap;
    let trackD = '';
    if (indeterminate && from - gap > left) trackD += `M${left} ${cy}H${(from - gap).toFixed(1)}`;
    const rightStart = indeterminate ? to + gap : trackFrom;
    if (rightStart < right) trackD += `M${rightStart.toFixed(1)} ${cy}H${right}`;
    track.setAttribute('d', trackD);
    // Repère de fin de piste (point), tant que la piste est visible.
    stop.setAttribute('cx', String(right));
    stop.setAttribute('cy', String(cy));
    stop.style.visibility = rightStart < right ? 'visible' : 'hidden';
  };
  useFrameLoop(frame, indeterminate && !reduced);
  // Redessine aussi quand la valeur ou la largeur changent (image fixe).
  useEffect(() => {
    frame(0);
    const root = rootRef.current;
    const observer = root && typeof ResizeObserver === 'function' ? new ResizeObserver(() => frame(0)) : null;
    if (root) observer?.observe(root);
    return () => observer?.disconnect();
  }, [progress, indeterminate, variant, reduced]);

  return (
    <div
      ref={rootRef}
      role="progressbar"
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={indeterminate ? undefined : Math.round(progress * 100)}
      className={cx('md-linear-progress', indeterminate && reduced && 'md-progress--pulse', className)}
      style={{ height: LINEAR_HEIGHT }}
    >
      <svg width="100%" height={LINEAR_HEIGHT} aria-hidden="true" focusable="false">
        <path ref={trackRef} className="md-linear-progress__track" strokeWidth={LINEAR_STROKE} strokeLinecap="round" fill="none" />
        <path ref={activeRef} className="md-linear-progress__active" strokeWidth={LINEAR_STROKE} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <circle ref={stopRef} className="md-linear-progress__stop" r={LINEAR_STROKE / 2} />
      </svg>
    </div>
  );
}

// --- Circulaire ------------------------------------------------------------------------------

const CIRCULAR_STROKE = 4;
const CIRCULAR_WAVES = 8;
const CIRCULAR_AMPLITUDE = 1.6;

/** Arc (ondulé ou non) de l'angle a0 à a1 (radians, 0 = haut, sens horaire) autour du centre (c, c). */
function arcPath(c: number, radius: number, a0: number, a1: number, amplitude: number, phase: number): string {
  if (a1 <= a0) return '';
  const steps = Math.max(2, Math.ceil(((a1 - a0) / TAU) * 120));
  let d = '';
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps;
    const rr = radius + amplitude * Math.sin(CIRCULAR_WAVES * a + phase);
    d += `${i ? 'L' : 'M'}${(c + rr * Math.sin(a)).toFixed(2)} ${(c - rr * Math.cos(a)).toFixed(2)}`;
  }
  return d;
}

/** Indicateur de progression circulaire M3 Expressive (ondulé ou droit, déterminé ou non). */
export function CircularProgress({ value, variant = 'wavy', size = 48, className, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledBy }: CircularProgressProps) {
  const reduced = usePrefersReducedMotion();
  const activeRef = useRef<SVGPathElement>(null);
  const trackRef = useRef<SVGPathElement>(null);
  const indeterminate = value === undefined;
  const wavy = variant === 'wavy';
  const progress = indeterminate ? 0 : clamp01(value);
  const view = 48;
  const c = view / 2;
  const radius = c - CIRCULAR_STROKE / 2 - (wavy ? CIRCULAR_AMPLITUDE : 0) - 0.5;
  const gap = (CIRCULAR_STROKE + 4) / radius; // trou entre indicateur et piste (radians)

  const frame = (timeMs: number): void => {
    const active = activeRef.current;
    const track = trackRef.current;
    if (!active || !track) return;
    let a0: number;
    let a1: number;
    if (indeterminate) {
      // L'arc tourne et s'allonge/se raccourcit en boucle (1,6 s).
      const t = reduced ? 0.4 : (timeMs % 1600) / 1600;
      const sweep = (0.12 + 0.62 * (0.5 - 0.5 * Math.cos(TAU * t))) * TAU;
      a0 = reduced ? 0 : (timeMs / 1333) * TAU;
      a1 = a0 + sweep;
    } else {
      a0 = 0;
      a1 = Math.max(0, progress * TAU - (progress < 1 ? gap : 0));
      if (progress >= 1) a1 = TAU;
    }
    const amplitude = wavy ? CIRCULAR_AMPLITUDE * (indeterminate ? 1 : smoothstep(0, 0.1, progress)) : 0;
    const phase = reduced ? 0 : (timeMs / 1000) * 3;
    active.setAttribute('d', arcPath(c, radius, a0, Math.max(a0, a1), amplitude, phase));
    // Piste : le reste du cercle, entre la fin de l'indicateur et son début (avec trous).
    const t0 = a1 + gap;
    const t1 = a0 + TAU - gap;
    track.setAttribute('d', t1 > t0 && progress < 1 ? arcPath(c, radius, t0, t1, 0, 0) : '');
  };
  useFrameLoop(frame, indeterminate && !reduced);
  useEffect(() => {
    frame(0);
  }, [progress, indeterminate, variant, reduced]);

  return (
    <div
      role="progressbar"
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={indeterminate ? undefined : Math.round(progress * 100)}
      className={cx('md-circular-progress', indeterminate && reduced && 'md-progress--pulse', className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${view} ${view}`} aria-hidden="true" focusable="false">
        <path ref={trackRef} className="md-circular-progress__track" strokeWidth={CIRCULAR_STROKE} strokeLinecap="round" fill="none" />
        <path ref={activeRef} className="md-circular-progress__active" strokeWidth={CIRCULAR_STROKE} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
    </div>
  );
}
