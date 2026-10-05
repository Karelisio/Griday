/** Indices au-delà des indices gratuits : une vidéo par nouvel indice (le même, redemandé, reste gratuit). */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { queensDailyV1 } from '../../engine/queens/testing';
import { initI18n } from '../i18n';
import { setAdsServiceForTesting } from '../monetization/ads';
import { FREE_HINTS_PER_PUZZLE } from '../monetization/config';
import { MonetizationProvider } from '../monetization/MonetizationContext';
import { EMPTY_MONETIZATION, type MonetizationState } from '../monetization/state';
import { fakeAds } from '../monetization/testing';
import { SettingsProvider } from '../settings/SettingsContext';
import { DEFAULT_SETTINGS } from '../settings/types';
import { ThemeProvider } from '../theme';
import { SnackbarHost } from '../ui';
import { installMatchMedia } from '../ui/testing';
import { useGameSession } from './core/useGameSession';
import { GameView } from './GameView';
import { QUEENS_KIND } from './queens/kind';

installMatchMedia();

const puzzle = queensDailyV1('2026-10-05');
let hintsUsed = -1;

function Harness() {
  const session = useGameSession(QUEENS_KIND.rules, { puzzle, storageKey: 'test.game', visible: true });
  hintsUsed = session.game?.hintsUsed ?? -1;
  return session.game ? <GameView kind={QUEENS_KIND} puzzle={puzzle} session={session} visible /> : null;
}

function renderGame(initial: MonetizationState = EMPTY_MONETIZATION) {
  return render(
    <SettingsProvider initial={{ ...DEFAULT_SETTINGS, language: 'fr' }}>
      <ThemeProvider mode="light" dynamic={false}>
        <SnackbarHost closeLabel="Fermer">
          <MonetizationProvider initial={initial}>
            <Harness />
          </MonetizationProvider>
        </SnackbarHost>
      </ThemeProvider>
    </SettingsProvider>,
  );
}

beforeAll(async () => {
  await initI18n('fr');
});
beforeEach(() => localStorage.clear());
afterEach(() => setAdsServiceForTesting(null));

const T = { timeout: 5_000 };
const hintButton = () => screen.getByRole('button', { name: 'Indice' }) as HTMLButtonElement;
const hintSheet = () => screen.queryByRole('dialog', { name: 'Indice' });
const rewardDialog = () => screen.queryByRole('dialog', { name: 'Débloquer cet indice' });
/** État de toutes les cases (reines, croix) : ne doit pas bouger quand l'indice est refusé. */
const board = (grid: HTMLElement) => within(grid).getAllByRole('gridcell').map((cell) => cell.getAttribute('aria-label'));

/** Demande un indice puis le joue en entier : l'indice suivant sera une autre déduction, donc un nouvel indice. */
async function askAndPlay() {
  await waitFor(() => expect(hintButton().disabled).toBe(false), T);
  fireEvent.click(hintButton());
  const sheet = await screen.findByRole('dialog', { name: 'Indice' }, T);
  await act(async () => {
    fireEvent.click(within(sheet).getByRole('button', { name: /Jouer ce coup|Corriger/ }));
  });
  await waitFor(() => expect(hintSheet()).toBeNull(), T);
}

/** Ouvre le dialogue des vidéos en demandant un indice une fois les indices gratuits épuisés. */
async function reachPaidHint() {
  const grid = await screen.findByRole('grid', {}, { timeout: 15_000 });
  for (let i = 0; i < FREE_HINTS_PER_PUZZLE; i++) await askAndPlay();
  expect(hintsUsed).toBe(FREE_HINTS_PER_PUZZLE);
  await waitFor(() => expect(hintButton().disabled).toBe(false), T);
  return grid;
}

describe('indices et vidéos', () => {
  it('les indices offerts ne demandent rien ; le suivant ouvre le dialogue, sans rien afficher ni compter', async () => {
    const ads = fakeAds();
    setAdsServiceForTesting(ads);
    renderGame();
    const grid = await reachPaidHint();
    expect(rewardDialog()).toBeNull();
    expect(ads.showRewarded).not.toHaveBeenCalled();
    const before = board(grid);

    fireEvent.click(hintButton());
    const box = await screen.findByRole('dialog', { name: 'Débloquer cet indice' }, T);
    expect(within(box).getByText(new RegExp(`${FREE_HINTS_PER_PUZZLE} par grille`))).toBeTruthy();
    expect(hintSheet()).toBeNull();
    expect(hintsUsed).toBe(FREE_HINTS_PER_PUZZLE);

    // Refus : ni indice, ni vidéo, ni compteur, ni marque de plus ; le bouton redevient disponible.
    fireEvent.click(within(box).getByRole('button', { name: 'Annuler' }));
    await waitFor(() => expect(rewardDialog()).toBeNull(), T);
    await waitFor(() => expect(hintButton().disabled).toBe(false), T);
    expect(hintSheet()).toBeNull();
    expect(ads.showRewarded).not.toHaveBeenCalled();
    expect(hintsUsed).toBe(FREE_HINTS_PER_PUZZLE);
    expect(board(grid)).toEqual(before);
  }, 60_000);

  it('vidéo vue : l’indice s’affiche et compte ; le même indice redemandé reste gratuit, le suivant redemande une vidéo', async () => {
    const ads = fakeAds('rewarded');
    setAdsServiceForTesting(ads);
    renderGame();
    await reachPaidHint();

    fireEvent.click(hintButton());
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Débloquer cet indice' }, T)).getByRole('button', { name: 'Regarder' }));
    const sheet = await screen.findByRole('dialog', { name: 'Indice' }, T);
    expect(ads.showRewarded).toHaveBeenCalledTimes(1);
    expect(hintsUsed).toBe(FREE_HINTS_PER_PUZZLE + 1);

    // Le même indice, redemandé sans jouer : gratuit et non recompté.
    fireEvent.click(within(sheet).getAllByRole('button', { name: 'Fermer' }).at(-1)!);
    await waitFor(() => expect(hintSheet()).toBeNull(), T);
    await waitFor(() => expect(hintButton().disabled).toBe(false), T);
    fireEvent.click(hintButton());
    await screen.findByRole('dialog', { name: 'Indice' }, T);
    expect(rewardDialog()).toBeNull();
    expect(ads.showRewarded).toHaveBeenCalledTimes(1);
    expect(hintsUsed).toBe(FREE_HINTS_PER_PUZZLE + 1);

    // Indice joué, nouvelle déduction : nouvelle vidéo.
    await act(async () => {
      fireEvent.click(within(screen.getByRole('dialog', { name: 'Indice' })).getByRole('button', { name: /Jouer ce coup|Corriger/ }));
    });
    await waitFor(() => expect(hintSheet()).toBeNull(), T);
    await waitFor(() => expect(hintButton().disabled).toBe(false), T);
    fireEvent.click(hintButton());
    await screen.findByRole('dialog', { name: 'Débloquer cet indice' }, T);
    expect(hintSheet()).toBeNull();
    expect(hintsUsed).toBe(FREE_HINTS_PER_PUZZLE + 1);
  }, 90_000);

  it('vidéo interrompue ou indisponible : pas d’indice, pas de compteur, et un message', async () => {
    const ads = fakeAds('dismissed');
    setAdsServiceForTesting(ads);
    renderGame();
    const grid = await reachPaidHint();
    const before = board(grid);

    fireEvent.click(hintButton());
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Débloquer cet indice' }, T)).getByRole('button', { name: 'Regarder' }));
    expect(await screen.findByText(/Vidéo interrompue/, {}, T)).toBeTruthy();
    await waitFor(() => expect(rewardDialog()).toBeNull(), T);
    expect(hintSheet()).toBeNull();
    expect(hintsUsed).toBe(FREE_HINTS_PER_PUZZLE);
    expect(board(grid)).toEqual(before);

    ads.showRewarded.mockResolvedValueOnce('unavailable');
    await waitFor(() => expect(hintButton().disabled).toBe(false), T);
    fireEvent.click(hintButton());
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Débloquer cet indice' }, T)).getByRole('button', { name: 'Regarder' }));
    expect(await screen.findByText(/Aucune vidéo disponible/, {}, T)).toBeTruthy();
    expect(hintSheet()).toBeNull();
    expect(hintsUsed).toBe(FREE_HINTS_PER_PUZZLE);
  }, 90_000);

  it('Premium : indices illimités, jamais de vidéo', async () => {
    const ads = fakeAds();
    setAdsServiceForTesting(ads);
    renderGame({ ...EMPTY_MONETIZATION, premium: true });
    await screen.findByRole('grid', {}, { timeout: 15_000 });
    for (let i = 0; i < FREE_HINTS_PER_PUZZLE + 2; i++) await askAndPlay();
    expect(hintsUsed).toBe(FREE_HINTS_PER_PUZZLE + 2);
    expect(rewardDialog()).toBeNull();
    expect(ads.showRewarded).not.toHaveBeenCalled();
  }, 90_000);
});
