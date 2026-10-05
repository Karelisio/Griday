import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { i18n, initI18n, setLanguage } from '../i18n';
import { formatClock, formatDuration } from '../i18n/format';
import { ProgressProvider } from '../progress/ProgressContext';
import type { ProgressData } from '../progress/store';
import { formatPercent, formatShortDate } from '../stats/format';
import { daily, day, progress, unlimited } from '../stats/testing';
import { StatsScreen } from './StatsScreen';

beforeAll(async () => {
  await initI18n('fr');
});
afterEach(async () => {
  await setLanguage('fr');
  localStorage.clear();
});

function renderStats(data: ProgressData, visible = true) {
  return render(
    <ProgressProvider initial={data}>
      <StatsScreen visible={visible} />
    </ProgressProvider>,
  );
}

/** Six puzzles du jour (dont un d'archive) répartis sur les quatre paliers, 4 jours de série, mode illimité sur deux tailles. */
const populated = () =>
  progress(
    [
      daily(0, { tier: 1, size: 6, timeMs: 60_000 }),
      daily(1, { tier: 1, size: 7, timeMs: 90_000, hintsUsed: 1 }),
      daily(2, { tier: 2, size: 7, timeMs: 150_000 }),
      daily(3, { tier: 3, size: 8, timeMs: 300_000, hintsUsed: 2 }),
      daily(4, { tier: 4, size: 10, timeMs: 600_000, mode: 'archive', solvedOn: day(0) }),
      daily(6, { tier: 1, size: 6, timeMs: 45_000 }),
    ],
    [unlimited(7, 120_000), unlimited(7, 180_000, { hintsUsed: 1 }), unlimited(9, 400_000)],
    1,
  );

const group = (name: string) => screen.getByRole('region', { name });
const tile = (scope: HTMLElement, label: string) => within(scope).getByText(label, { selector: 'dt' }).closest('.stat-tile') as HTMLElement;

describe('écran des statistiques', () => {
  it('état vide : message d’accueil, ni série ni graphique', () => {
    renderStats(progress());
    expect(screen.getByRole('heading', { level: 1, name: 'Statistiques' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Pas encore de statistiques' })).toBeTruthy();
    expect(screen.getByText(/Résolvez votre premier puzzle/)).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.queryByRole('slider')).toBeNull();
    expect(screen.queryByRole('region', { name: 'Série en cours' })).toBeNull();
  });

  it('données non chargées : en-tête seul, sans état vide trompeur', async () => {
    render(
      <ProgressProvider>
        <StatsScreen visible />
      </ProgressProvider>,
    );
    expect(screen.getByRole('heading', { name: 'Statistiques' })).toBeTruthy();
    expect(screen.queryByText('Pas encore de statistiques')).toBeNull();
    expect(await screen.findByText('Pas encore de statistiques')).toBeTruthy(); // chargé : stockage vide
  });

  it('écran masqué : section cachée mais contenu rendu', () => {
    const { container } = renderStats(populated(), false);
    expect(container.querySelector('section.screen')?.hasAttribute('hidden')).toBe(true);
  });

  it('puzzles du jour : chiffres clés, pourcentages et temps formatés', () => {
    renderStats(populated());
    const dailyGroup = group('Puzzles du jour');
    expect(tile(dailyGroup, 'Résolus').textContent).toContain('6');
    // Moyenne : 1 245 s / 6 = 207,5 s ; meilleur : 45 s.
    expect(within(tile(dailyGroup, 'Temps moyen')).getByText(formatClock(207_500, 'fr'))).toBeTruthy();
    expect(tile(dailyGroup, 'Temps moyen').textContent).toContain(formatDuration(207_500, 'fr')); // lu en toutes lettres
    expect(within(tile(dailyGroup, 'Meilleur temps')).getByText('0:45')).toBeTruthy();
    // 5 résolus le jour même sur 6, 4 sans indice sur 6.
    const onTime = tile(dailyGroup, 'Le jour même');
    expect(onTime.textContent).toContain('5');
    expect(onTime.textContent).toContain(formatPercent(5 / 6, 'fr'));
    const noHint = tile(dailyGroup, 'Sans indice');
    expect(noHint.textContent).toContain('4');
    expect(noHint.textContent).toContain(formatPercent(4 / 6, 'fr'));
    expect(onTime.querySelector('.stat-tile__meter > span')?.getAttribute('style')).toContain('--v: 0.8333');
  });

  it('carte de série : série en cours, record, gels et rappel du jour', () => {
    const { container } = renderStats(populated());
    const hero = screen.getByRole('region', { name: 'Série en cours' });
    // Aujourd'hui, hier, avant-hier et il y a 3 jours résolus le jour même ; le puzzle d'archive ne compte pas.
    expect(within(hero).getByText('4', { selector: '.streak-card__count span' })).toBeTruthy();
    expect(within(hero).getByText('jours')).toBeTruthy();
    expect(within(hero).getByText(/Record/).textContent).toMatch(/^Record\s: 4$/);
    expect(within(hero).getByRole('img', { name: '1 sur 2' })).toBeTruthy();
    expect(container.querySelectorAll('.streak-card__slot').length).toBe(2);
    expect(container.querySelectorAll('.streak-card__slot[data-filled]').length).toBe(1);
    expect(within(hero).getByText(/tous les 7 jours de série \(2 au maximum\)/)).toBeTruthy();
    expect(within(hero).getByText(/Puzzle du jour résolu/)).toBeTruthy();
  });

  it('série menacée : rappel de résoudre le puzzle du jour avant minuit', () => {
    renderStats(progress([daily(1), daily(2)]));
    const hero = screen.getByRole('region', { name: 'Série en cours' });
    expect(within(hero).getByText(/Résolvez le puzzle du jour avant minuit/)).toBeTruthy();
    expect(within(hero).queryByText(/Puzzle du jour résolu/)).toBeNull();
    expect(within(hero).getByRole('img', { name: '0 sur 2' })).toBeTruthy();
  });

  it('graphique 1 : libellé accessible par difficulté, palier vide signalé', () => {
    const { container } = renderStats(progress([daily(0, { tier: 1, timeMs: 60_000 }), daily(1, { tier: 1, timeMs: 90_000 }), daily(2, { tier: 3, timeMs: 300_000 })]));
    const chart = screen.getByRole('img', { name: /^Temps moyen par difficulté\./ });
    const label = chart.getAttribute('aria-label')!;
    expect(label).toContain(`${formatDuration(75_000, 'fr')}, 2 puzzles`);
    expect(label).toContain(`${formatDuration(300_000, 'fr')}, 1 puzzle`);
    expect(label).toMatch(/Moyen\s: aucun puzzle/);
    expect(label).toMatch(/Expert\s: aucun puzzle/);
    const rows = container.querySelectorAll('.tier-chart__row');
    expect(rows.length).toBe(4);
    expect([...rows].map((r) => r.hasAttribute('data-empty'))).toEqual([false, true, false, true]);
    expect(within(rows[1] as HTMLElement).getByText('–')).toBeTruthy();
    expect(within(rows[1] as HTMLElement).getByText('Aucun puzzle')).toBeTruthy();
    expect(within(rows[0] as HTMLElement).getByText('1:15')).toBeTruthy();
    // La barre la plus longue (palier 3) occupe toute la largeur disponible.
    expect((rows[2] as HTMLElement).style.getPropertyValue('--v')).toBe('1');
    expect((rows[0] as HTMLElement).style.getPropertyValue('--v')).toBe('0.25');
  });

  it('graphique 2 : libellé accessible, archive hachurée, détail du puzzle choisi', () => {
    const { container } = renderStats(populated());
    const chart = screen.getByRole('img', { name: /^Temps de vos 6 derniers puzzles du jour/ });
    const label = chart.getAttribute('aria-label')!;
    expect(label).toContain(`du ${formatShortDate(day(6), 'fr')} au ${formatShortDate(day(0), 'fr')}`);
    expect(label).toContain(`de ${formatDuration(45_000, 'fr')} à ${formatDuration(600_000, 'fr')}`);
    expect(label).toContain(`le dernier en ${formatDuration(60_000, 'fr')}`);

    const bars = container.querySelectorAll('.recent-chart__bar');
    expect(bars.length).toBe(6);
    // Du plus ancien au plus récent ; l'archive (tier 4, il y a 4 jours) est la seule hachurée.
    expect([...bars].map((b) => b.getAttribute('data-tier'))).toEqual(['1', '4', '3', '2', '1', '1']);
    expect([...bars].map((b) => b.hasAttribute('data-archive'))).toEqual([false, true, false, false, false, false]);

    // Par défaut : le dernier puzzle ; le curseur change de puzzle et le détail suit.
    const slider = screen.getByRole('slider', { name: 'Choisir un puzzle' }) as HTMLInputElement;
    expect(slider.value).toBe('5');
    expect(slider.getAttribute('aria-valuetext')).toContain('Facile');
    fireEvent.change(slider, { target: { value: '1' } });
    expect(slider.getAttribute('aria-valuetext')).toBe(
      [formatShortDate(day(4), 'fr', true), formatDuration(600_000, 'fr'), 'Expert', i18n.t('unlimited.sizeValue', { n: 10 }), 'sans indice', 'en archive'].join(', '),
    );
    const readout = container.querySelector('.recent-chart__readout')!;
    expect(readout.textContent).toContain('10:00');
    expect(readout.textContent).toContain('en archive');
    expect(container.querySelector('.recent-chart__slot[data-selected]')).toBe(container.querySelectorAll('.recent-chart__slot')[1]);
    // Version texte complète pour les lecteurs d'écran.
    expect(container.querySelectorAll('ol.md-sr-only li').length).toBe(6);
  });

  it('graphique 2 : le nombre de temps suit les données, un seul résultat n’en fait pas un graphique', () => {
    renderStats(progress([daily(0)]));
    expect(screen.getByRole('img', { name: /^Temps moyen par difficulté/ })).toBeTruthy();
    expect(screen.queryByRole('slider')).toBeNull();
    expect(screen.getByText(/Résolvez au moins deux puzzles du jour/)).toBeTruthy();
    cleanup();
    renderStats(progress([daily(0), daily(2)]));
    expect(screen.getByRole('heading', { name: 'Vos 2 derniers temps' })).toBeTruthy();
  });

  it('une valeur aberrante est tronquée au lieu d’aplatir le graphique', () => {
    const results = Array.from({ length: 12 }, (_, i) => daily(i, { timeMs: 60_000 + i * 5_000 }));
    results[5] = daily(5, { timeMs: 5_400_000 });
    const { container } = renderStats(progress(results));
    const clipped = [...container.querySelectorAll('.recent-chart__bar')].filter((b) => b.hasAttribute('data-clipped'));
    expect(clipped.length).toBe(1);
    expect(screen.queryByText('1:30:00')).toBeNull();
    // La vraie valeur reste lisible : libellé, détail du puzzle choisi.
    expect(screen.getByRole('img', { name: /^Temps de vos 12 derniers puzzles/ }).getAttribute('aria-label')).toContain(formatDuration(5_400_000, 'fr'));
  });

  it('mode illimité : chiffres clés et tableau par taille', () => {
    renderStats(populated());
    const unlimitedGroup = group('Mode illimité');
    expect(tile(unlimitedGroup, 'Résolus').textContent).toContain('3');
    expect(within(tile(unlimitedGroup, 'Temps moyen')).getByText('3:53')).toBeTruthy(); // (120 + 180 + 400) / 3 = 233 s

    const table = within(unlimitedGroup).getByRole('table');
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Taille', 'Résolus', 'Temps moyen', 'Meilleur temps']);
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.length).toBe(2);
    expect(within(rows[0]!).getByRole('rowheader').textContent).toMatch(/^7\s×\s7$/);
    expect([...rows[0]!.querySelectorAll('td')].map((c) => c.textContent)).toEqual(['2', `2:30${formatDuration(150_000, 'fr')}`, `2:00${formatDuration(120_000, 'fr')}`]);
    expect(within(rows[1]!).getByRole('rowheader').textContent).toMatch(/^9\s×\s9$/);
    expect(within(rows[1]!).getAllByText('6:40').length).toBe(2); // moyenne et meilleur temps identiques
  });

  it('seulement le mode illimité : puzzles du jour vides, série à zéro', () => {
    renderStats(progress([], [unlimited(7, 120_000)]));
    expect(within(group('Puzzles du jour')).getByText(/Aucun puzzle du jour résolu pour l’instant/)).toBeTruthy();
    expect(screen.queryByRole('img', { name: /Temps moyen par difficulté/ })).toBeNull();
    const hero = screen.getByRole('region', { name: 'Série en cours' });
    expect(within(hero).getByText('0', { selector: '.streak-card__count span' })).toBeTruthy();
    expect(within(hero).getByText('jour')).toBeTruthy();
    expect(within(hero).queryByText(/Record/)).toBeNull();
    expect(within(hero).getByText(/Résolvez le puzzle du jour pour lancer une série/)).toBeTruthy();
    expect(tile(group('Mode illimité'), 'Résolus').textContent).toContain('1');
  });

  it('seulement les puzzles du jour : mode illimité vide', () => {
    renderStats(progress([daily(0), daily(1)]));
    expect(within(group('Mode illimité')).getByText(/Aucune partie illimitée résolue pour l’instant/)).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByRole('slider')).toBeTruthy();
  });

  it('anglais : textes, pourcentages et temps localisés', async () => {
    renderStats(populated());
    await act(() => setLanguage('en'));
    expect(screen.getByRole('heading', { level: 1, name: 'Statistics' })).toBeTruthy();
    const hero = screen.getByRole('region', { name: 'Current streak' });
    expect(within(hero).getByText('days')).toBeTruthy();
    expect(within(hero).getByText('Best: 4')).toBeTruthy();
    expect(within(hero).getByRole('img', { name: '1 of 2' })).toBeTruthy();
    expect(within(hero).getByText(/every 7 days of streak \(up to 2\)/)).toBeTruthy();

    const dailyGroup = group('Daily puzzles');
    expect(within(tile(dailyGroup, 'On the day')).getByText('83%')).toBeTruthy();
    expect(within(tile(dailyGroup, 'No hints')).getByText('67%')).toBeTruthy();
    expect(within(tile(dailyGroup, 'Average time')).getByText('3:27')).toBeTruthy();
    expect(screen.getByRole('img', { name: /^Average time by difficulty\. Easy: / })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Your last 6 times' })).toBeTruthy();
    expect(screen.getByRole('slider', { name: 'Pick a puzzle' }).getAttribute('aria-valuetext')).toContain(formatShortDate(day(0), 'en', true));
    expect(within(group('Unlimited mode')).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Size', 'Solved', 'Average time', 'Best time']);
  });
});
