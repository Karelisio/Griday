/** Calculs des graphiques (purs) : axe de temps aux graduations rondes, proportions, variables CSS en ligne. */
import type { CSSProperties } from 'react';

/** Pas ronds des graduations de temps, en secondes (5 s à 1 jour). */
const STEPS_S = [5, 10, 15, 30, 60, 120, 180, 300, 600, 900, 1200, 1800, 3600, 7200, 10_800, 21_600, 43_200, 86_400] as const;

export interface TimeScale {
  /** Graduations en ms, de 0 au sommet inclus. */
  readonly ticks: readonly number[];
  /** Sommet de l'axe en ms : dernière graduation, au moins `maxMs`. */
  readonly topMs: number;
}

/**
 * Axe de temps de 0 à un sommet rond couvrant `maxMs`, en 2 à `maxIntervals` intervalles réguliers.
 * Parmi les pas possibles : le sommet le plus bas (peu de marge perdue), à égalité le moins d'intervalles.
 */
export function timeScale(maxMs: number, maxIntervals = 4): TimeScale {
  const maxS = Math.max(maxMs, 0) / 1000;
  const options = STEPS_S.map((step) => ({ step, count: Math.max(1, Math.ceil(maxS / step)) }));
  const fits = options
    .filter(({ count }) => count >= 2 && count <= maxIntervals)
    .sort((a, b) => a.step * a.count - b.step * b.count || a.count - b.count);
  // Hors plage (temps minuscule ou démesuré) : plus petit ou plus grand pas, sans minimum d'intervalles.
  const { step, count } = fits[0] ?? (maxS <= STEPS_S[0] ? options[0]! : options.at(-1)!);
  return { ticks: Array.from({ length: count + 1 }, (_, i) => i * step * 1000), topMs: count * step * 1000 };
}

/**
 * Seuil au-delà duquel une valeur écraserait les autres sur l'axe (partie laissée ouverte, un chronomètre oublié) :
 * 2 fois la plus grande valeur restante une fois écartés les 10 % les plus hauts (au moins un). Dès 4 valeurs seulement.
 */
export function outlierLimit(values: readonly number[]): number {
  if (values.length < 4) return Infinity;
  const sorted = [...values].sort((a, b) => a - b);
  return 2 * sorted[sorted.length - 1 - Math.ceil(sorted.length / 10)]!;
}

/** Part de `value` dans `total`, bornée à [0, 1] (0 si `total` est nul). */
export const share = (value: number, total: number): number => (total > 0 ? Math.min(1, Math.max(0, value / total)) : 0);

/** Variables CSS personnalisées en ligne (`--v`, `--i`…), typées pour `style`. */
export const cssVars = (vars: Record<`--${string}`, string | number>): CSSProperties => vars as CSSProperties;
