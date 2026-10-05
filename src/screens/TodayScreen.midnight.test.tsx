import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { initI18n } from '../i18n';
import { ProgressProvider } from '../progress/ProgressContext';
import { EMPTY_STREAK } from '../progress/streak';
import type { DailyResult } from '../progress/types';
import { SettingsProvider } from '../settings/SettingsContext';
import { DEFAULT_SETTINGS } from '../settings/types';
import { ThemeProvider } from '../theme';
import { SnackbarHost } from '../ui';
import { TodayScreen } from './TodayScreen';

// Date du jour pilotée par le test (minuit simulé).
const clock = vi.hoisted(() => ({ today: '2026-10-06' }));
vi.mock('../useToday', async (orig) => ({ ...(await orig<typeof import('../useToday')>()), useToday: () => clock.today }));

beforeAll(async () => {
  await initI18n('fr');
});
afterEach(() => vi.useRealTimers());

const solved: DailyResult = { date: '2026-10-05', size: 6, tier: 1, timeMs: 60_000, hintsUsed: 0, mode: 'daily', solvedOn: '2026-10-05' };

function Shell() {
  const [playingDate, setPlayingDate] = useState(clock.today);
  return <TodayScreen visible playingDate={playingDate} onPlayingDateChange={setPlayingDate} />;
}

function app() {
  return (
    <SettingsProvider initial={{ ...DEFAULT_SETTINGS, language: 'fr' }}>
      <ProgressProvider initial={{ history: new Map([[solved.date, solved]]), unlimited: [], streak: EMPTY_STREAK }}>
        <ThemeProvider mode="light" dynamic={false}>
          <SnackbarHost closeLabel="Fermer">
            <Shell />
          </SnackbarHost>
        </ThemeProvider>
      </ProgressProvider>
    </SettingsProvider>
  );
}

describe('minuit pendant une partie', () => {
  it('la partie de la veille reste affichée, la série l’attend ; le nouveau puzzle est proposé', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 6, 23, 50));
    clock.today = '2026-10-06';
    const { rerender } = render(app());
    const grid = await screen.findByRole('grid', {}, { timeout: 15_000 });
    const rect = { left: 0, top: 0, width: 600, height: 600, right: 600, bottom: 600, x: 0, y: 0, toJSON: () => ({}) };
    grid.getBoundingClientRect = () => rect as DOMRect;
    await act(async () => {
      fireEvent.pointerDown(grid, { clientX: 10, clientY: 10, pointerId: 1, button: 0, isPrimary: true });
      fireEvent.pointerUp(grid, { clientX: 10, clientY: 10, pointerId: 1, button: 0, isPrimary: true });
    });
    await waitFor(() => expect(within(grid).getAllByRole('gridcell')[0]!.getAttribute('aria-label')).toMatch(/reine/));

    // Minuit passe.
    vi.setSystemTime(new Date(2026, 9, 7, 0, 5));
    clock.today = '2026-10-07';
    rerender(app());
    expect(await screen.findByText(/Finissez celui d’hier/)).toBeTruthy();
    expect(screen.getByText('mardi 6 octobre')).toBeTruthy();
    // La série (1 jour, le 5) n'est pas affichée comme perdue tant que la partie du 6 peut être finie.
    expect(await screen.findByText('Série : 1 jour')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Jouer le nouveau' }));
    expect(await screen.findByText('mercredi 7 octobre')).toBeTruthy();
    await waitFor(() => expect(screen.queryByText(/Finissez celui d’hier/)).toBeNull());
    expect(screen.queryByText('Série : 1 jour')).toBeNull();
  }, 60_000);
});
