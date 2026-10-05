import { useEffect, useRef, type RefObject } from 'react';

/** Modales ouvertes, la dernière en haut : seule celle-ci réagit à Échap et piège le focus. */
const stack: symbol[] = [];
let scrollLocks = 0;

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(',');

function focusableIn(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.hasAttribute('inert') && el.getAttribute('aria-hidden') !== 'true' && el.getClientRects().length > 0,
  );
}

export interface UseModalOptions {
  readonly open: boolean;
  /** Appelé pour fermer (Échap). Les autres chemins de fermeture (voile, geste) sont gérés par le composant. */
  readonly onClose: () => void;
  /** Élément racine de la modale (reçoit le focus, délimite le piège à focus). */
  readonly containerRef: RefObject<HTMLElement | null>;
  /** Élément à focaliser à l'ouverture ; sinon la modale elle-même. */
  readonly initialFocusRef?: RefObject<HTMLElement | null>;
  /** Échap ferme la modale (défaut : oui). */
  readonly closeOnEscape?: boolean;
}

/**
 * Comportement commun des modales (feuille, dialogue) : Échap, piège à focus, focus initial puis
 * restauré à la fermeture, reste de la page inerte (`inert` + `aria-hidden`) et défilement bloqué.
 * Les éléments portant `data-md-keep` (ex. zone des snackbars) restent actifs.
 */
export function useModal({ open, onClose, containerRef, initialFocusRef, closeOnEscape = true }: UseModalOptions): void {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const escapeRef = useRef(closeOnEscape);
  escapeRef.current = closeOnEscape;

  useEffect(() => {
    if (!open) return;
    const token = Symbol('modal');
    stack.push(token);
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const container = containerRef.current;

    // Reste de la page : inerte et masqué aux lecteurs d'écran.
    const saved: { el: HTMLElement; inert: boolean; ariaHidden: string | null }[] = [];
    for (const el of Array.from(document.body.children)) {
      if (!(el instanceof HTMLElement) || el === container || el.contains(container) || el.hasAttribute('data-md-keep')) continue;
      saved.push({ el, inert: el.inert, ariaHidden: el.getAttribute('aria-hidden') });
      el.inert = true;
      el.setAttribute('aria-hidden', 'true');
    }

    scrollLocks += 1;
    document.documentElement.classList.add('md-scroll-locked');

    // Focus initial.
    (initialFocusRef?.current ?? container)?.focus({ preventScroll: true });

    const onKeyDown = (event: KeyboardEvent): void => {
      if (stack[stack.length - 1] !== token) return;
      if (event.key === 'Escape' && escapeRef.current) {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !containerRef.current) return;
      const items = focusableIn(containerRef.current);
      if (items.length === 0) {
        event.preventDefault();
        containerRef.current.focus({ preventScroll: true });
        return;
      }
      const first = items[0] as HTMLElement;
      const last = items[items.length - 1] as HTMLElement;
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === containerRef.current || !containerRef.current.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !containerRef.current.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);

    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      const index = stack.indexOf(token);
      if (index >= 0) stack.splice(index, 1);
      for (const { el, inert, ariaHidden } of saved) {
        el.inert = inert;
        if (ariaHidden === null) el.removeAttribute('aria-hidden');
        else el.setAttribute('aria-hidden', ariaHidden);
      }
      scrollLocks = Math.max(0, scrollLocks - 1);
      if (scrollLocks === 0) document.documentElement.classList.remove('md-scroll-locked');
      if (previouslyFocused?.isConnected) previouslyFocused.focus({ preventScroll: true });
    };
  }, [open, containerRef, initialFocusRef]);
}
