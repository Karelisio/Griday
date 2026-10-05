import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { List, ListItem } from './List';
import { NavigationBar, type NavigationDestination } from './NavigationBar';
import { SegmentedButton, type SegmentedOption } from './SegmentedButton';
import { Switch } from './Switch';
import { TopAppBar } from './TopAppBar';
import { ICON_PATHS } from './icons.generated';
import { installMatchMedia } from './testing';

installMatchMedia();
afterEach(() => {
  cleanup();
  document.documentElement.style.removeProperty('--md-navigation-bar-height');
});

describe('SegmentedButton', () => {
  const options: SegmentedOption<'system' | 'light' | 'dark'>[] = [
    { value: 'system', label: 'Système', icon: 'brightness_auto' },
    { value: 'light', label: 'Clair', icon: 'light_mode' },
    { value: 'dark', label: 'Sombre', icon: 'dark_mode' },
  ];

  function Harness({ initial = 'system', onChange }: { initial?: 'system' | 'light' | 'dark'; onChange?: (v: string) => void }) {
    const [value, setValue] = useState(initial);
    return (
      <SegmentedButton
        aria-label="Thème"
        options={options}
        value={value}
        onChange={(v) => {
          setValue(v);
          onChange?.(v);
        }}
      />
    );
  }

  it('groupe de boutons radio nommé, un seul coché', () => {
    render(<Harness initial="light" />);
    const group = screen.getByRole('radiogroup', { name: 'Thème' });
    const radios = within(group).getAllByRole('radio');
    expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false']);
    expect(radios.map((r) => r.textContent)).toEqual(['Système', 'Clair', 'Sombre']);
  });

  it('focus itinérant : seul le segment coché est dans l’ordre de tabulation', () => {
    render(<Harness initial="dark" />);
    const radios = screen.getAllByRole('radio');
    expect(radios.map((r) => r.tabIndex)).toEqual([-1, -1, 0]);
  });

  it('un clic sélectionne et appelle onChange', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Sombre' }));
    expect(onChange).toHaveBeenCalledWith('dark');
    expect(screen.getByRole('radio', { name: 'Sombre' }).getAttribute('aria-checked')).toBe('true');
  });

  it('flèches, Début et Fin déplacent la sélection (avec retour à l’autre bout)', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const key = (value: string, k: string) => fireEvent.keyDown(screen.getByRole('radio', { checked: true }), { key: k, bubbles: true }) ?? value;
    key('', 'ArrowRight');
    expect(onChange).toHaveBeenLastCalledWith('light');
    key('', 'ArrowDown');
    expect(onChange).toHaveBeenLastCalledWith('dark');
    key('', 'ArrowRight');
    expect(onChange).toHaveBeenLastCalledWith('system');
    key('', 'ArrowLeft');
    expect(onChange).toHaveBeenLastCalledWith('dark');
    key('', 'Home');
    expect(onChange).toHaveBeenLastCalledWith('system');
    key('', 'End');
    expect(onChange).toHaveBeenLastCalledWith('dark');
    // Le focus suit la sélection.
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: 'Sombre' }));
  });

  it('ignore les autres touches et saute les segments désactivés', () => {
    const onChange = vi.fn();
    render(
      <SegmentedButton
        aria-label="Langue"
        value="a"
        onChange={onChange}
        options={[
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B', disabled: true },
          { value: 'c', label: 'C' },
        ]}
      />,
    );
    fireEvent.keyDown(screen.getByRole('radio', { name: 'A' }), { key: 'x' });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole('radio', { name: 'A' }), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith('c');
    fireEvent.click(screen.getByRole('radio', { name: 'B' }));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('coche à la place de l’icône pour un segment à libellé ; icône conservée sans libellé', async () => {
    const path = (name: string) => screen.getByRole('radio', { name }).querySelector('svg path')?.getAttribute('d');
    const { rerender } = render(<SegmentedButton aria-label="x" value="light" onChange={() => {}} options={options} />);
    expect(path('Clair')).toBe(ICON_PATHS.check.outline);
    expect(path('Sombre')).toBe(ICON_PATHS.dark_mode.outline);
    rerender(<SegmentedButton aria-label="x" value="light" onChange={() => {}} showCheck={false} options={options} />);
    // L'icône sortante (coche) disparaît après son animation de sortie.
    await waitFor(() => expect(path('Clair')).toBe(ICON_PATHS.light_mode.outline));
    rerender(
      <SegmentedButton
        aria-label="x"
        value="a"
        onChange={() => {}}
        options={[
          { value: 'a', ariaLabel: 'Alpha', icon: 'star' },
          { value: 'b', ariaLabel: 'Beta', icon: 'flag' },
        ]}
      />,
    );
    expect(path('Alpha')).toBe(ICON_PATHS.star.outline); // icône seule : jamais remplacée par la coche
  });
});

describe('List et ListItem', () => {
  it('liste sémantique avec lignes statiques, cliquables et désactivées', () => {
    const onClick = vi.fn();
    render(
      <List aria-label="Historique">
        <ListItem headline="Aujourd’hui" supporting="Résolu en 03:12" />
        <ListItem headline="Hier" supporting="Résolu en 05:40" onClick={onClick} />
        <ListItem headline="Avant-hier" onClick={onClick} disabled />
      </List>,
    );
    expect(screen.getByRole('list', { name: 'Historique' })).toBeTruthy();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    // Seules les lignes cliquables sont des boutons ; le nom regroupe titre et texte secondaire.
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: /Hier/ }));
    expect(onClick).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: /Avant-hier/ }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Aujourd’hui').closest('button')).toBeNull();
  });

  it('ligne `control` : toute la ligne bascule le contrôle de fin, sans bouton imbriqué', () => {
    const onChange = vi.fn();
    render(
      <List>
        <ListItem headline="Vibrations" supporting="Retour haptique" control trailing={<Switch checked={false} onChange={onChange} />} />
      </List>,
    );
    const sw = screen.getByRole('switch', { name: /Vibrations/ });
    expect(sw.closest('button')).toBe(sw); // pas de <button> parent
    fireEvent.click(screen.getByText('Retour haptique')); // clic sur le texte de la ligne
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('variante segmentée, ligne sélectionnée et slots', () => {
    const { container } = render(
      <List variant="segmented">
        <ListItem headline="A" leading={<span data-testid="lead" />} trailing={<span data-testid="trail" />} selected onClick={() => {}} />
      </List>,
    );
    expect(container.querySelector('ul')?.className).toContain('md-list--segmented');
    expect(screen.getByRole('button').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('lead')).toBeTruthy();
    expect(screen.getByTestId('trail')).toBeTruthy();
  });

  it('hors liste : conteneur `div`', () => {
    const { container } = render(<ListItem as="div" headline="Seul" />);
    expect(container.querySelector('div.md-list-item')).toBeTruthy();
    expect(container.querySelector('li')).toBeNull();
  });
});

describe('NavigationBar', () => {
  const destinations: NavigationDestination[] = [
    { id: 'today', label: 'Aujourd’hui', icon: 'today' },
    { id: 'unlimited', label: 'Illimité', icon: 'all_inclusive' },
    { id: 'settings', label: 'Réglages', icon: 'settings' },
  ];

  function Harness({ onChange }: { onChange?: (id: string) => void }) {
    const [value, setValue] = useState('today');
    return (
      <NavigationBar
        aria-label="Navigation principale"
        destinations={destinations}
        value={value}
        onChange={(id) => {
          setValue(id);
          onChange?.(id);
        }}
      />
    );
  }

  it('zone de navigation nommée, libellés issus des props, destination active repérée', () => {
    render(<Harness />);
    const nav = screen.getByRole('navigation', { name: 'Navigation principale' });
    const buttons = within(nav).getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual(['Aujourd’hui', 'Illimité', 'Réglages']);
    expect(buttons.map((b) => b.getAttribute('aria-current'))).toEqual(['page', null, null]);
  });

  it('un clic change la destination (aria-current suit) et signale l’identifiant', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Réglages' }));
    expect(onChange).toHaveBeenCalledWith('settings');
    expect(screen.getByRole('button', { name: 'Réglages' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('button', { name: 'Aujourd’hui' }).getAttribute('aria-current')).toBeNull();
    // Une seule pastille active, déplacée dans la destination choisie.
    expect(document.querySelectorAll('.md-nav-bar__indicator')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Réglages' }).querySelector('.md-nav-bar__indicator')).toBeTruthy();
  });

  it('icône pleine superposée à l’icône contour (fondu), nom accessible optionnel', () => {
    render(
      <NavigationBar
        aria-label="Nav"
        value="a"
        onChange={() => {}}
        destinations={[
          { id: 'a', label: 'Accueil', icon: 'home', ariaLabel: 'Écran d’accueil' },
          { id: 'b', label: 'Stats', icon: 'bar_chart' },
        ]}
      />,
    );
    const home = screen.getByRole('button', { name: 'Écran d’accueil' });
    const paths = Array.from(home.querySelectorAll('svg path')).map((p) => p.getAttribute('d'));
    expect(paths).toEqual([ICON_PATHS.home.outline, (ICON_PATHS.home as { filled: string }).filled]);
  });

  it('publie sa hauteur dans --md-navigation-bar-height puis la retire', () => {
    const { unmount } = render(<Harness />);
    expect(document.documentElement.style.getPropertyValue('--md-navigation-bar-height')).toMatch(/^\d+(\.\d+)?px$/);
    unmount();
    expect(document.documentElement.style.getPropertyValue('--md-navigation-bar-height')).toBe('');
  });
});

describe('TopAppBar', () => {
  it('titre en <h1>, éléments de début et de fin', () => {
    render(<TopAppBar title="Réglages" leading={<button type="button">Retour</button>} trailing={<button type="button">Partager</button>} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Réglages' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retour' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Partager' })).toBeTruthy();
    expect(screen.getByRole('banner')).toBeTruthy();
  });

  it('variantes : classe de variante, grand titre masqué aux lecteurs d’écran (pas de doublon)', () => {
    const { rerender, container } = render(<TopAppBar title="Titre" variant="centered" />);
    expect(container.querySelector('header')?.className).toContain('md-top-app-bar--centered');
    expect(container.querySelector('.md-top-app-bar__expanded')).toBeNull();
    rerender(<TopAppBar title="Titre" variant="large" />);
    const expanded = container.querySelector('.md-top-app-bar__expanded') as HTMLElement;
    expect(expanded.getAttribute('aria-hidden')).toBe('true');
    expect(screen.getAllByText('Titre')).toHaveLength(2);
    expect(screen.getAllByRole('heading', { name: 'Titre' })).toHaveLength(1);
  });

  it('suit le défilement du conteneur : teinte au défilement et repli du grand titre', () => {
    const { container } = render(
      <div data-testid="scroller" style={{ overflowY: 'auto', height: 200 }}>
        <TopAppBar title="Titre" variant="large" />
      </div>,
    );
    const scroller = screen.getByTestId('scroller');
    const bar = container.querySelector('header') as HTMLElement;
    expect(bar.hasAttribute('data-scrolled')).toBe(false);
    expect(bar.style.getPropertyValue('--md-top-app-bar-collapse')).toBe('0');

    scroller.scrollTop = 44;
    act(() => {
      scroller.dispatchEvent(new Event('scroll'));
    });
    expect(bar.hasAttribute('data-scrolled')).toBe(true);
    expect(bar.style.getPropertyValue('--md-top-app-bar-collapse')).toBe(String(44 / 88));

    scroller.scrollTop = 500; // au-delà de la plage de repli : plafonné à 1
    act(() => {
      scroller.dispatchEvent(new Event('scroll'));
    });
    expect(bar.style.getPropertyValue('--md-top-app-bar-collapse')).toBe('1');

    scroller.scrollTop = 0;
    act(() => {
      scroller.dispatchEvent(new Event('scroll'));
    });
    expect(bar.hasAttribute('data-scrolled')).toBe(false);
  });

  it('défilement de la fenêtre quand aucun ancêtre ne défile', () => {
    const { container } = render(<TopAppBar title="Titre" />);
    const bar = container.querySelector('header') as HTMLElement;
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 30 });
    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });
    expect(bar.hasAttribute('data-scrolled')).toBe(true);
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });
    expect(bar.hasAttribute('data-scrolled')).toBe(false);
  });
});
