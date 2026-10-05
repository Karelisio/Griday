import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button, BUTTON_METRICS } from './Button';
import { Card } from './Card';
import { Chip } from './Chip';
import { Divider } from './Divider';
import { ExtendedFab, Fab } from './Fab';
import { IconButton } from './IconButton';
import { ICON_PATHS } from './icons.generated';
import { Switch } from './Switch';
import { installMatchMedia } from './testing';

installMatchMedia();
afterEach(cleanup);

const pathOf = (el: HTMLElement) => el.querySelector('svg path')?.getAttribute('d');

describe('Button', () => {
  it('est un vrai <button type="button"> (Entrée et Espace l’activent nativement)', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Jouer</Button>);
    const button = screen.getByRole('button', { name: 'Jouer' });
    expect(button.tagName).toBe('BUTTON');
    expect(button.getAttribute('type')).toBe('button');
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('désactivé : ne déclenche rien et reste annoncé comme désactivé', () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Jouer
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Jouer' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('applique le style, la taille et la forme (angles en px pour le ressort)', async () => {
    const { rerender } = render(
      <Button variant="tonal" size="m">
        A
      </Button>,
    );
    let button = screen.getByRole('button');
    expect(button.className).toContain('md-button--tonal');
    expect(button.className).toContain('md-button--m');
    expect(button.style.borderRadius).toBe(`${BUTTON_METRICS.m.height / 2}px`); // pilule
    rerender(
      <Button shape="square" size="m">
        A
      </Button>,
    );
    button = screen.getByRole('button');
    // Le changement de forme est animé (instantané en animations réduites, mais sur l'image suivante).
    return waitFor(() => expect(button.style.borderRadius).toBe(`${BUTTON_METRICS.m.square}px`));
  });

  it('affiche les icônes avant et après le libellé', () => {
    const { container } = render(
      <Button icon="lightbulb" trailingIcon="chevron_right">
        Indice
      </Button>,
    );
    const paths = Array.from(container.querySelectorAll('svg path')).map((p) => p.getAttribute('d'));
    expect(paths).toEqual([ICON_PATHS.lightbulb.outline, ICON_PATHS.chevron_right.outline]);
    expect(container.querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(2);
  });

  it('bouton à bascule : aria-pressed et forme qui change à la sélection', () => {
    const { rerender } = render(
      <Button variant="tonal" selected={false}>
        Pause
      </Button>,
    );
    let button = screen.getByRole('button', { name: 'Pause' });
    expect(button.getAttribute('aria-pressed')).toBe('false');
    const idle = button.style.borderRadius;
    rerender(
      <Button variant="tonal" selected>
        Pause
      </Button>,
    );
    button = screen.getByRole('button', { name: 'Pause' });
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.className).toContain('md-button--selected');
    return waitFor(() => expect(button.style.borderRadius).not.toBe(idle));
  });

  it('sans bascule, pas d’aria-pressed', () => {
    render(<Button>Ok</Button>);
    expect(screen.getByRole('button').hasAttribute('aria-pressed')).toBe(false);
  });
});

describe('IconButton', () => {
  it('porte son nom accessible via `label`', () => {
    render(<IconButton icon="undo" label="Annuler" />);
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeTruthy();
  });

  it('bascule : aria-pressed et icône pleine quand sélectionné', () => {
    const { rerender } = render(<IconButton icon="favorite" label="Favori" selected={false} />);
    const button = screen.getByRole('button', { name: 'Favori' });
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(pathOf(button)).toBe(ICON_PATHS.favorite.outline);
    rerender(<IconButton icon="favorite" label="Favori" selected />);
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(pathOf(button)).toBe((ICON_PATHS.favorite as { filled: string }).filled);
    rerender(<IconButton icon="favorite" selectedIcon="star" label="Favori" selected />);
    expect(pathOf(button)).toBe((ICON_PATHS.star as { outline: string }).outline);
  });

  it('iconFilled force la variante pleine', () => {
    render(<IconButton icon="crown" iconFilled label="Reine" />);
    expect(pathOf(screen.getByRole('button', { name: 'Reine' }))).toBe((ICON_PATHS.crown as { filled: string }).filled);
  });

  it('désactivé et clic', () => {
    const onClick = vi.fn();
    const { rerender } = render(<IconButton icon="redo" label="Rétablir" onClick={onClick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
    rerender(<IconButton icon="redo" label="Rétablir" onClick={onClick} disabled />);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('Fab', () => {
  it('Fab : nom accessible fourni par `label`', () => {
    render(<Fab icon="add" label="Nouvelle grille" />);
    expect(screen.getByRole('button', { name: 'Nouvelle grille' })).toBeTruthy();
  });

  it('ExtendedFab : le libellé visible nomme le bouton, y compris replié', () => {
    const { rerender } = render(<ExtendedFab icon="play_arrow">Jouer</ExtendedFab>);
    expect(screen.getByRole('button', { name: 'Jouer' })).toBeTruthy();
    rerender(
      <ExtendedFab icon="play_arrow" collapsed>
        Jouer
      </ExtendedFab>,
    );
    // Replié : le texte reste dans l'arbre d'accessibilité (largeur nulle, pas retiré).
    expect(screen.getByRole('button', { name: 'Jouer' })).toBeTruthy();
  });

  it('visible={false} retire le bouton après l’animation de sortie', async () => {
    const { rerender } = render(<Fab icon="add" label="Ajouter" />);
    expect(screen.queryByRole('button', { name: 'Ajouter' })).toBeTruthy();
    rerender(<Fab icon="add" label="Ajouter" visible={false} />);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Ajouter' })).toBeNull());
  });
});

describe('Card', () => {
  it('statique : pas un bouton', () => {
    render(<Card variant="outlined">Contenu</Card>);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('Contenu').className).toContain('md-card--outlined');
  });

  it('interactive : devient un bouton avec aria-pressed quand elle est sélectionnable', () => {
    const onClick = vi.fn();
    render(
      <Card onClick={onClick} selected>
        Mode Reines
      </Card>,
    );
    const card = screen.getByRole('button', { name: 'Mode Reines' });
    expect(card.tagName).toBe('BUTTON');
    expect(card.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(card);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('interactive désactivée', () => {
    const onClick = vi.fn();
    render(
      <Card onClick={onClick} disabled>
        Verrouillé
      </Card>,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('Chip', () => {
  it('assistance : bouton simple avec icône', () => {
    const onClick = vi.fn();
    render(
      <Chip icon="lightbulb" onClick={onClick}>
        Indice
      </Chip>,
    );
    const chip = screen.getByRole('button', { name: 'Indice' });
    expect(chip.hasAttribute('aria-pressed')).toBe(false);
    expect(pathOf(chip)).toBe(ICON_PATHS.lightbulb.outline);
    fireEvent.click(chip);
    expect(onClick).toHaveBeenCalled();
  });

  it('filtre : aria-pressed et coche quand il est sélectionné', async () => {
    const { rerender } = render(
      <Chip variant="filter" selected={false}>
        Facile
      </Chip>,
    );
    const chip = screen.getByRole('button', { name: 'Facile' });
    expect(chip.getAttribute('aria-pressed')).toBe('false');
    expect(chip.querySelector('svg')).toBeNull();
    rerender(
      <Chip variant="filter" selected>
        Facile
      </Chip>,
    );
    expect(chip.getAttribute('aria-pressed')).toBe('true');
    expect(chip.className).toContain('md-chip--selected');
    expect(pathOf(chip)).toBe(ICON_PATHS.check.outline);
    rerender(
      <Chip variant="filter" selected={false}>
        Facile
      </Chip>,
    );
    await waitFor(() => expect(chip.querySelector('svg')).toBeNull());
  });
});

describe('Switch', () => {
  it('est un interrupteur : role=switch, aria-checked, bascule au clic', () => {
    const onChange = vi.fn();
    const { rerender } = render(<Switch checked={false} onChange={onChange} aria-label="Vibrations" />);
    const sw = screen.getByRole('switch', { name: 'Vibrations' });
    expect(sw.tagName).toBe('BUTTON');
    expect(sw.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(sw);
    expect(onChange).toHaveBeenLastCalledWith(true);
    rerender(<Switch checked onChange={onChange} aria-label="Vibrations" />);
    expect(sw.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(sw);
    expect(onChange).toHaveBeenLastCalledWith(false);
  });

  it('désactivé : aucun changement', () => {
    const onChange = vi.fn();
    render(<Switch checked onChange={onChange} disabled aria-label="x" />);
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('se nomme aussi via <label htmlFor>', () => {
    render(
      <>
        <label htmlFor="sw">Croix automatiques</label>
        <Switch id="sw" checked={false} onChange={() => {}} />
      </>,
    );
    expect(screen.getByRole('switch', { name: 'Croix automatiques' })).toBeTruthy();
  });

  it('icône du pouce : coche si activé, croix sinon, aucune sans showIcons', () => {
    const { rerender, container } = render(<Switch checked onChange={() => {}} aria-label="a" />);
    expect(container.querySelector('svg path')?.getAttribute('d')).toBe(ICON_PATHS.check.outline);
    rerender(<Switch checked onChange={() => {}} showIcons={false} aria-label="a" />);
    return waitFor(() => expect(container.querySelector('svg')).toBeNull());
  });
});

describe('Divider', () => {
  it('horizontal : <hr> ; vertical : role=separator orienté', () => {
    const { container, rerender } = render(<Divider variant="inset" />);
    expect(container.querySelector('hr')?.className).toContain('md-divider--inset');
    rerender(<Divider orientation="vertical" />);
    const separator = screen.getByRole('separator');
    expect(separator.getAttribute('aria-orientation')).toBe('vertical');
  });
});
