import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseISODate, type ISODate } from '../../engine/core/date';
import { initI18n } from '../i18n';
import { loadJSON } from '../platform/storage';
import { ProgressProvider } from '../progress/ProgressContext';
import { DAILY_HISTORY_KEY, STREAK_KEY } from '../progress/store';
import { EMPTY_STREAK } from '../progress/streak';
import { SettingsProvider } from '../settings/SettingsContext';
import { DEFAULT_SETTINGS } from '../settings/types';
import { ThemeProvider } from '../theme';
import { SnackbarHost } from '../ui';
import { TodayScreen } from './TodayScreen';

beforeAll(async () => {
  await initI18n('fr');
});
beforeEach(() => localStorage.clear());
afterEach(() => vi.useRealTimers());

function renderToday(today: ISODate) {
  return render(
    <SettingsProvider initial={{ ...DEFAULT_SETTINGS, language: 'fr' }}>
      <ProgressProvider initial={{ history: new Map(), unlimited: [], streak: EMPTY_STREAK }}>
        <ThemeProvider mode="light" dynamic={false}>
          <SnackbarHost closeLabel="Fermer">
            <TodayScreen visible playingDate={today} onPlayingDateChange={() => undefined} />
          </SnackbarHost>
        </ThemeProvider>
      </ProgressProvider>
    </SettingsProvider>,
  );
}

const bravo = () => screen.queryByRole('heading', { name: /^Bravo/ });

describe('puzzle du jour', () => {
  // Date figée (seule la date est simulée) : un jour de chaque type, les types alternant d'un jour à l'autre.
  it.each([
    ['2026-10-07', 'queens'],
    ['2026-10-06', 'binairo'],
  ] as const)('victoire le %s (%s) : résultat enregistré comme puzzle du jour, série de 1, partage proposé', async (today, type) => {
    const { y, m, d } = parseISODate(today);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(y, m - 1, d, 10));
    renderToday(today);
    await screen.findByRole('grid', {}, { timeout: 15_000 });
    // Résolution par les indices (« Jouer ce coup » joue toute la déduction).
    for (let guard = 0; guard < 200 && !bravo(); guard++) {
      const hint = screen.getByRole('button', { name: 'Indice' }) as HTMLButtonElement;
      await waitFor(() => expect(hint.disabled).toBe(false), { timeout: 5_000 });
      fireEvent.click(hint);
      const dialog = await screen.findByRole('dialog', { name: 'Indice' }, { timeout: 5_000 });
      await act(async () => {
        fireEvent.click(within(dialog).getByRole('button', { name: /Jouer ce coup|Corriger/ }));
      });
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Indice' })).toBeNull(), { timeout: 5_000 });
    }
    const card = (await screen.findByRole('heading', { name: /^Bravo/ }, { timeout: 5_000 })).closest('.victory-card') as HTMLElement;
    expect(within(card).getByText('Série : 1 jour')).toBeTruthy();
    expect(within(card).getByRole('button', { name: 'Partager' })).toBeTruthy();

    await waitFor(async () => {
      const saved = await loadJSON<{ results: Record<string, unknown[]> }>(DAILY_HISTORY_KEY);
      expect(saved?.results[today]?.[4]).toBe(0); // mode « du jour »
      expect(saved?.results[today]?.[6]).toBe(type);
    });
    expect(await loadJSON(STREAK_KEY)).toBeDefined();
  }, 90_000);
});
