import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { engine } from '../engine-client/client';
import { initI18n } from '../i18n';
import { UNLIMITED_CURRENT_KEY, UNLIMITED_PREFS_KEY } from '../persistence';
import { loadJSON, saveJSON } from '../platform/storage';
import { ProgressProvider } from '../progress/ProgressContext';
import { UNLIMITED_HISTORY_KEY } from '../progress/store';
import { EMPTY_STREAK } from '../progress/streak';
import { SettingsProvider } from '../settings/SettingsContext';
import { DEFAULT_SETTINGS } from '../settings/types';
import { ThemeProvider } from '../theme';
import { SnackbarHost } from '../ui';
import { UnlimitedScreen } from './UnlimitedScreen';

const TODAY = '2026-11-18';

beforeAll(async () => {
  await initI18n('fr');
});
// Seule la date est simulée (le moteur et les minuteries restent réels).
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 18, 10));
  localStorage.clear();
});
afterEach(() => vi.useRealTimers());

function renderScreen() {
  return render(
    <SettingsProvider initial={{ ...DEFAULT_SETTINGS, language: 'fr' }}>
      <ProgressProvider initial={{ history: new Map(), unlimited: [], streak: EMPTY_STREAK }}>
        <ThemeProvider mode="light" dynamic={false}>
          <SnackbarHost closeLabel="Fermer">
            <UnlimitedScreen visible />
          </SnackbarHost>
        </ThemeProvider>
      </ProgressProvider>
    </SettingsProvider>,
  );
}

const group = (name: string) => screen.getByRole('radiogroup', { name });
const options = (name: string) => within(group(name)).getAllByRole('radio').map((r) => r.textContent?.trim());
const checked = (name: string) =>
  within(group(name))
    .getAllByRole('radio')
    .find((r) => r.getAttribute('aria-checked') === 'true')
    ?.textContent?.trim();

describe('mode illimité : plusieurs types', () => {
  it('choix du puzzle : tailles propres à chaque type, taille la plus proche gardée, préférence enregistrée', async () => {
    renderScreen();
    await screen.findByRole('radiogroup', { name: 'Puzzle' }, { timeout: 15_000 });
    expect(options('Puzzle')).toEqual(['Reines', 'Binairo']);
    expect(checked('Puzzle')).toBe('Reines');
    expect(options('Taille')).toEqual(['6', '7', '8', '9', '10']);
    expect(checked('Taille')).toBe('7');

    fireEvent.click(within(group('Puzzle')).getByRole('radio', { name: 'Binairo' }));
    expect(options('Taille')).toEqual(['6', '8', '10', '12']);
    expect(checked('Taille')).toBe('6'); // 7 n'existe pas en Binairo : la plus proche
    await waitFor(async () => expect(await loadJSON(UNLIMITED_PREFS_KEY)).toEqual({ type: 'binairo', size: 6, tier: 2 }));
  }, 30_000);

  it('préférences d’une version précédente (sans type) : Reines, taille et difficulté reprises', async () => {
    await saveJSON(UNLIMITED_PREFS_KEY, { size: 9, tier: 3 });
    renderScreen();
    await screen.findByRole('radiogroup', { name: 'Puzzle' }, { timeout: 15_000 });
    expect(checked('Puzzle')).toBe('Reines');
    expect(checked('Taille')).toBe('9');
    expect(checked('Difficulté')).toBe('Difficile');
  }, 30_000);

  it('partie Reines sauvegardée : reprise telle quelle, sous son type', async () => {
    const target = { size: 6, tier: 1 as const };
    const puzzle = await engine.unlimited('queens', target, 'reprise1', TODAY);
    await saveJSON(UNLIMITED_CURRENT_KEY, { token: 'reprise1', target, puzzle });
    await saveJSON(UNLIMITED_PREFS_KEY, { type: 'binairo', size: 8, tier: 2 });
    renderScreen();
    const grid = await screen.findByRole('grid', {}, { timeout: 15_000 });
    expect(within(grid).getAllByRole('gridcell')).toHaveLength(36);
    expect(screen.getByText('Reines', { selector: '.screen__chips *' })).toBeTruthy();
  }, 30_000);

  it('nouvelle grille Binairo résolue : résultat enregistré avec son type', async () => {
    renderScreen();
    await screen.findByRole('radiogroup', { name: 'Puzzle' }, { timeout: 15_000 });
    fireEvent.click(within(group('Puzzle')).getByRole('radio', { name: 'Binairo' }));
    fireEvent.click(within(group('Difficulté')).getByRole('radio', { name: 'Facile' }));
    fireEvent.click(screen.getByRole('button', { name: 'Nouvelle grille' }));
    const grid = await screen.findByRole('grid', {}, { timeout: 15_000 });
    expect(within(grid).getAllByRole('gridcell')).toHaveLength(36);
    expect(screen.getByText('Binairo', { selector: '.screen__chips *' })).toBeTruthy();

    // Résolution par les indices (« Jouer ce coup » joue toute la déduction).
    for (let guard = 0; guard < 100 && !screen.queryByRole('heading', { name: /^Bravo/ }); guard++) {
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
    await waitFor(async () => {
      const saved = await loadJSON<{ results: unknown[][] }>(UNLIMITED_HISTORY_KEY);
      expect(saved?.results.at(-1)?.slice(0, 2)).toEqual([6, 1]);
      expect(saved?.results.at(-1)?.[5]).toBe('binairo');
    });
  }, 90_000);
});
