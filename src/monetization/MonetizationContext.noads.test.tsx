/** Build personnel sans publicité (`VITE_ADS=false`) : la constante de build est simulée pour tout le fichier. */
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { initI18n } from '../i18n';
import { SettingsProvider } from '../settings/SettingsContext';
import { DEFAULT_SETTINGS } from '../settings/types';
import { SettingsScreen } from '../screens/SettingsScreen';
import { SnackbarHost } from '../ui';
import { installMatchMedia } from '../ui/testing';
import { setAdsServiceForTesting } from './ads';
import { MonetizationProvider, useMonetization, type MonetizationValue } from './MonetizationContext';
import { setPurchaseServiceForTesting } from './purchases';
import { EMPTY_MONETIZATION } from './state';
import { fakeAds, fakePurchases } from './testing';

vi.mock('./config', async (importOriginal) => ({ ...(await importOriginal<typeof import('./config')>()), ADS_ENABLED: false }));

installMatchMedia();
beforeAll(async () => {
  await initI18n('fr');
});
beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
});
afterEach(() => {
  setAdsServiceForTesting(null);
  setPurchaseServiceForTesting(null);
  vi.useRealTimers();
});

let api: MonetizationValue;
function Probe() {
  api = useMonetization();
  return null;
}

const advance = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));

describe('build sans publicité', () => {
  it('tout est débloqué sans être Premium : aucune vidéo, aucune annonce, aucun achat', async () => {
    const ads = fakeAds();
    const store = fakePurchases();
    setAdsServiceForTesting(ads);
    setPurchaseServiceForTesting(store);
    render(
      <SnackbarHost closeLabel="Fermer">
        <MonetizationProvider initial={EMPTY_MONETIZATION}>
          <Probe />
        </MonetizationProvider>
      </SnackbarHost>,
    );
    expect(api).toMatchObject({ adsEnabled: false, premium: false, unlimited: true });

    await expect(act(async () => api.requestReward('hint'))).resolves.toBe(true);
    expect(screen.queryByRole('dialog')).toBeNull();

    await advance(3000);
    act(() => api.notifySolved({ mode: 'daily', date: '2026-10-07' }));
    await act(async () => api.showPendingInterstitial());
    await advance(10_000);
    expect(ads.start).not.toHaveBeenCalled();
    expect(ads.showRewarded).not.toHaveBeenCalled();
    expect(ads.showInterstitial).not.toHaveBeenCalled();
    expect(store.start).not.toHaveBeenCalled();
  });

  it('réglages : aucune section Premium, restauration ni choix de confidentialité', async () => {
    render(
      <SettingsProvider initial={{ ...DEFAULT_SETTINGS, language: 'fr' }}>
        <SnackbarHost closeLabel="Fermer">
          <MonetizationProvider initial={EMPTY_MONETIZATION}>
            <SettingsScreen visible dynamicSupported={false} onOpenPremium={() => {}} />
          </MonetizationProvider>
        </SnackbarHost>
      </SettingsProvider>,
    );
    const titles = screen.getAllByRole('heading', { level: 2 }).map((h2) => h2.textContent);
    expect(titles).toEqual(['Apparence', 'Jeu', 'Rappel quotidien', 'À propos']);
    expect(screen.queryByText('Restaurer mes achats')).toBeNull();
    expect(screen.queryByText('Choix de confidentialité')).toBeNull();
  });
});
