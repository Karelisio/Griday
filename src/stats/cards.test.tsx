import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { initI18n, setLanguage } from '../i18n';
import { formatClock, formatDuration } from '../i18n/format';
import type { StreakSummary } from '../progress/types';
import { StatTile } from './StatTile';
import { StreakCard } from './StreakCard';
import { TimeValue } from './TimeValue';

beforeAll(async () => {
  await initI18n('fr');
});
afterEach(async () => {
  await setLanguage('fr');
});

const NBSP = ' ';

const summary = (over: Partial<StreakSummary> = {}): StreakSummary => ({ current: 12, best: 21, freezes: 2, todaySolved: false, atRisk: true, ...over });

describe('carte de série', () => {
  it('chiffre héros, unité accordée et record', () => {
    const { container, rerender } = render(<StreakCard summary={summary()} />);
    const count = container.querySelector('.streak-card__count')!;
    expect(count.textContent).toBe('12jours');
    expect(screen.getByText(/^Record/).textContent).toMatch(/^Record\s: 21$/);

    rerender(<StreakCard summary={summary({ current: 1, best: 1 })} />);
    expect(container.querySelector('.streak-card__count')!.textContent).toBe('1jour');
    rerender(<StreakCard summary={summary({ current: 0, best: 0 })} />);
    expect(container.querySelector('.streak-card__count')!.textContent).toBe('0jour');
    expect(screen.queryByText(/^Record/)).toBeNull(); // pas de record à afficher
  });

  it('gels : emplacements pleins puis vides, nommés « Gels disponibles : n sur max »', () => {
    const { container, rerender } = render(<StreakCard summary={summary({ freezes: 2 })} />);
    const filled = () => container.querySelectorAll('.streak-card__slot[data-filled]').length;
    const slots = (n: number) => screen.getByRole('img', { name: `Gels disponibles${NBSP}: ${n} sur 2` });
    expect(slots(2)).toBeTruthy();
    expect(filled()).toBe(2);
    rerender(<StreakCard summary={summary({ freezes: 1 })} />);
    expect(slots(1)).toBeTruthy();
    expect(filled()).toBe(1);
    rerender(<StreakCard summary={summary({ freezes: 0 })} />);
    expect(slots(0)).toBeTruthy();
    expect(filled()).toBe(0);
    expect(container.querySelectorAll('.streak-card__slot').length).toBe(2);
  });

  it('anglais : record et gels nommés en toutes lettres', async () => {
    await setLanguage('en');
    render(<StreakCard summary={summary({ freezes: 1 })} />);
    expect(screen.getByText('Best streak: 21')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Streak freezes available: 1 of 2' })).toBeTruthy();
  });

  it('une seule phrase d’état : menace, jour résolu ou série à lancer', () => {
    const status = () => document.querySelector('.streak-card__status')?.getAttribute('data-status');
    const { rerender } = render(<StreakCard summary={summary({ atRisk: true })} />);
    expect(status()).toBe('atRisk');
    expect(screen.getByText(/avant minuit/)).toBeTruthy();
    rerender(<StreakCard summary={summary({ todaySolved: true, atRisk: false })} />);
    expect(status()).toBe('done');
    rerender(<StreakCard summary={summary({ current: 0, best: 3, atRisk: false })} />);
    expect(status()).toBe('start');
    expect(document.querySelectorAll('.streak-card__status').length).toBe(1);
  });

  it('la région porte le titre de la série', () => {
    render(<StreakCard summary={summary()} />);
    expect(screen.getByRole('region', { name: 'Série en cours' })).toBeTruthy();
  });
});

describe('tuile de chiffre clé', () => {
  it('libellé = terme, valeur = définition ; détail et jauge facultatifs', () => {
    const { container, rerender } = render(
      <dl>
        <StatTile label="Résolus" value="42" />
      </dl>,
    );
    expect(screen.getByRole('term').textContent).toBe('Résolus');
    expect(screen.getByRole('definition').textContent).toBe('42');
    expect(container.querySelector('.stat-tile__meter')).toBeNull();
    rerender(
      <dl>
        <StatTile label="Sans indice" value="30" detail="71 %" meter={0.71} />
      </dl>,
    );
    expect(screen.getByRole('definition').textContent).toBe('3071 %');
    const meter = container.querySelector('.stat-tile__meter')!;
    expect(meter.getAttribute('aria-hidden')).toBe('true'); // décorative : le détail porte le chiffre
    expect((meter.firstElementChild as HTMLElement).style.getPropertyValue('--v')).toBe('0.71');
  });
});

describe('valeur de temps', () => {
  it('affichée comme un chronomètre, lue en toutes lettres', () => {
    const { container } = render(<TimeValue ms={185_000} lang="fr" />);
    const [visible, spoken] = [...container.querySelectorAll('span')];
    expect(visible!.textContent).toBe(formatClock(185_000, 'fr'));
    expect(visible!.getAttribute('aria-hidden')).toBe('true');
    expect(spoken!.textContent).toBe(formatDuration(185_000, 'fr'));
    expect(spoken!.className).toContain('md-sr-only');
    expect(within(container).getByText('3:05')).toBeTruthy();
  });
});
