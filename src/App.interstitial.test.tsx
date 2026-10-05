import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { App } from './App';
import { initI18n } from './i18n';
import { dispatchBack } from './platform/back';
import type { MonetizationValue } from './monetization/MonetizationContext';
import { EMPTY_STREAK } from './progress/streak';
import { DEFAULT_SETTINGS } from './settings/types';

// Monétisation simulée : tout débloqué, et des espions sur les transitions (interstitiel dû) et Premium.
const monetization = vi.hoisted(() => ({
  showPendingInterstitial: null as unknown as Mock<() => Promise<void>>,
  unlockArchive: null as unknown as Mock<(date: string) => void>,
  premiumOpener: null as (() => void) | null,
}));
vi.mock('./monetization/MonetizationContext', async (orig) => {
  const actual = await orig<typeof import('./monetization/MonetizationContext')>();
  monetization.showPendingInterstitial = vi.fn(async () => {});
  monetization.unlockArchive = vi.fn();
  const value: MonetizationValue = {
    ready: true,
    adsEnabled: true,
    premium: false,
    unlimited: true,
    unlocked: new Set(),
    freezeClaimedOn: null,
    price: null,
    purchaseAvailable: false,
    purchasePending: false,
    buyPremium: async () => 'error',
    restorePurchases: async () => 'unavailable',
    privacyOptionsRequired: false,
    showPrivacyOptions: async () => {},
    requestReward: async () => true,
    unlockArchive: (date) => monetization.unlockArchive(date),
    markFreezeClaimed: () => {},
    notifySolved: () => {},
    showPendingInterstitial: () => monetization.showPendingInterstitial(),
    setPremiumOpener: (open) => {
      monetization.premiumOpener = open;
    },
  };
  return { ...actual, MonetizationProvider: ({ children }: { children: ReactNode }) => children, useMonetization: () => value };
});

beforeAll(async () => {
  await initI18n('fr');
});
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 7, 10));
  localStorage.clear();
  monetization.showPendingInterstitial.mockClear();
  monetization.unlockArchive.mockClear();
});
afterEach(() => vi.useRealTimers());

const nav = (label: string) => fireEvent.click(screen.getByText(label, { selector: 'nav *' }));

describe('interstitiel dû : montré aux transitions voulues par le joueur', () => {
  it('changement d’onglet et réglages ouverts : oui ; page Premium : jamais', async () => {
    render(
      <App
        initialSettings={{ ...DEFAULT_SETTINGS, language: 'fr' }}
        systemLanguages={['fr-FR']}
        initialPalettes={null}
        initialProgress={{ history: new Map(), unlimited: [], streak: EMPTY_STREAK }}
      />,
    );
    await screen.findByRole('grid', {}, { timeout: 15_000 });
    expect(monetization.showPendingInterstitial).not.toHaveBeenCalled();

    nav('Stats');
    expect(monetization.showPendingInterstitial).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Réglages' }));
    expect(await screen.findByRole('heading', { name: 'Réglages' })).toBeTruthy();
    expect(monetization.showPendingInterstitial).toHaveBeenCalledTimes(2);

    // Premium (depuis le dialogue des vidéos) : par-dessus les réglages, sans interstitiel ; le retour y ramène.
    act(() => monetization.premiumOpener?.());
    expect(await screen.findByRole('heading', { name: 'Griday Premium' })).toBeTruthy();
    expect(monetization.showPendingInterstitial).toHaveBeenCalledTimes(2);
    act(() => void dispatchBack());
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Griday Premium' })).toBeNull());
    expect(screen.getByRole('heading', { name: 'Réglages' })).toBeTruthy();
    act(() => void dispatchBack());
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Réglages' })).toBeNull());
  }, 30_000);
});

describe('ménage du stockage au démarrage', () => {
  it('partie entamée trop ancienne pour être gardée : son jour d’archive reste ouvert (jamais reverrouillé)', async () => {
    vi.setSystemTime(new Date(2026, 11, 20, 10));
    // Entamée le 10 octobre (plus de 30 jours), jamais finie ; le 12 octobre, finie : rien à rouvrir.
    localStorage.setItem('CapacitorStorage.daily.started.2026-10-10', JSON.stringify('2026-10-10'));
    localStorage.setItem('CapacitorStorage.daily.started.2026-10-12', JSON.stringify('2026-10-12'));
    const solved = { date: '2026-10-12', type: 'queens', size: 6, tier: 1, timeMs: 60_000, hintsUsed: 0, mode: 'daily', solvedOn: '2026-10-12' } as const;
    render(
      <App
        initialSettings={{ ...DEFAULT_SETTINGS, language: 'fr' }}
        systemLanguages={['fr-FR']}
        initialPalettes={null}
        initialProgress={{ history: new Map([[solved.date, solved]]), unlimited: [], streak: EMPTY_STREAK }}
      />,
    );
    await waitFor(() => expect(localStorage.getItem('CapacitorStorage.daily.started.2026-10-10')).toBeNull(), { timeout: 20_000 });
    expect(monetization.unlockArchive.mock.calls).toEqual([['2026-10-10']]);
  }, 30_000);
});
