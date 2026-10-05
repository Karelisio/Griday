/** Premium dans l'application : la page s'ouvre depuis les réglages et depuis le dialogue des vidéos ; les archives se débloquent. */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { initI18n } from './i18n';
import { setAdsServiceForTesting } from './monetization/ads';
import { setPurchaseServiceForTesting } from './monetization/purchases';
import { fakeAds, fakePurchases } from './monetization/testing';
import { dispatchBack } from './platform/back';
import { EMPTY_STREAK } from './progress/streak';
import { DEFAULT_SETTINGS } from './settings/types';

beforeAll(async () => {
  await initI18n('fr');
});
// Mercredi 18 novembre 2026 : le 10 novembre (puzzle n° 37) est au-delà des 7 jours libres. Seule la date est simulée.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 18, 10));
  localStorage.clear();
  setPurchaseServiceForTesting(fakePurchases({ price: '2,99 €' }));
});
afterEach(() => {
  vi.useRealTimers();
  setAdsServiceForTesting(null);
  setPurchaseServiceForTesting(null);
});

const nav = (label: string) => fireEvent.click(screen.getByText(label, { selector: 'nav *' }));
const premiumTitle = () => screen.queryByRole('heading', { name: 'Griday Premium' });

function renderApp() {
  return render(
    <App
      initialSettings={{ ...DEFAULT_SETTINGS, language: 'fr' }}
      systemLanguages={['fr-FR']}
      initialPalettes={null}
      initialProgress={{ history: new Map(), unlimited: [], streak: EMPTY_STREAK }}
    />,
  );
}

describe('Premium dans l’application', () => {
  it('réglages : « Passer à Premium » ouvre la page Premium par-dessus ; le retour revient aux réglages, puis au jeu', async () => {
    renderApp();
    const gear = screen.getByRole('button', { name: 'Réglages' });
    gear.focus(); // un vrai toucher donne le focus au bouton : c'est lui que la fermeture doit retrouver
    fireEvent.click(gear);
    expect(await screen.findByRole('heading', { name: 'Premium', level: 2 })).toBeTruthy();
    const upgrade = screen.getByText('Passer à Premium').closest('button')!;
    upgrade.focus();
    fireEvent.click(upgrade);

    expect(await screen.findByRole('heading', { name: 'Griday Premium' })).toBeTruthy();
    await waitFor(() => expect(screen.getByRole('button', { name: /^Passer à Premium pour 2,99\s€$/ }).hasAttribute('disabled')).toBe(false));

    // Retour : les réglages, focus sur la ligne qui avait ouvert Premium.
    act(() => void dispatchBack());
    await waitFor(() => expect(premiumTitle()).toBeNull());
    expect(screen.getByRole('heading', { name: 'Réglages' })).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(upgrade));
    // Retour : le jeu, focus sur l'engrenage.
    act(() => void dispatchBack());
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Réglages' })).toBeNull());
    expect(screen.getByRole('heading', { name: 'Puzzle du jour' })).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(gear));
  });

  it('archives : un jour verrouillé propose Premium, dont le bouton ouvre la page sans ouvrir le jour', async () => {
    setAdsServiceForTesting(fakeAds());
    renderApp();
    nav('Archives');
    fireEvent.click(await screen.findByRole('button', { name: /^mardi 10 novembre 2026, Reines\s: verrouillé$/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Débloquer ce puzzle' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Premium' }));

    expect(await screen.findByRole('heading', { name: 'Griday Premium' })).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Débloquer ce puzzle' })).toBeNull());
    expect(screen.queryByRole('heading', { name: /^Puzzle n°/ })).toBeNull();

    act(() => void dispatchBack());
    await waitFor(() => expect(premiumTitle()).toBeNull());
    expect(screen.getByRole('heading', { name: 'Archives' })).toBeTruthy();
  });

  it('archives : la vidéo vue débloque le jour, qui s’ouvre ; il reste ensuite ouvert', async () => {
    const ads = fakeAds('rewarded');
    setAdsServiceForTesting(ads);
    renderApp();
    nav('Archives');
    fireEvent.click(await screen.findByRole('button', { name: /^mardi 10 novembre 2026, Reines\s: verrouillé$/ }));
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Débloquer ce puzzle' })).getByRole('button', { name: 'Regarder' }));

    expect(await screen.findByRole('heading', { name: /^Puzzle n°\s37$/ }, { timeout: 15_000 })).toBeTruthy();
    expect(ads.showRewarded).toHaveBeenCalledTimes(1);
    act(() => void dispatchBack());
    await waitFor(() => expect(screen.queryByRole('heading', { name: /^Puzzle n°/ })).toBeNull());
    expect(await screen.findByRole('button', { name: /^mardi 10 novembre 2026, Reines\s: non joué$/ })).toBeTruthy();
  }, 60_000);
});
