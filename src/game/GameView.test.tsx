import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getDailyPuzzle } from '../../engine/index';
import type { QueensSolvedPuzzle } from '../../engine/queens/types';
import { initI18n } from '../i18n';
import { SettingsProvider } from '../settings/SettingsContext';
import { DEFAULT_SETTINGS } from '../settings/types';
import { ThemeProvider } from '../theme';
import { SnackbarHost } from '../ui';
import { GameView } from './GameView';
import { useQueensGame } from './queens/useQueensGame';

const puzzle = getDailyPuzzle('2026-10-05').puzzle;
let hintsUsed = -1;

function Harness({ p }: { p: QueensSolvedPuzzle }) {
  const api = useQueensGame({ puzzle: p, storageKey: 'test.game', visible: true, autoCross: false });
  hintsUsed = api.game?.hintsUsed ?? -1;
  return api.game ? <GameView puzzle={p} api={api} visible /> : null;
}

function renderGame() {
  return render(
    <SettingsProvider initial={{ ...DEFAULT_SETTINGS, language: 'fr' }}>
      <ThemeProvider mode="light" dynamic={false}>
        <SnackbarHost closeLabel="Fermer">
          <Harness p={puzzle} />
        </SnackbarHost>
      </ThemeProvider>
    </SettingsProvider>,
  );
}

const hintButton = () => screen.getByRole('button', { name: 'Indice' });

beforeAll(async () => {
  await initI18n('fr');
});
beforeEach(() => localStorage.clear());

describe('vue de jeu', () => {
  it('indice : feuille ouverte (bouton désactivé), compté une fois, joué en entier ; victoire et retour au résultat', async () => {
    renderGame();
    const grid = await screen.findByRole('grid', {}, { timeout: 15_000 });
    const filled = () => within(grid).getAllByRole('gridcell').filter((c) => /reine|croix/.test(c.getAttribute('aria-label') ?? '')).length;

    // Même indice redemandé sans jouer : compté une seule fois.
    fireEvent.click(hintButton());
    const sheet = await screen.findByRole('dialog', { name: 'Indice' }, { timeout: 5_000 });
    expect((hintButton() as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(sheet).getAllByRole('button', { name: 'Fermer' }).at(-1)!);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Indice' })).toBeNull(), { timeout: 5_000 });
    fireEvent.click(hintButton());
    await screen.findByRole('dialog', { name: 'Indice' }, { timeout: 5_000 });
    expect(hintsUsed).toBe(1);

    // « Jouer ce coup » joue toute la déduction ; en boucle, la grille se résout.
    for (let guard = 0; guard < 4 * puzzle.size * puzzle.size; guard++) {
      if (screen.queryByRole('heading', { name: /^Bravo/ })) break;
      if (!screen.queryByRole('dialog', { name: 'Indice' })) {
        await waitFor(() => expect((hintButton() as HTMLButtonElement).disabled).toBe(false), { timeout: 5_000 });
        fireEvent.click(hintButton());
      }
      const dialog = await screen.findByRole('dialog', { name: 'Indice' }, { timeout: 5_000 });
      const before = filled();
      await act(async () => {
        fireEvent.click(within(dialog).getByRole('button', { name: 'Jouer ce coup' }));
      });
      await waitFor(() => expect(filled() > before || screen.queryByRole('heading', { name: /^Bravo/ })).toBeTruthy(), { timeout: 5_000 });
      // Feuille refermée (fin de l'animation de sortie) avant l'indice suivant.
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Indice' })).toBeNull(), { timeout: 5_000 });
    }
    const title = await screen.findByRole('heading', { name: /^Bravo/ }, { timeout: 5_000 });
    await waitFor(() => expect(document.activeElement).toBe(title), { timeout: 5_000 });
    expect(hintsUsed).toBeGreaterThan(1);

    // « Voir la grille » masque la carte ; « Voir le résultat » la ramène.
    fireEvent.click(screen.getByRole('button', { name: 'Voir la grille' }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: /^Bravo/ })).toBeNull(), { timeout: 5_000 });
    fireEvent.click(screen.getByRole('button', { name: 'Voir le résultat' }));
    expect(await screen.findByRole('heading', { name: /^Bravo/ }, { timeout: 5_000 })).toBeTruthy();
  }, 60_000);
});
