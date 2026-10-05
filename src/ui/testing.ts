/**
 * Aides pour les tests des composants (jsdom) : `matchMedia` simulé (animations réduites => ressorts
 * instantanés) et API absentes de jsdom. À importer en tête de fichier de test, avant tout rendu.
 */
import { vi } from 'vitest';

export interface MediaOptions {
  /** `prefers-reduced-motion: reduce` (défaut : oui, pour des animations instantanées). */
  readonly reducedMotion?: boolean;
  /** `prefers-color-scheme: dark`. */
  readonly dark?: boolean;
}

/** Installe un `window.matchMedia` minimal. */
export function installMatchMedia({ reducedMotion = true, dark = false }: MediaOptions = {}): void {
  window.matchMedia = vi.fn((query: string) => ({
    matches: query.includes('prefers-reduced-motion') ? reducedMotion : query.includes('prefers-color-scheme: dark') ? dark : false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

/** Attend la fin des animations de sortie (`AnimatePresence`) : quelques images d'animation. */
export const nextFrames = (count = 3): Promise<void> =>
  new Promise((resolve) => {
    const step = (left: number): void => {
      if (left <= 0) resolve();
      else requestAnimationFrame(() => step(left - 1));
    };
    step(count);
  });
