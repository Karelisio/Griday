import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { initI18n } from '../i18n';
import { dailyStartedKey } from '../persistence';
import { loadJSON, saveJSON } from '../platform/storage';
import { ProgressProvider } from '../progress/ProgressContext';
import { DAILY_HISTORY_KEY } from '../progress/store';
import { EMPTY_STREAK } from '../progress/streak';
import { SettingsProvider } from '../settings/SettingsContext';
import { DEFAULT_SETTINGS } from '../settings/types';
import { ThemeProvider } from '../theme';
import { SnackbarHost } from '../ui';
import { ArchiveGamePage } from './ArchiveGamePage';

beforeAll(async () => {
  await initI18n('fr');
});
// Le 7 octobre 2026 ; seule la date est simulée (le moteur et les minuteries restent réels).
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 7, 10));
  localStorage.clear();
});
afterEach(() => vi.useRealTimers());

const DATE = '2026-10-06';

async function solveByHints() {
  render(
    <SettingsProvider initial={{ ...DEFAULT_SETTINGS, language: 'fr' }}>
      <ProgressProvider initial={{ history: new Map(), unlimited: [], streak: EMPTY_STREAK }}>
        <ThemeProvider mode="light" dynamic={false}>
          <SnackbarHost closeLabel="Fermer">
            <ArchiveGamePage date={DATE} visible />
          </SnackbarHost>
        </ThemeProvider>
      </ProgressProvider>
    </SettingsProvider>,
  );
  expect(await screen.findByRole('heading', { name: 'Puzzle n° 2' }, { timeout: 15_000 })).toBeTruthy();
  await screen.findByRole('grid', {}, { timeout: 15_000 });
  for (let guard = 0; guard < 200 && !screen.queryByRole('heading', { name: /^Bravo/ }); guard++) {
    const hint = screen.getByRole('button', { name: 'Indice' }) as HTMLButtonElement;
    await waitFor(() => expect(hint.disabled).toBe(false), { timeout: 5_000 });
    fireEvent.click(hint);
    const dialog = await screen.findByRole('dialog', { name: 'Indice' }, { timeout: 5_000 });
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: /Jouer ce coup|Corriger/ }));
    });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Indice' })).toBeNull(), { timeout: 5_000 });
  }
  await screen.findByRole('heading', { name: /^Bravo/ }, { timeout: 5_000 });
  return async () => (await loadJSON<{ results: Record<string, unknown[]> }>(DAILY_HISTORY_KEY))?.results[DATE];
}

describe('puzzle d’archive', () => {
  it('commencé et fini un autre jour : résultat « plus tard », hors série, signalé sur la carte', async () => {
    const saved = await solveByHints();
    await waitFor(async () => expect((await saved())?.[4]).toBe(1));
    expect(await loadJSON(dailyStartedKey(DATE))).toBe('2026-10-07');
    expect(screen.getByText(/il ne compte pas pour la série/)).toBeTruthy();
  }, 90_000);

  it('commencé le jour même (partie en cours à minuit) et fini le lendemain : compte pour la série', async () => {
    await saveJSON(dailyStartedKey(DATE), DATE);
    const saved = await solveByHints();
    await waitFor(async () => expect((await saved())?.[4]).toBe(0));
  }, 90_000);
});
