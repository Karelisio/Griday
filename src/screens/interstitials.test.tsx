/**
 * Interstitiels : les écrans préviennent la monétisation (`notifySolved`) à la victoire, et seulement quand il le faut —
 * puzzle du jour compté pour la série (pas une archive rejouée) ou partie illimitée. La cadence elle-même
 * (un seul par puzzle du jour, une partie illimitée sur 3) est testée avec le fournisseur (MonetizationContext.test).
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDailyPuzzle } from '../../engine/index';
import type { ISODate } from '../../engine/core/date';
import { engine } from '../engine-client/client';
import { gameKind } from '../game/kinds';
import { newGameState, solvedGameState } from '../game/core/state';
import { serializeGame } from '../game/core/useGameSession';
import { initI18n } from '../i18n';
import { dailyProgressKey, dailyStartedKey, UNLIMITED_CURRENT_KEY, unlimitedProgressKey } from '../persistence';
import { loadJSON, saveJSON } from '../platform/storage';
import { ProgressProvider } from '../progress/ProgressContext';
import { DAILY_HISTORY_KEY } from '../progress/store';
import { EMPTY_STREAK } from '../progress/streak';
import { SettingsProvider } from '../settings/SettingsContext';
import { DEFAULT_SETTINGS } from '../settings/types';
import { ThemeProvider } from '../theme';
import { SnackbarHost } from '../ui';
import { installMatchMedia } from '../ui/testing';
import { ArchiveGamePage } from './ArchiveGamePage';
import { TodayScreen } from './TodayScreen';
import { UnlimitedScreen } from './UnlimitedScreen';

const notifySolved = vi.hoisted(() => vi.fn());
vi.mock('../monetization/MonetizationContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../monetization/MonetizationContext')>();
  // Hors fournisseur, la monétisation débloque tout : seule la notification est observée.
  return { ...actual, useMonetization: () => ({ ...actual.useMonetization(), notifySolved }) };
});

installMatchMedia();

const TODAY: ISODate = '2026-11-18';
beforeAll(async () => {
  await initI18n('fr');
});
beforeEach(() => {
  localStorage.clear();
  notifySolved.mockClear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 18, 12));
});
afterEach(() => vi.useRealTimers());

/** Partie du jour `date` déjà gagnée dans la sauvegarde, sans résultat enregistré : l'écran la rattrape à l'ouverture. */
async function saveSolvedGame(date: ISODate) {
  const daily = getDailyPuzzle(date);
  const kind = gameKind(daily.type)!;
  await saveJSON(dailyProgressKey(date), serializeGame(kind.rules, solvedGameState(kind.rules, daily.puzzle, 61_000, 1), 0));
}

function renderInProviders(ui: React.ReactNode) {
  return render(
    <SettingsProvider initial={{ ...DEFAULT_SETTINGS, language: 'fr' }}>
      <ProgressProvider initial={{ history: new Map(), unlimited: [], streak: EMPTY_STREAK }}>
        <ThemeProvider mode="light" dynamic={false}>
          <SnackbarHost closeLabel="Fermer">{ui}</SnackbarHost>
        </ThemeProvider>
      </ProgressProvider>
    </SettingsProvider>,
  );
}

/** Mode enregistré du résultat de `date` (0 : puzzle du jour, 1 : archive). */
const recordedMode = async (date: ISODate) => (await loadJSON<{ results: Record<string, unknown[]> }>(DAILY_HISTORY_KEY))?.results[date]?.[4];

describe('interstitiels : ce que les écrans signalent', () => {
  it('puzzle du jour résolu : signalé une fois, avec sa date', async () => {
    await saveSolvedGame(TODAY);
    renderInProviders(<TodayScreen visible playingDate={TODAY} onPlayingDateChange={() => {}} />);
    await waitFor(() => expect(notifySolved).toHaveBeenCalledTimes(1), { timeout: 15_000 });
    expect(notifySolved).toHaveBeenCalledWith({ mode: 'daily', date: TODAY });
    await waitFor(async () => expect(await recordedMode(TODAY)).toBe(0));
    expect(notifySolved).toHaveBeenCalledTimes(1);
  }, 60_000);

  it('archive rejouée un autre jour : enregistrée comme archive, aucun interstitiel', async () => {
    const date = '2026-11-14';
    await saveSolvedGame(date);
    renderInProviders(<ArchiveGamePage date={date} visible />);
    await waitFor(async () => expect(await recordedMode(date)).toBe(1), { timeout: 15_000 });
    expect(notifySolved).not.toHaveBeenCalled();
  }, 60_000);

  it('partie du jour commencée le jour même et finie le lendemain depuis les archives : compte comme puzzle du jour', async () => {
    const date = '2026-11-17';
    await saveSolvedGame(date);
    await saveJSON(dailyStartedKey(date), date);
    renderInProviders(<ArchiveGamePage date={date} visible />);
    await waitFor(() => expect(notifySolved).toHaveBeenCalledWith({ mode: 'daily', date }), { timeout: 15_000 });
    expect(await recordedMode(date)).toBe(0);
  }, 60_000);

  it('mode illimité : chaque partie résolue est signalée', async () => {
    // Partie en cours à une reine de la victoire (grille réellement générée, la plus petite taille proposée).
    const { sizes } = await engine.unlimitedOptions('queens', TODAY);
    const target = { size: sizes[0]!, tier: 1 as const };
    const token = 'interstitiel1';
    const generated = await engine.unlimited('queens', target, token, TODAY);
    const kind = gameKind('queens')!;
    const solution = kind.rules.solution(generated.puzzle);
    const missing = solution.findIndex((mark) => mark !== 0);
    const almost = { ...newGameState(kind.rules, generated.puzzle, null), marks: solution.map((mark, i) => (i === missing ? 0 : mark)), elapsedMs: 4_000 };
    await saveJSON(UNLIMITED_CURRENT_KEY, { token, target, puzzle: generated });
    await saveJSON(unlimitedProgressKey(token), serializeGame(kind.rules, almost, 0));

    renderInProviders(<UnlimitedScreen visible />);
    const grid = await screen.findByRole('grid', {}, { timeout: 15_000 });
    expect(notifySolved).not.toHaveBeenCalled(); // une partie rechargée n'est pas une victoire
    const n = target.size;
    grid.getBoundingClientRect = () => ({ left: 0, top: 0, width: 600, height: 600, right: 600, bottom: 600, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    const x = ((missing % n) + 0.5) * (600 / n);
    const y = (Math.floor(missing / n) + 0.5) * (600 / n);
    fireEvent.pointerDown(grid, { clientX: x, clientY: y, pointerId: 1, button: 0, isPrimary: true });
    fireEvent.pointerUp(grid, { clientX: x, clientY: y, pointerId: 1, button: 0, isPrimary: true });

    await waitFor(() => expect(notifySolved).toHaveBeenCalledTimes(1), { timeout: 5_000 });
    expect(notifySolved).toHaveBeenCalledWith({ mode: 'unlimited' });
  }, 60_000);
});
