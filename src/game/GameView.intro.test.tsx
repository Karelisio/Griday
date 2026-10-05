import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { queensDailyV1 } from '../../engine/queens/testing';
import { initI18n } from '../i18n';
import { loadJSON } from '../platform/storage';
import { SettingsProvider } from '../settings/SettingsContext';
import { DEFAULT_SETTINGS } from '../settings/types';
import { ThemeProvider } from '../theme';
import { SnackbarHost } from '../ui';
import { useGameSession } from './core/useGameSession';
import { GameView } from './GameView';
import { QUEENS_KIND } from './queens/kind';
import { RULES_SEEN_KEY } from './useRulesIntro';

const puzzle = queensDailyV1('2026-10-05');

function Harness() {
  const session = useGameSession(QUEENS_KIND.rules, { puzzle, storageKey: 'test.intro', visible: true });
  return session.game ? <GameView kind={QUEENS_KIND} puzzle={puzzle} session={session} visible /> : null;
}

function renderGame() {
  return render(
    <SettingsProvider initial={{ ...DEFAULT_SETTINGS, language: 'fr' }}>
      <ThemeProvider mode="light" dynamic={false}>
        <SnackbarHost closeLabel="Fermer">
          <Harness />
        </SnackbarHost>
      </ThemeProvider>
    </SettingsProvider>,
  );
}

const intro = () => screen.queryByRole('region', { name: 'Première partie de Reines' });

beforeAll(async () => {
  await initI18n('fr');
});
beforeEach(() => localStorage.clear());

describe('première partie d’un type', () => {
  it('règles affichées dans la page, sans bloquer le jeu ; « Compris » les range pour de bon', async () => {
    renderGame();
    const card = await screen.findByRole('region', { name: 'Première partie de Reines' }, { timeout: 15_000 });
    expect(within(card).getByText(/Placez une reine par ligne/)).toBeTruthy();
    expect(within(card).getByText(/Touchez une case pour poser une reine/)).toBeTruthy();
    // Le plateau reste jouable (pas de dialogue modal), le chronomètre attend (temps de lecture non compté).
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('grid')).toBeTruthy();
    const timer = () => screen.getByRole('timer').textContent;
    const before = timer();
    await new Promise((r) => setTimeout(r, 1300));
    expect(timer()).toBe(before);

    fireEvent.click(within(card).getByRole('button', { name: 'Compris' }));
    await waitFor(() => expect(intro()).toBeNull());
    await waitFor(async () => expect(await loadJSON(RULES_SEEN_KEY)).toEqual(['queens']));

    // Nouvelle partie du même type : plus de carte.
    cleanup();
    renderGame();
    await screen.findByRole('grid', {}, { timeout: 15_000 });
    await new Promise((r) => setTimeout(r, 50));
    expect(intro()).toBeNull();
  }, 30_000);

  it('ouvrir le dialogue des règles vaut lecture', async () => {
    renderGame();
    await screen.findByRole('region', { name: 'Première partie de Reines' }, { timeout: 15_000 });
    fireEvent.click(screen.getByRole('button', { name: 'Règles' }));
    expect(await screen.findByRole('dialog', { name: 'Reines' })).toBeTruthy();
    await waitFor(() => expect(intro()).toBeNull());
    await waitFor(async () => expect(await loadJSON(RULES_SEEN_KEY)).toEqual(['queens']));
  }, 30_000);
});
