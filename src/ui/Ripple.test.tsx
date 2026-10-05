import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Ripple } from './internal/Ripple';
import { installMatchMedia } from './testing';

afterEach(() => {
  cleanup();
  // @ts-expect-error nettoyage de l'API simulée
  delete Element.prototype.animate;
});

/** API Web Animations minimale : `finished` se résout immédiatement. */
function installAnimate() {
  const animate = vi.fn(() => ({ finished: Promise.resolve(), cancel: () => {} }));
  Element.prototype.animate = animate as unknown as typeof Element.prototype.animate;
  return animate;
}

describe('Ripple', () => {
  it('couche décorative masquée aux lecteurs d’écran', () => {
    installMatchMedia({ reducedMotion: false });
    const { container } = render(
      <button type="button">
        <Ripple />
        Ok
      </button>,
    );
    const layer = container.querySelector('.md-ripple') as HTMLElement;
    expect(layer.getAttribute('aria-hidden')).toBe('true');
    expect(screen.getByRole('button', { name: 'Ok' })).toBeTruthy();
  });

  it('crée une onde au toucher puis la retire', async () => {
    installMatchMedia({ reducedMotion: false });
    const animate = installAnimate();
    const { container } = render(
      <button type="button">
        <Ripple />
        Ok
      </button>,
    );
    const button = screen.getByRole('button');
    fireEvent.pointerDown(button, { button: 0, clientX: 10, clientY: 10 });
    expect(container.querySelectorAll('.md-ripple__wave')).toHaveLength(1);
    expect(animate).toHaveBeenCalled();
    fireEvent.pointerUp(window);
    await waitFor(() => expect(container.querySelectorAll('.md-ripple__wave')).toHaveLength(0));
  });

  it('animations réduites ou bouton désactivé : aucune onde', () => {
    installMatchMedia({ reducedMotion: true });
    installAnimate();
    const { container, rerender } = render(
      <button type="button">
        <Ripple />
        Ok
      </button>,
    );
    fireEvent.pointerDown(screen.getByRole('button'), { button: 0 });
    expect(container.querySelectorAll('.md-ripple__wave')).toHaveLength(0);

    installMatchMedia({ reducedMotion: false });
    rerender(
      <button type="button" disabled>
        <Ripple />
        Ok
      </button>,
    );
    fireEvent.pointerDown(screen.getByRole('button'), { button: 0 });
    expect(container.querySelectorAll('.md-ripple__wave')).toHaveLength(0);
  });

  it('écoute l’ancêtre data-ripple-host quand il existe', () => {
    installMatchMedia({ reducedMotion: false });
    installAnimate();
    const { container } = render(
      <button type="button" data-ripple-host="">
        <span>
          <Ripple />
        </span>
        Texte
      </button>,
    );
    fireEvent.pointerDown(screen.getByRole('button'), { button: 0 });
    expect(container.querySelectorAll('.md-ripple__wave')).toHaveLength(1);
  });
});
