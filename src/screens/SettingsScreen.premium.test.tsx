/** Réglages : section Premium (statut, restauration des achats, choix de confidentialité) dans un build avec publicités. */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { initI18n, setLanguage } from '../i18n';
import { setAdsServiceForTesting } from '../monetization/ads';
import { MonetizationProvider } from '../monetization/MonetizationContext';
import { setPurchaseServiceForTesting } from '../monetization/purchases';
import { EMPTY_MONETIZATION, type MonetizationState } from '../monetization/state';
import { fakeAds, fakePurchases, type FakePurchasesOptions } from '../monetization/testing';
import { SettingsProvider } from '../settings/SettingsContext';
import { DEFAULT_SETTINGS } from '../settings/types';
import { SnackbarHost } from '../ui';
import { installMatchMedia } from '../ui/testing';
import { SettingsScreen } from './SettingsScreen';

installMatchMedia();

beforeAll(async () => {
  await initI18n('fr');
});
beforeEach(() => localStorage.clear());
afterEach(async () => {
  setAdsServiceForTesting(null);
  setPurchaseServiceForTesting(null);
  vi.useRealTimers();
  await setLanguage('fr');
});

function renderSettings({
  monetization = EMPTY_MONETIZATION,
  store,
  onOpenPremium,
}: { monetization?: MonetizationState; store?: FakePurchasesOptions; onOpenPremium?: () => void } = {}) {
  const service = store ? fakePurchases(store) : null;
  setPurchaseServiceForTesting(service);
  render(
    <SettingsProvider initial={{ ...DEFAULT_SETTINGS, language: 'fr' }}>
      <SnackbarHost closeLabel="Fermer">
        <MonetizationProvider initial={monetization}>
          <SettingsScreen visible dynamicSupported={false} onOpenPremium={onOpenPremium} />
        </MonetizationProvider>
      </SnackbarHost>
    </SettingsProvider>,
  );
  return service;
}

const row = (headline: string) => screen.getByText(headline).closest('button') as HTMLButtonElement;
const titles = () => screen.getAllByRole('heading', { level: 2 }).map((h2) => h2.textContent);

describe('réglages : Premium', () => {
  it('section « Premium » entre « Rappel quotidien » et « À propos »', () => {
    renderSettings();
    expect(titles()).toEqual(['Apparence', 'Jeu', 'Rappel quotidien', 'Premium', 'À propos']);
  });

  it('version gratuite : « Passer à Premium » ouvre la page Premium', () => {
    const onOpenPremium = vi.fn();
    renderSettings({ onOpenPremium });
    expect(screen.getByText('Sans publicité, avec indices et archives illimités')).toBeTruthy();
    fireEvent.click(row('Passer à Premium'));
    expect(onOpenPremium).toHaveBeenCalledTimes(1);
  });

  it('Premium actif : le statut remplace l’invitation, la page reste accessible', () => {
    const onOpenPremium = vi.fn();
    renderSettings({ monetization: { ...EMPTY_MONETIZATION, premium: true }, onOpenPremium });
    expect(screen.queryByText('Passer à Premium')).toBeNull();
    expect(screen.getByText('Merci de soutenir Griday !')).toBeTruthy();
    fireEvent.click(row('Premium est actif'));
    expect(onOpenPremium).toHaveBeenCalledTimes(1);
  });

  it('« Restaurer mes achats » : achat retrouvé, ou non', async () => {
    const store = renderSettings({ store: { restore: false } })!;
    expect(screen.getByText('Retrouver un achat fait avec ce compte Google Play')).toBeTruthy();
    await waitFor(() => expect(store.start).toHaveBeenCalled());
    fireEvent.click(row('Restaurer mes achats'));
    expect(await screen.findByText('Aucun achat Premium trouvé sur ce compte Google Play.')).toBeTruthy();
    expect(store.restore).toHaveBeenCalledTimes(1);
  });

  it('« Restaurer mes achats » : Premium retrouvé et activé', async () => {
    const store = renderSettings({ store: { restore: true } })!;
    await waitFor(() => expect(store.start).toHaveBeenCalled());
    fireEvent.click(row('Restaurer mes achats'));
    expect(await screen.findByText('Premium est activé. Profitez de tout, sans publicité.')).toBeTruthy();
    expect(await screen.findByText('Premium est actif')).toBeTruthy(); // la ligne de statut suit
  });

  it('sans magasin : la restauration dit que l’achat est indisponible', async () => {
    renderSettings();
    fireEvent.click(row('Restaurer mes achats'));
    expect(await screen.findByText(/L’achat n’est pas disponible pour le moment/)).toBeTruthy();
    expect(screen.queryByText(/Aucun achat Premium trouvé/)).toBeNull();
  });

  it('choix de confidentialité : seulement quand le consentement l’exige, et ils rouvrent le formulaire', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const ads = fakeAds('rewarded', { privacyOptions: true });
    setAdsServiceForTesting(ads);
    renderSettings();
    expect(screen.queryByText('Choix de confidentialité')).toBeNull();

    await act(async () => void (await vi.advanceTimersByTimeAsync(3000))); // démarrage des annonces et du consentement
    expect(screen.getByText('Modifier votre consentement aux publicités')).toBeTruthy();
    await act(async () => {
      fireEvent.click(row('Choix de confidentialité'));
    });
    expect(ads.showPrivacyOptions).toHaveBeenCalledTimes(1);
  });

  it('consentement sans options de confidentialité : pas de ligne', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    setAdsServiceForTesting(fakeAds('rewarded', { privacyOptions: false }));
    renderSettings();
    await act(async () => void (await vi.advanceTimersByTimeAsync(3000)));
    expect(screen.queryByText('Choix de confidentialité')).toBeNull();
  });

  it('anglais', async () => {
    await setLanguage('en');
    renderSettings();
    const section = screen.getByRole('heading', { name: 'Premium' }).nextElementSibling as HTMLElement;
    expect(within(section).getByText('Get Premium')).toBeTruthy();
    expect(within(section).getByText('No ads, with unlimited hints and archives')).toBeTruthy();
    expect(within(section).getByText('Restore purchases')).toBeTruthy();
    expect(within(section).getByText('Recover a purchase made with this Google Play account')).toBeTruthy();
  });
});
