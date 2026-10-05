import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { localISODate } from '../../engine/core/date';
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

function renderToday() {
  return render(
    <SettingsProvider initial={{ ...DEFAULT_SETTINGS, language: 'fr' }}>
      <ProgressProvider initial={{ history: new Map(), unlimited: [], streak: EMPTY_STREAK }}>
        <ThemeProvider mode="light" dynamic={false}>
          <SnackbarHost closeLabel="Fermer">
            <TodayScreen visible />
          </SnackbarHost>
        </ThemeProvider>
      </ProgressProvider>
    </SettingsProvider>,
  );
}

const bravo = () => screen.queryByRole('heading', { name: /^Bravo/ });

describe('puzzle du jour', () => {
  it('victoire : résultat enregistré comme puzzle du jour, série de 1, partage proposé', async () => {
    renderToday();
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

    const today = localISODate(new Date());
    await waitFor(async () => {
      const saved = await loadJSON<{ results: Record<string, unknown[]> }>(DAILY_HISTORY_KEY);
      expect(saved?.results[today]?.[4]).toBe(0); // mode « du jour »
    });
    expect(await loadJSON(STREAK_KEY)).toBeDefined();
  }, 90_000);
});
