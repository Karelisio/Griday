import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { i18n, initI18n, setLanguage } from '../i18n';
import { dailyStats, unlimitedStats } from '../progress/stats';
import type { DailyResult } from '../progress/types';
import { capitalize } from './format';
import { RecentChart } from './RecentChart';
import { SizeTable } from './SizeTable';
import { TierChart } from './TierChart';
import { daily, unlimited } from './testing';

beforeAll(async () => {
  await initI18n('fr');
});
afterEach(async () => {
  await setLanguage('fr');
});

const row = (container: HTMLElement, i: number) => container.querySelectorAll<HTMLElement>('.tier-chart__row')[i]!;
const recent = (n: number, over: (i: number) => Partial<DailyResult> = () => ({})) =>
  Array.from({ length: n }, (_, i) => daily(n - 1 - i, { timeMs: 60_000 * (i + 1), ...over(i) })); // du plus ancien au plus récent

describe('graphique par difficulté', () => {
  it('aucun résultat : quatre paliers vides, sans division par zéro', () => {
    const { container } = render(<TierChart tiers={dailyStats([]).byTier} />);
    expect(container.querySelectorAll('[data-empty]').length).toBe(4);
    expect([0, 1, 2, 3].map((i) => row(container, i).style.getPropertyValue('--v'))).toEqual(['0', '0', '0', '0']);
    expect(screen.getByRole('img').getAttribute('aria-label')).toMatch(/Facile\s: aucun puzzle\. Moyen\s: aucun puzzle\. Difficile\s: aucun puzzle\. Expert\s: aucun puzzle\.$/);
  });

  it('barres proportionnelles au temps moyen, nombre de puzzles sous chaque difficulté', () => {
    const tiers = dailyStats([daily(0, { tier: 1, timeMs: 30_000 }), daily(1, { tier: 2, timeMs: 60_000 }), daily(2, { tier: 2, timeMs: 120_000 }), daily(3, { tier: 4, timeMs: 180_000 })]).byTier;
    const { container } = render(<TierChart tiers={tiers} />);
    expect([0, 1, 2, 3].map((i) => row(container, i).style.getPropertyValue('--v'))).toEqual(['0.16666666666666666', '0.5', '0', '1']);
    expect([0, 1, 2, 3].map((i) => row(container, i).querySelector('.tier-chart__count')!.textContent)).toEqual(['1 puzzle', '2 puzzles', 'Aucun puzzle', '1 puzzle']);
    expect(row(container, 3).getAttribute('data-tier')).toBe('4');
    expect(within(row(container, 3)).getByText('3:00')).toBeTruthy();
  });
});

describe('graphique d’évolution', () => {
  it('axe aux graduations rondes et colonnes proportionnelles', () => {
    // De 1 à 3 min : axe de 0 à 3 min, une graduation par minute (la plus haute colonne touche le sommet).
    const { container } = render(<RecentChart results={recent(3)} />);
    expect([...container.querySelectorAll('.recent-chart__ticks span')].map((t) => t.textContent)).toEqual(['0:00', '1:00', '2:00', '3:00']);
    expect([...container.querySelectorAll<HTMLElement>('.recent-chart__bar')].map((b) => Number(b.style.getPropertyValue('--h')).toFixed(3))).toEqual(['0.333', '0.667', '1.000']);
    expect(container.querySelector<HTMLElement>('.recent-chart')!.style.getPropertyValue('--k')).toBe('3');
    expect(container.querySelector<HTMLElement>('.recent-chart')!.style.getPropertyValue('--n')).toBe('3');
  });

  it('curseur : un cran par puzzle, dernier puzzle choisi par défaut, valeur bornée si les données raccourcissent', () => {
    const { rerender } = render(<RecentChart results={recent(5)} />);
    const slider = () => screen.getByRole('slider', { name: 'Choisir un puzzle' }) as HTMLInputElement;
    expect([slider().min, slider().max, slider().value]).toEqual(['0', '4', '4']);
    fireEvent.change(slider(), { target: { value: '3' } });
    expect(slider().value).toBe('3');
    rerender(<RecentChart results={recent(3)} />);
    expect([slider().max, slider().value]).toEqual(['2', '2']);
  });

  it('détail du puzzle choisi : date, temps, difficulté, taille, indices et origine', () => {
    const results = recent(3, (i) => (i === 1 ? { tier: 3, size: 8, hintsUsed: 2, mode: 'archive' as const } : {}));
    const { container } = render(<RecentChart results={results} />);
    fireEvent.change(screen.getByRole('slider'), { target: { value: '1' } });
    const readout = container.querySelector('.recent-chart__readout')!;
    expect(readout.querySelector('[data-tier]')!.getAttribute('data-tier')).toBe('3');
    expect(readout.textContent).toContain('2:00');
    expect(readout.textContent).toContain('Difficile');
    expect(readout.textContent).toContain('2 indices utilisés');
    expect(readout.textContent).toContain('résolu plus tard');
    expect(screen.getByRole('slider').getAttribute('aria-valuetext')).toMatch(/Difficile, 8\s×\s8, 2 indices utilisés, résolu plus tard$/);
    // Puzzle rendu à temps : même formule que l'état du jour dans le calendrier des archives.
    fireEvent.change(screen.getByRole('slider'), { target: { value: '2' } });
    expect(readout.textContent).toContain('résolu à temps');
    expect(screen.getByRole('slider').getAttribute('aria-valuetext')).toMatch(/Facile, 6\s×\s6, sans indice, résolu à temps$/);
  });

  it('légende : quatre difficultés dans l’ordre puis « résolu plus tard », masquée aux lecteurs d’écran', () => {
    const { container } = render(<RecentChart results={recent(2)} />);
    const legend = container.querySelector('.recent-chart__legend')!;
    expect([...legend.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['Facile', 'Moyen', 'Difficile', 'Expert', 'Résolu plus tard']);
    expect(legend.getAttribute('aria-hidden')).toBe('true');
  });

  it.each(['fr', 'en'] as const)('mêmes noms que le calendrier des archives (%s)', async (lang) => {
    await setLanguage(lang);
    const { container } = render(<RecentChart results={recent(2, (i) => (i === 0 ? { mode: 'archive' as const } : {}))} />);
    const readout = container.querySelector('.recent-chart__readout')!;
    const slider = screen.getByRole('slider');
    expect(container.querySelector('.recent-chart__legend [data-archive]')!.textContent).toBe(capitalize(i18n.t('archive.status.late'), lang));
    expect(readout.textContent).toContain(i18n.t('archive.status.solved')); // dernier puzzle : à temps
    fireEvent.change(slider, { target: { value: '0' } });
    expect(readout.textContent).toContain(i18n.t('archive.status.late'));
    expect(slider.getAttribute('aria-valuetext')).toMatch(new RegExp(`${i18n.t('archive.status.late')}$`));
  });

  it('une valeur aberrante est tronquée seulement si elle dépasse l’axe', () => {
    const times = [60_000, 62_000, 64_000, 66_000, 68_000, 70_000, 72_000, 74_000];
    const normal = render(<RecentChart results={times.map((timeMs, i) => daily(times.length - 1 - i, { timeMs }))} />);
    expect(normal.container.querySelectorAll('[data-clipped]').length).toBe(0);
    normal.unmount();
    const odd = render(<RecentChart results={[...times.slice(0, 7), 3_600_000].map((timeMs, i) => daily(7 - i, { timeMs }))} />);
    const bars = [...odd.container.querySelectorAll<HTMLElement>('.recent-chart__bar')];
    expect(bars.map((b) => b.hasAttribute('data-clipped'))).toEqual([false, false, false, false, false, false, false, true]);
    expect(bars[7]!.style.getPropertyValue('--h')).toBe('1'); // pleine hauteur
  });
});

describe('tableau par taille', () => {
  it('en-têtes de colonnes et de lignes, valeurs absentes en tiret', () => {
    render(
      <SizeTable
        sizes={[
          ...unlimitedStats([unlimited(6, 90_000), unlimited(6, 150_000)]).bySize,
          { size: 9, count: 0, averageMs: null, bestMs: null },
        ]}
      />,
    );
    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('columnheader').length).toBe(4);
    const rows = within(table).getAllByRole('row').slice(1);
    expect(within(rows[0]!).getByRole('rowheader').textContent).toMatch(/^6\s×\s6$/);
    expect(within(rows[0]!).getByText('2')).toBeTruthy();
    expect(within(rows[0]!).getByText('2:00')).toBeTruthy(); // moyenne de 90 s et 150 s
    expect(within(rows[0]!).getByText('1:30')).toBeTruthy(); // meilleur temps
    expect(within(rows[1]!).getAllByText('–').length).toBe(2);
  });
});
