import { useEffect, useRef } from 'react';
import './ripple.css';

export interface RippleProps {
  /** Désactive l'onde (la couche d'état CSS reste gérée par :disabled / aria-disabled). */
  readonly disabled?: boolean;
}

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Couche d'état + ondulation Material, à placer en PREMIER enfant d'un hôte `.md-state-host`.
 * Survol, focus et appui sont gérés en CSS (ripple.css) ; l'onde est créée au `pointerdown` à partir
 * du point touché et se dissipe au relâchement. Écoute l'ancêtre `[data-ripple-host]` s'il existe,
 * sinon le parent direct. Sans API Web Animations (tests), seule la couche CSS reste active.
 */
export function Ripple({ disabled = false }: RippleProps) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const layer = ref.current;
    const host = (layer?.closest('[data-ripple-host]') as HTMLElement | null) ?? layer?.parentElement;
    if (!layer || !host || disabled || typeof layer.animate !== 'function') return;

    const onPointerDown = (event: PointerEvent): void => {
      if (event.button !== 0 || prefersReducedMotion()) return;
      if (host.matches(':disabled, [aria-disabled="true"]')) return;
      const rect = layer.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const radius = Math.hypot(Math.max(x, rect.width - x), Math.max(y, rect.height - y));

      const wave = document.createElement('span');
      wave.className = 'md-ripple__wave';
      wave.style.left = `${x - radius}px`;
      wave.style.top = `${y - radius}px`;
      wave.style.width = wave.style.height = `${radius * 2}px`;
      layer.append(wave);

      const grow = wave.animate([{ transform: 'scale(0.1)' }, { transform: 'scale(1)' }], {
        duration: 450,
        easing: 'cubic-bezier(0.2, 0, 0, 1)',
        fill: 'forwards',
      });
      const release = (): void => {
        window.removeEventListener('pointerup', release);
        window.removeEventListener('pointercancel', release);
        // L'onde va au bout de son expansion, puis s'efface : un appui bref reste visible.
        void grow.finished.then(
          () => {
            const fade = wave.animate([{ opacity: getComputedStyle(wave).opacity }, { opacity: 0 }], { duration: 200, easing: 'linear', fill: 'forwards' });
            void fade.finished.then(() => wave.remove(), () => wave.remove());
          },
          () => wave.remove(),
        );
      };
      window.addEventListener('pointerup', release);
      window.addEventListener('pointercancel', release);
    };

    host.addEventListener('pointerdown', onPointerDown, { passive: true });
    return () => {
      host.removeEventListener('pointerdown', onPointerDown);
      layer.replaceChildren();
    };
  }, [disabled]);

  return <span ref={ref} className="md-ripple" aria-hidden="true" />;
}
