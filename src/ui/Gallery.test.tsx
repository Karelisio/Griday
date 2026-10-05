import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '../theme';
import { SnackbarHost } from './Snackbar';
import {
  AppBarSection,
  ButtonSection,
  CardSection,
  ChipSection,
  ColorSection,
  FabSection,
  IconButtonSection,
  ListSection,
  NavSection,
  OverlaySection,
  ProgressSection,
  RegionSection,
  SegmentedSection,
  ShapeSection,
  SwitchSection,
  TypeSection,
} from './gallery/sections';
import { installMatchMedia } from './testing';

installMatchMedia();
afterEach(cleanup);

function renderGallery(dark: boolean) {
  return render(
    <ThemeProvider mode={dark ? 'dark' : 'light'}>
      <SnackbarHost closeLabel="Close">
        <ColorSection />
        <TypeSection />
        <ShapeSection />
        <ButtonSection />
        <IconButtonSection />
        <FabSection />
        <CardSection />
        <ChipSection />
        <SegmentedSection />
        <SwitchSection />
        <ListSection />
        <NavSection />
        <AppBarSection />
        <ProgressSection />
        <OverlaySection initial={null} />
        <RegionSection />
      </SnackbarHost>
    </ThemeProvider>,
  );
}

describe('galerie : tous les composants ensemble, en clair et en sombre', () => {
  it.each([false, true])('rendu sans avertissement React (sombre : %s)', (dark) => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warnings = vi.spyOn(console, 'warn').mockImplementation(() => {});
    renderGallery(dark);
    expect(errors.mock.calls.map((c) => String(c[0]))).toEqual([]);
    // `motion` signale en développement que « réduire les animations » est actif (c'est le but du test).
    expect(warnings.mock.calls.map((c) => String(c[0])).filter((m) => !/Reduced Motion enabled/.test(m))).toEqual([]);
    errors.mockRestore();
    warnings.mockRestore();
  });

  it('tout contrôle interactif a un nom accessible', () => {
    renderGallery(false);
    for (const role of ['button', 'switch', 'radio', 'progressbar', 'navigation'] as const) {
      const all = screen.getAllByRole(role);
      expect(all.length, role).toBeGreaterThan(0);
      for (const el of all) {
        const nameless = screen.queryAllByRole(role, { name: /^\s*$/ }).includes(el);
        expect(nameless, `${role} sans nom : ${el.outerHTML.slice(0, 120)}`).toBe(false);
      }
    }
  });

  it('aucun contrôle imbriqué dans un autre (boutons, interrupteurs, liens)', () => {
    const { container } = renderGallery(false);
    const interactive = 'button, a[href], [role="switch"], [role="radio"], input, select, textarea';
    for (const el of Array.from(container.querySelectorAll(interactive))) {
      expect(el.parentElement?.closest(interactive), el.outerHTML.slice(0, 100)).toBeNull();
    }
  });

  it('les boutons sont tous de type button (jamais de soumission involontaire)', () => {
    const { container } = renderGallery(false);
    for (const b of Array.from(container.querySelectorAll('button'))) expect(b.getAttribute('type'), b.outerHTML.slice(0, 100)).toBe('button');
  });

  it('une seule destination active par barre de navigation', () => {
    renderGallery(false);
    for (const nav of screen.getAllByRole('navigation')) {
      expect(nav.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
    }
  });
});
