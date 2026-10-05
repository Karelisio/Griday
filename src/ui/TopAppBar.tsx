import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { cx } from './internal/cx';
import './TopAppBar.css';

export type TopAppBarVariant = 'small' | 'centered' | 'medium' | 'large';

export interface TopAppBarProps {
  /** Titre de l'écran (texte déjà traduit). */
  readonly title: string;
  /**
   * `small` : titre à gauche (défaut) ; `centered` : titre centré ;
   * `medium` / `large` : grand titre sous la barre, qui se replie dans la barre au défilement.
   */
  readonly variant?: TopAppBarVariant;
  /** Élément de début, en général un `IconButton` « retour ». */
  readonly leading?: ReactNode;
  /** Actions de fin (jusqu'à trois `IconButton`). */
  readonly trailing?: ReactNode;
  /**
   * Conteneur dont le défilement pilote l'ombre tonale et le repli du titre : élément, ref ou
   * `'window'`. Par défaut : l'ancêtre défilant le plus proche, sinon la fenêtre.
   */
  readonly scrollContainer?: HTMLElement | RefObject<HTMLElement | null> | 'window' | null;
  readonly className?: string;
}

const EXPANDED_EXTRA = { medium: 48, large: 88 } as const;

function findScrollParent(element: HTMLElement): HTMLElement | Window {
  for (let node = element.parentElement; node && node !== document.body && node !== document.documentElement; node = node.parentElement) {
    const overflowY = getComputedStyle(node).overflowY;
    if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') return node;
  }
  return window;
}

function resolveTarget(bar: HTMLElement, option: TopAppBarProps['scrollContainer']): HTMLElement | Window {
  if (option === 'window') return window;
  if (option && 'current' in option) return option.current ?? findScrollParent(bar);
  return option ?? findScrollParent(bar);
}

/**
 * Barre d'application supérieure M3 : petite, centrée, moyenne ou grande. Placez-la comme premier
 * enfant du conteneur qui défile : elle reste collée en haut ; au défilement, son fond passe à la
 * teinte `surface-container` et, pour `medium`/`large`, le grand titre se replie dans la barre.
 * Le défilement est suivi sans nouveau rendu React (attribut `data-scrolled` et variable CSS).
 */
export function TopAppBar({ title, variant = 'small', leading, trailing, scrollContainer, className }: TopAppBarProps) {
  const barRef = useRef<HTMLElement>(null);
  const collapsible = variant === 'medium' || variant === 'large';

  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const target = resolveTarget(bar, scrollContainer);
    const range = variant === 'medium' || variant === 'large' ? EXPANDED_EXTRA[variant] : 0;
    // Barre hors du conteneur qui défile : pas de marge de compensation du repli.
    bar.toggleAttribute('data-detached', target !== window && !(target as HTMLElement).contains(bar));
    const update = (): void => {
      const top = target === window ? window.scrollY : (target as HTMLElement).scrollTop;
      bar.toggleAttribute('data-scrolled', top > 1);
      if (range > 0) bar.style.setProperty('--md-top-app-bar-collapse', String(Math.min(1, Math.max(0, top / range))));
    };
    target.addEventListener('scroll', update, { passive: true });
    update();
    return () => {
      target.removeEventListener('scroll', update);
      bar.removeAttribute('data-scrolled');
      bar.removeAttribute('data-detached');
    };
  }, [variant, scrollContainer]);

  return (
    <header ref={barRef} className={cx('md-top-app-bar', `md-top-app-bar--${variant}`, collapsible && 'md-top-app-bar--collapsible', className)}>
      <div className="md-top-app-bar__row">
        {leading ? <div className="md-top-app-bar__leading">{leading}</div> : null}
        <h1 className="md-top-app-bar__title md-typescale-title-large">{title}</h1>
        {trailing ? <div className="md-top-app-bar__trailing">{trailing}</div> : null}
      </div>
      {collapsible ? (
        <div
          className={cx('md-top-app-bar__expanded', variant === 'large' ? 'md-typescale-headline-large' : 'md-typescale-headline-medium')}
          aria-hidden="true"
        >
          {title}
        </div>
      ) : null}
    </header>
  );
}
