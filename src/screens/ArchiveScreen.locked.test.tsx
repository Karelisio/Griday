/** Archives verrouillées : les jours de plus de 7 jours demandent une vidéo (ou Premium) pour s'ouvrir. */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ISODate } from '../../engine/core/date';
import { initI18n, setLanguage } from '../i18n';
import { setAdsServiceForTesting } from '../monetization/ads';
import { FREE_ARCHIVE_DAYS } from '../monetization/config';
import { MonetizationProvider } from '../monetization/MonetizationContext';
import { EMPTY_MONETIZATION, MONETIZATION_KEY, type MonetizationState } from '../monetization/state';
import { fakeAds } from '../monetization/testing';
import { dailyProgressKey } from '../persistence';
import { loadJSON, saveJSON } from '../platform/storage';
import { ProgressProvider } from '../progress/ProgressContext';
import type { ProgressData } from '../progress/store';
import { EMPTY_STREAK } from '../progress/streak';
import type { DailyResult } from '../progress/types';
import { SnackbarHost } from '../ui';
import { installMatchMedia } from '../ui/testing';
import { ArchiveScreen } from './ArchiveScreen';

installMatchMedia();
const NBSP = '\u00a0';

beforeAll(async () => {
  await initI18n('fr');
});
// Mercredi 18 novembre 2026 (seule la date est simulée) : les 7 derniers jours, du 11 au 18, sont libres.
beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 18, 12));
});
afterEach(async () => {
  vi.useRealTimers();
  setAdsServiceForTesting(null);
  await setLanguage('fr');
});

const result = (date: ISODate): DailyResult => ({ date, size: 7, tier: 2, timeMs: 61_000, hintsUsed: 0, mode: 'daily', solvedOn: date });

/** Jour résolu à temps (le 3 novembre), un autre gelé (le 4), le 5 octobre résolu : le reste n'a pas été joué. */
const progress = (): ProgressData => ({
  history: new Map([
    ['2026-11-03', result('2026-11-03')],
    ['2026-10-05', result('2026-10-05')],
  ]),
  unlimited: [],
  streak: { ...EMPTY_STREAK, frozen: ['2026-11-04'], settledThrough: '2026-11-17' },
});

/** Rendu, puis attente des verrous : ils n'apparaissent qu'une fois les parties entamées du mois relues. */
async function renderScreen({ onOpen = () => {}, monetization = EMPTY_MONETIZATION }: { onOpen?: (date: ISODate) => void; monetization?: MonetizationState } = {}) {
  const view = render(
    <SnackbarHost closeLabel="Fermer">
      <ProgressProvider initial={progress()}>
        <MonetizationProvider initial={monetization}>
          <ArchiveScreen visible onOpen={onOpen} />
        </MonetizationProvider>
      </ProgressProvider>
    </SnackbarHost>,
  );
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  return view;
}

const day = (date: ISODate) => document.querySelector<HTMLButtonElement>(`button[data-date="${date}"]`)!;
const label = (date: ISODate) => day(date).getAttribute('aria-label');
const lockedDays = () => [...document.querySelectorAll<HTMLElement>('button[data-status="locked"]')].map((b) => b.dataset['date']);
const rewardDialog = () => screen.findByRole('dialog', { name: 'Débloquer ce puzzle' });
const legend = () => [...document.querySelectorAll<HTMLElement>('.archive-cal__legend li')];

describe('archives verrouillées', () => {
  it(`les ${FREE_ARCHIVE_DAYS} derniers jours sont libres ; les plus anciens non joués sont verrouillés (cadenas et statut)`, async () => {
    await saveJSON(dailyProgressKey('2026-11-05'), { marks: '0200000', past: ['0000000'] }); // partie entamée
    await renderScreen();

    expect(label('2026-11-18')).toBe(`mercredi 18 novembre 2026 (aujourd’hui), Reines${NBSP}: non joué`);
    expect(label('2026-11-11')).toBe(`mercredi 11 novembre 2026, Binairo${NBSP}: non joué`); // 7 jours : encore libre
    expect(label('2026-11-10')).toBe(`mardi 10 novembre 2026, Reines${NBSP}: verrouillé`); // 8 jours : verrouillé
    expect(label('2026-11-09')).toBe(`lundi 9 novembre 2026, Binairo${NBSP}: verrouillé`);
    expect(day('2026-11-10').dataset['status']).toBe('locked');
    expect(day('2026-11-10').querySelector('.archive-day__badge svg')).not.toBeNull(); // cadenas
    expect(day('2026-11-10').disabled).toBe(false);
    expect(day('2026-11-11').querySelector('.archive-day__badge')).toBeNull();
    // L'action de déblocage est lue avec chaque jour verrouillé, et seulement avec eux.
    const hint = document.getElementById(day('2026-11-10').getAttribute('aria-describedby')!)!;
    expect(hint.textContent).toBe('Touchez pour débloquer ce puzzle avec une courte vidéo');
    expect(day('2026-11-09').getAttribute('aria-describedby')).toBe(hint.id);
    expect(day('2026-11-11').hasAttribute('aria-describedby')).toBe(false);

    // Jamais verrouillés : résolu, entamé (lu du stockage), et le futur reste désactivé.
    expect(label('2026-11-03')).toBe(`mardi 3 novembre 2026, Binairo${NBSP}: résolu à temps`);
    expect(await screen.findByRole('button', { name: /^jeudi 5 novembre 2026, Binairo\s: en cours$/ })).toBeTruthy();
    expect(lockedDays()).toEqual(['2026-11-01', '2026-11-02', '2026-11-04', '2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09', '2026-11-10']);
    expect(day('2026-11-19').disabled).toBe(true);
  });

  it('un jour gelé mais jamais joué est verrouillé comme les autres (le cadenas prend le pas)', async () => {
    await renderScreen();
    expect(label('2026-11-04')).toBe(`mercredi 4 novembre 2026, Reines${NBSP}: verrouillé`);
  });

  it('légende et explication : « verrouillé » n’apparaît que si le mois affiché compte un jour verrouillé', async () => {
    await renderScreen();
    expect(legend().map((item) => item.textContent)).toEqual(['résolu à temps', 'résolu plus tard', 'gel de série utilisé', 'en cours', 'verrouillé']);
    expect(legend().at(-1)!.querySelector('svg')).not.toBeNull();
    expect(screen.getByText(`Les ${FREE_ARCHIVE_DAYS} derniers jours sont libres. Pour un puzzle plus ancien, une courte vidéo le débloque pour de bon. Premium ouvre toutes les archives.`)).toBeTruthy();
  });

  it('un jour libre s’ouvre tout de suite, sans vidéo', async () => {
    const onOpen = vi.fn();
    const ads = fakeAds();
    setAdsServiceForTesting(ads);
    await renderScreen({ onOpen });
    fireEvent.click(day('2026-11-11'));
    fireEvent.click(day('2026-11-18'));
    fireEvent.click(day('2026-11-03')); // résolu
    expect(onOpen.mock.calls).toEqual([['2026-11-11'], ['2026-11-18'], ['2026-11-03']]);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(ads.showRewarded).not.toHaveBeenCalled();
  });

  it('toucher un jour verrouillé : la vidéo le débloque pour de bon, puis il s’ouvre', async () => {
    const onOpen = vi.fn();
    const ads = fakeAds('rewarded');
    setAdsServiceForTesting(ads);
    await renderScreen({ onOpen });

    fireEvent.click(day('2026-11-10'));
    const box = await rewardDialog();
    expect(within(box).getByText(/Les puzzles de plus de 7 jours sont verrouillés/)).toBeTruthy();
    expect(onOpen).not.toHaveBeenCalled();

    fireEvent.click(within(box).getByRole('button', { name: 'Regarder' }));
    await waitFor(() => expect(onOpen).toHaveBeenCalledTimes(1));
    expect(onOpen).toHaveBeenCalledWith('2026-11-10');
    expect(ads.showRewarded).toHaveBeenCalledTimes(1);

    // Débloqué : plus de cadenas, plus de vidéo, et c'est enregistré (l'affichage suit l'ouverture).
    await waitFor(() => expect(label('2026-11-10')).toBe(`mardi 10 novembre 2026, Reines${NBSP}: non joué`));
    expect(day('2026-11-10').dataset['status']).toBe('none');
    expect(lockedDays()).not.toContain('2026-11-10');
    expect(lockedDays()).toContain('2026-11-09'); // les autres jours restent verrouillés
    fireEvent.click(day('2026-11-10'));
    expect(onOpen).toHaveBeenCalledTimes(2);
    expect(ads.showRewarded).toHaveBeenCalledTimes(1);
    await waitFor(async () => expect(await loadJSON(MONETIZATION_KEY)).toMatchObject({ unlocked: ['2026-11-10'] }));
  });

  it('annuler : le jour reste verrouillé et rien ne s’ouvre', async () => {
    const onOpen = vi.fn();
    const ads = fakeAds();
    setAdsServiceForTesting(ads);
    await renderScreen({ onOpen });

    fireEvent.click(day('2026-11-09'));
    fireEvent.click(within(await rewardDialog()).getByRole('button', { name: 'Annuler' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    expect(onOpen).not.toHaveBeenCalled();
    expect(ads.showRewarded).not.toHaveBeenCalled();
    expect(label('2026-11-09')).toBe(`lundi 9 novembre 2026, Binairo${NBSP}: verrouillé`);
    expect(await loadJSON(MONETIZATION_KEY)).toBeUndefined();
  });

  it.each([
    ['dismissed', /Vidéo interrompue/],
    ['unavailable', /Aucune vidéo disponible/],
  ] as const)('vidéo %s : message, le jour reste verrouillé et rien ne s’ouvre', async (outcome, message) => {
    const onOpen = vi.fn();
    setAdsServiceForTesting(fakeAds(outcome));
    await renderScreen({ onOpen });

    fireEvent.click(day('2026-11-09'));
    fireEvent.click(within(await rewardDialog()).getByRole('button', { name: 'Regarder' }));
    expect(await screen.findByText(message)).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    expect(onOpen).not.toHaveBeenCalled();
    expect(label('2026-11-09')).toBe(`lundi 9 novembre 2026, Binairo${NBSP}: verrouillé`);
    expect(await loadJSON(MONETIZATION_KEY)).toBeUndefined();
  });

  it('jour déjà débloqué (état enregistré) : ouvert sans vidéo, même après un redémarrage', async () => {
    const onOpen = vi.fn();
    const ads = fakeAds();
    setAdsServiceForTesting(ads);
    await renderScreen({ onOpen, monetization: { ...EMPTY_MONETIZATION, unlocked: ['2026-11-08'] } });
    expect(label('2026-11-08')).toBe(`dimanche 8 novembre 2026, Reines${NBSP}: non joué`);
    fireEvent.click(day('2026-11-08'));
    expect(onOpen).toHaveBeenCalledWith('2026-11-08');
    expect(ads.showRewarded).not.toHaveBeenCalled();
  });

  it('Premium : tout est ouvert, ni cadenas, ni légende, ni explication', async () => {
    const onOpen = vi.fn();
    await renderScreen({ onOpen, monetization: { ...EMPTY_MONETIZATION, premium: true } });
    expect(lockedDays()).toEqual([]);
    expect(label('2026-11-02')).toBe(`lundi 2 novembre 2026, Reines${NBSP}: non joué`);
    expect(legend().map((item) => item.dataset['status'])).toEqual(['solved', 'late', 'frozen', 'progress']);
    expect(screen.queryByText(/derniers jours sont libres/)).toBeNull();
    fireEvent.click(day('2026-11-02'));
    expect(onOpen).toHaveBeenCalledWith('2026-11-02');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('mois précédent : presque tout est verrouillé, sauf le 5 octobre déjà résolu', async () => {
    await renderScreen();
    fireEvent.click(screen.getByRole('button', { name: 'Mois précédent' }));
    expect(label('2026-10-05')).toBe(`lundi 5 octobre 2026, Reines${NBSP}: résolu à temps`);
    // Verrous du mois affichés une fois ses parties entamées relues.
    await waitFor(() => expect(lockedDays()).toHaveLength(27 - 1)); // du 5 au 31 octobre, moins le jour résolu
    expect(lockedDays()).not.toContain('2026-10-05');
    expect(legend().at(-1)!.textContent).toBe('verrouillé');
  });

  it('anglais : statut, légende et explication traduits', async () => {
    await act(() => setLanguage('en'));
    await renderScreen();
    expect(label('2026-11-10')).toBe('Tuesday, November 10, 2026, Queens: locked');
    expect(legend().at(-1)!.textContent).toBe('locked');
    expect(screen.getByText(/The last 7 days are free/)).toBeTruthy();
    fireEvent.click(day('2026-11-10'));
    expect(await screen.findByRole('dialog', { name: 'Unlock this puzzle' })).toBeTruthy();
  });
});
