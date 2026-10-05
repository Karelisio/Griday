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

/** Courbe de Bézier cubique CSS `cubic-bezier(x1, y1, x2, y2)`, évaluée en x ∈ [0, 1] (dichotomie). */
function bezier(x1: number, y1: number, x2: number, y2: number): (x: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let lo = 0;
    let hi = 1;
    let t = x;
    for (let i = 0; i < 24; i++) {
      const value = ((ax * t + bx) * t + cx) * t;
      if (Math.abs(value - x) < 1e-5) break;
      if (value < x) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return ((ay * t + by) * t + cy) * t;
  };
}

interface Keyframe {
  readonly delay: number;
  readonly duration: number;
  readonly ease: (x: number) => number;
}

/** Position (0..1) d'une extrémité de trait à l'instant `t` (ms) de son mouvement. */
const along = (t: number, { delay, duration, ease }: Keyframe): number => ease(clamp01((t - delay) / duration));

/**
 * Indéterminé linéaire (mêmes temps que Material 3) : deux traits traversent la barre ; chacun a une
 * tête et une queue qui partent avec un décalage et des courbes différentes. Cycle de 1,8 s.
 */
const INDETERMINATE_CYCLE = 1800;
const INDETERMINATE_LINES = [
  { head: { delay: 0, duration: 750, ease: bezier(0.2, 0, 0.8, 1) }, tail: { delay: 333, duration: 850, ease: bezier(0.4, 0, 1, 1) } },
  { head: { delay: 1000, duration: 567, ease: bezier(0, 0, 0.65, 1) }, tail: { delay: 1267, duration: 533, ease: bezier(0.1, 0, 0.45, 1) } },
] as const;
/** Instant montré quand les animations sont réduites (premier trait bien étendu). */
const INDETERMINATE_STILL = 700;

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
    const gap = LINEAR_GAP + LINEAR_STROKE; // trou entre indicateur et piste, caps arrondis compris
    const phase = reduced ? 0 : (timeMs / 1000) * LINEAR_WAVELENGTH;

    // Intervalles actifs [début, fin] en px.
    const spans: [number, number][] = [];
    let amplitudeFactor = 1;
    if (indeterminate) {
      const t = reduced ? INDETERMINATE_STILL : timeMs % INDETERMINATE_CYCLE;
      for (const line of INDETERMINATE_LINES) {
        const from = left + along(t, line.tail) * (right - left);
        const to = left + along(t, line.head) * (right - left);
        if (to - from >= 1) spans.push([from, to]);
      }
    } else {
      spans.push([left, left + progress * (right - left)]);
      amplitudeFactor = smoothstep(0, 0.1, progress) * (1 - smoothstep(0.92, 1, progress));
    }
    const amplitude = wavy ? LINEAR_AMPLITUDE * amplitudeFactor : 0;
    active.setAttribute('d', spans.map(([from, to]) => wavePath(from, Math.max(from, to), cy, amplitude, LINEAR_WAVELENGTH, phase)).join(''));

    // Piste : le complément des intervalles actifs, avec un trou de chaque côté.
    let trackD = '';
    let cursor = left;
    for (const [from, to] of [...spans].sort((a, b) => a[0] - b[0])) {
      if (from - gap > cursor) trackD += `M${cursor.toFixed(1)} ${cy}H${(from - gap).toFixed(1)}`;
      cursor = Math.max(cursor, to + gap);
    }
    if (cursor < right) trackD += `M${cursor.toFixed(1)} ${cy}H${right}`;
    track.setAttribute('d', trackD);
    // Repère de fin de piste (point) : déterminé seulement, tant que la piste va jusqu'au bout.
    stop.setAttribute('cx', String(right));
    stop.setAttribute('cy', String(cy));
    stop.style.visibility = !indeterminate && cursor < right ? 'visible' : 'hidden';
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
