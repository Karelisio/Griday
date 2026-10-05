/**
 * Mouvement Material 3 Expressive : ressorts pour la bibliothèque `motion`.
 *
 * - « spatial » : déplacements et changements de forme (rebond léger, ratio 0,6 à 0,8) ;
 * - « effects » : opacité et couleur (amortissement critique, sans rebond).
 * Conversion ratio d'amortissement ζ → `damping` de motion : c = 2·ζ·√(k·m), avec m = 1.
 *
 * Avec `prefers-reduced-motion`, les ressorts spatiaux deviennent instantanés et les effets se
 * réduisent à un fondu court (voir `useMotionTokens`).
 */
import { useReducedMotion, type Transition } from 'motion/react';

export interface SpringSpec {
  readonly stiffness: number;
  readonly dampingRatio: number;
}

/** Fabrique la transition `motion` d'un ressort (masse 1). */
export function spring({ stiffness, dampingRatio }: SpringSpec): Transition {
  return { type: 'spring', stiffness, damping: 2 * dampingRatio * Math.sqrt(stiffness), mass: 1 };
}

/** Paramètres physiques des jetons Expressive. */
export const SPRING_SPECS = {
  spatial: {
    fast: { stiffness: 800, dampingRatio: 0.6 },
    default: { stiffness: 380, dampingRatio: 0.8 },
    slow: { stiffness: 200, dampingRatio: 0.8 },
  },
  effects: {
    fast: { stiffness: 3800, dampingRatio: 1 },
    default: { stiffness: 1600, dampingRatio: 1 },
    slow: { stiffness: 800, dampingRatio: 1 },
  },
} as const satisfies Record<string, Record<string, SpringSpec>>;

export type SpringSpeed = 'fast' | 'default' | 'slow';

export interface MotionTokens {
  readonly spatial: Readonly<Record<SpringSpeed, Transition>>;
  readonly effects: Readonly<Record<SpringSpeed, Transition>>;
}

const build = (group: Record<SpringSpeed, SpringSpec>): Record<SpringSpeed, Transition> => ({
  fast: spring(group.fast),
  default: spring(group.default),
  slow: spring(group.slow),
});

/** Ressorts standard (mouvement complet). */
export const springs: MotionTokens = {
  spatial: build(SPRING_SPECS.spatial),
  effects: build(SPRING_SPECS.effects),
};

/** Mouvement spatial réduit : état final immédiat. */
export const INSTANT: Transition = { duration: 0 };
/** Effets réduits : simple fondu court, sans déplacement. */
export const FADE_ONLY: Transition = { duration: 0.1, ease: 'linear' };

const reducedTokens: MotionTokens = {
  spatial: { fast: INSTANT, default: INSTANT, slow: INSTANT },
  effects: { fast: FADE_ONLY, default: FADE_ONLY, slow: FADE_ONLY },
};

/** Jetons de mouvement adaptés à la préférence « réduire les animations » de l'utilisateur. */
export function motionTokensFor(reduced: boolean): MotionTokens {
  return reduced ? reducedTokens : springs;
}

/** Préférence système « réduire les animations » (faux hors navigateur). */
export function usePrefersReducedMotion(): boolean {
  return !!useReducedMotion();
}

/** Ressorts à utiliser dans un composant : instantanés/fondus si l'utilisateur réduit les animations. */
export function useMotionTokens(): MotionTokens & { readonly reduced: boolean } {
  const reduced = usePrefersReducedMotion();
  return { ...motionTokensFor(reduced), reduced };
}

// --- Équivalent CSS ------------------------------------------------------------------------------

/**
 * Courbe CSS `linear()` d'un ressort amorti allant de 0 à 1, et sa durée de stabilisation (ms).
 * Sert aux transitions CSS (jetons `--md-sys-motion-spring-*` de tokens.css) ; les composants
 * animés par `motion` n'en ont pas besoin.
 */
export function springToCssLinear({ stiffness, dampingRatio }: SpringSpec, points = 40): { easing: string; duration: number } {
  const w0 = Math.sqrt(stiffness); // pulsation propre (masse 1)
  const z = dampingRatio;
  const position = (t: number): number => {
    if (z < 1) {
      const wd = w0 * Math.sqrt(1 - z * z);
      return 1 - Math.exp(-z * w0 * t) * (Math.cos(wd * t) + ((z * w0) / wd) * Math.sin(wd * t));
    }
    return 1 - Math.exp(-w0 * t) * (1 + w0 * t);
  };
  // Durée : dernier instant où l'écart à 1 dépasse 0,1 %.
  const step = 0.002;
  let settle = step;
  for (let t = step; t < 5; t += step) if (Math.abs(1 - position(t)) > 0.001) settle = t;
  settle += step;
  const samples = Array.from({ length: points }, (_, i) => {
    const v = i === points - 1 ? 1 : position((settle * (i + 1)) / points);
    return Math.round(v * 1000) / 1000;
  });
  return { easing: `linear(0, ${samples.join(', ')})`, duration: Math.round(settle * 1000) };
}
