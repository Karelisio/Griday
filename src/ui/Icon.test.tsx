import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Icon } from './Icon';
import { ICON_PATHS, ICON_VIEW_BOX, type IconName } from './icons.generated';

/** Icônes demandées par le cahier des charges de l'interface. */
const REQUIRED: readonly IconName[] = [
  'today',
  'calendar_month',
  'all_inclusive',
  'settings',
  'undo',
  'redo',
  'lightbulb',
  'restart_alt',
  'pause',
  'play_arrow',
  'close',
  'check',
  'arrow_back',
  'chevron_right',
  'timer',
  'share',
  'bar_chart',
  'palette',
  'translate',
  'vibration',
  'info',
  'help',
  'emoji_events',
  'local_fire_department',
  'crown',
  'grid_view',
  'dark_mode',
  'light_mode',
  'contrast',
  'auto_awesome',
  'celebration',
  'error',
  'refresh',
];

describe('icônes générées', () => {
  it('contiennent toutes les icônes requises, avec un tracé non vide', () => {
    for (const name of REQUIRED) {
      expect(ICON_PATHS[name].outline, name).toMatch(/^[Mm]/);
    }
    expect(ICON_VIEW_BOX).toBe('0 -960 960 960');
  });

  it('proposent une variante pleine pour les destinations de navigation', () => {
    for (const name of ['today', 'all_inclusive', 'settings', 'calendar_month', 'bar_chart'] as const) {
      const paths = ICON_PATHS[name] as { outline: string; filled?: string };
      // Quand le jeu n'a pas de variante pleine distincte, `filled` est omis et le contour sert de repli.
      if (paths.filled) expect(paths.filled).not.toBe(paths.outline);
    }
    expect((ICON_PATHS.crown as { filled?: string }).filled).toBeTruthy();
    expect((ICON_PATHS.favorite as { filled?: string }).filled).toBeTruthy();
  });
});

describe('Icon', () => {
  it('est décorative par défaut (masquée aux lecteurs d’écran)', () => {
    const { container } = render(<Icon name="settings" />);
    const svg = container.querySelector('svg') as SVGSVGElement;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('role')).toBeNull();
    expect(svg.getAttribute('viewBox')).toBe(ICON_VIEW_BOX);
    expect(svg.getAttribute('focusable')).toBe('false');
    expect(svg.querySelector('path')?.getAttribute('d')).toBe(ICON_PATHS.settings.outline);
  });

  it('expose un texte alternatif quand `label` est fourni', () => {
    const { getByRole } = render(<Icon name="info" label="Informations" />);
    expect(getByRole('img', { name: 'Informations' })).toBeTruthy();
  });

  it('utilise la variante pleine quand elle existe, sinon le contour', () => {
    const { container, rerender } = render(<Icon name="crown" filled />);
    expect(container.querySelector('path')?.getAttribute('d')).toBe((ICON_PATHS.crown as { filled: string }).filled);
    rerender(<Icon name="check" filled />); // pas de variante distincte : repli sur le contour
    expect(container.querySelector('path')?.getAttribute('d')).toBe(ICON_PATHS.check.outline);
  });

  it('applique la taille et la classe', () => {
    const { container } = render(<Icon name="add" size={40} className="x" />);
    const svg = container.querySelector('svg') as SVGSVGElement;
    expect(svg.style.width).toBe('40px');
    expect(svg.style.height).toBe('40px');
    expect(svg.getAttribute('class')).toContain('md-icon');
    expect(svg.getAttribute('class')).toContain('x');
  });
});
