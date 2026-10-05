import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { initI18n } from '../i18n';
import { dispatchBack } from '../platform/back';
import { loadJSON, saveJSON } from '../platform/storage';
import { SnackbarHost } from '../ui';
import { installMatchMedia } from '../ui/testing';
import { setAdsServiceForTesting } from './ads';
import { INTERSTITIAL_AFTER_REWARD_MS, INTERSTITIAL_UNLIMITED_EVERY } from './config';
import { MonetizationProvider, useMonetization, type MonetizationValue } from './MonetizationContext';
import { setPurchaseServiceForTesting } from './purchases';
import { EMPTY_MONETIZATION, MONETIZATION_KEY, encodeMonetization, type MonetizationState } from './state';
import { fakeAds, fakePurchases } from './testing';

installMatchMedia();

beforeAll(async () => {
  await initI18n('fr');
});
beforeEach(() => localStorage.clear());
afterEach(() => {
  setAdsServiceForTesting(null);
  setPurchaseServiceForTesting(null);
  vi.useRealTimers();
});

/** Dernière valeur du contexte, relue par les tests (le composant ne rend rien d'autre qu'un état lisible). */
let api: MonetizationValue;
function Probe() {
  api = useMonetization();
  return <output>{`premium=${api.premium} unlimited=${api.unlimited} privacy=${api.privacyOptionsRequired}`}</output>;
}

function renderProvider(initial?: MonetizationState) {
  return render(
    <SnackbarHost closeLabel="Fermer">
      <MonetizationProvider initial={initial}>
        <Probe />
      </MonetizationProvider>
    </SnackbarHost>,
  );
}

/** Demande une récompense ; la promesse du résultat est rendue (à attendre après avoir répondu au dialogue). */
function ask(kind: 'hint' | 'archive' | 'freeze'): Promise<boolean> {
  let result!: Promise<boolean>;
  act(() => {
    result = api.requestReward(kind);
  });
  return result;
}

const dialog = (name: string) => screen.findByRole('dialog', { name });
const noDialog = () => waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

describe('dialogue des vidéos avec récompense', () => {
  it('Regarder : la vidéo est montrée et la récompense accordée', async () => {
    const ads = fakeAds('rewarded');
    setAdsServiceForTesting(ads);
    renderProvider(EMPTY_MONETIZATION);

    const result = ask('hint');
    const box = await dialog('Débloquer cet indice');
    expect(within(box).getByText(/Les indices gratuits de cette grille sont épuisés \(2 par grille\)/)).toBeTruthy();
    expect(within(box).getByText(/Avec Premium.*aucune publicité, indices et archives illimités\./)).toBeTruthy();
    expect(ads.showRewarded).not.toHaveBeenCalled();

    fireEvent.click(within(box).getByRole('button', { name: 'Regarder' }));
    await expect(result).resolves.toBe(true);
    expect(ads.showRewarded).toHaveBeenCalledTimes(1);
    await noDialog();
  });

  it('chaque récompense a son titre et son texte', async () => {
    setAdsServiceForTesting(fakeAds());
    renderProvider(EMPTY_MONETIZATION);

    const archive = ask('archive');
    const box = await dialog('Débloquer ce puzzle');
    expect(within(box).getByText(/Les puzzles de plus de 7 jours sont verrouillés/)).toBeTruthy();
    fireEvent.click(within(box).getByRole('button', { name: 'Annuler' }));
    await expect(archive).resolves.toBe(false);
    await noDialog();

    const freeze = ask('freeze');
    const other = await dialog('Obtenir un gel de série');
    expect(within(other).getByText(/Un gel protège votre série quand vous manquez un jour/)).toBeTruthy();
    fireEvent.click(within(other).getByRole('button', { name: 'Annuler' }));
    await expect(freeze).resolves.toBe(false);
  });

  it('fermer le dialogue (Annuler, Échap, retour Android) refuse la récompense sans lancer la vidéo', async () => {
    const ads = fakeAds();
    setAdsServiceForTesting(ads);
    renderProvider(EMPTY_MONETIZATION);

    let result = ask('hint');
    fireEvent.click(within(await dialog('Débloquer cet indice')).getByRole('button', { name: 'Annuler' }));
    await expect(result).resolves.toBe(false);
    await noDialog();

    result = ask('hint');
    await dialog('Débloquer cet indice');
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    await expect(result).resolves.toBe(false);
    await noDialog();

    result = ask('hint');
    await dialog('Débloquer cet indice');
    act(() => void dispatchBack());
    await expect(result).resolves.toBe(false);
    await noDialog();

    expect(ads.showRewarded).not.toHaveBeenCalled();
  });

  it('une nouvelle demande refuse la précédente encore en attente', async () => {
    setAdsServiceForTesting(fakeAds());
    renderProvider(EMPTY_MONETIZATION);
    const first = ask('hint');
    await dialog('Débloquer cet indice');
    const second = ask('archive');
    await expect(first).resolves.toBe(false);
    await dialog('Débloquer ce puzzle');
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    await expect(second).resolves.toBe(false);
  });

  it('vidéo indisponible : refus et message dans un snackbar', async () => {
    setAdsServiceForTesting(fakeAds('unavailable'));
    renderProvider(EMPTY_MONETIZATION);
    const result = ask('hint');
    fireEvent.click(within(await dialog('Débloquer cet indice')).getByRole('button', { name: 'Regarder' }));
    await expect(result).resolves.toBe(false);
    const message = await screen.findByText('Aucune vidéo disponible pour le moment. Réessayez plus tard.');
    expect(message.closest('[role="status"]')).toBeTruthy();
    await noDialog();
  });

  it('vidéo interrompue avant la fin : pas de récompense, et le joueur est prévenu', async () => {
    setAdsServiceForTesting(fakeAds('dismissed'));
    renderProvider(EMPTY_MONETIZATION);
    const result = ask('freeze');
    fireEvent.click(within(await dialog('Obtenir un gel de série')).getByRole('button', { name: 'Regarder' }));
    await expect(result).resolves.toBe(false);
    expect(await screen.findByText(/Vidéo interrompue.*la récompense n’a pas été accordée/)).toBeTruthy();
  });

  it('service publicitaire en panne : traité comme une vidéo indisponible', async () => {
    const ads = fakeAds();
    ads.showRewarded.mockRejectedValueOnce(new Error('SDK'));
    setAdsServiceForTesting(ads);
    renderProvider(EMPTY_MONETIZATION);
    const result = ask('hint');
    fireEvent.click(within(await dialog('Débloquer cet indice')).getByRole('button', { name: 'Regarder' }));
    await expect(result).resolves.toBe(false);
    expect(await screen.findByText(/Aucune vidéo disponible/)).toBeTruthy();
  });

  it('pendant la vidéo : chargement affiché, dialogue figé (ni fermeture ni Premium)', async () => {
    const ads = fakeAds();
    let finish!: (outcome: 'rewarded') => void;
    ads.showRewarded.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    setAdsServiceForTesting(ads);
    renderProvider(EMPTY_MONETIZATION);
    const result = ask('hint');
    const box = await dialog('Débloquer cet indice');
    fireEvent.click(within(box).getByRole('button', { name: 'Regarder' }));

    await waitFor(() => expect(within(box).getByRole('progressbar', { name: 'Chargement de la vidéo…' })).toBeTruthy());
    expect((within(box).getByRole('button', { name: 'Annuler' }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(box).getByRole('button', { name: 'Premium' }) as HTMLButtonElement).disabled).toBe(true);
    act(() => void dispatchBack()); // le retour Android ne ferme pas le dialogue en pleine vidéo
    expect(screen.queryByRole('dialog')).toBeTruthy();

    await act(async () => finish('rewarded'));
    await expect(result).resolves.toBe(true);
  });

  it('Premium : le dialogue se ferme sans récompense et ouvre la page Premium', async () => {
    const ads = fakeAds();
    setAdsServiceForTesting(ads);
    renderProvider(EMPTY_MONETIZATION);
    const open = vi.fn();
    act(() => api.setPremiumOpener(open));

    const result = ask('archive');
    fireEvent.click(within(await dialog('Débloquer ce puzzle')).getByRole('button', { name: 'Premium' }));
    await expect(result).resolves.toBe(false);
    expect(open).toHaveBeenCalledTimes(1);
    expect(ads.showRewarded).not.toHaveBeenCalled();
    await noDialog();

    // Page retirée : plus d'appel.
    act(() => api.setPremiumOpener(null));
    const again = ask('archive');
    fireEvent.click(within(await dialog('Débloquer ce puzzle')).getByRole('button', { name: 'Premium' }));
    await expect(again).resolves.toBe(false);
    expect(open).toHaveBeenCalledTimes(1);
  });
});

describe('Premium', () => {
  it('Premium possédé : tout est débloqué, aucune demande de vidéo', async () => {
    const ads = fakeAds();
    setAdsServiceForTesting(ads);
    renderProvider({ ...EMPTY_MONETIZATION, premium: true });
    expect(api).toMatchObject({ adsEnabled: true, premium: true, unlimited: true });

    await expect(ask('hint')).resolves.toBe(true);
    await expect(ask('archive')).resolves.toBe(true);
    await expect(ask('freeze')).resolves.toBe(true);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(ads.showRewarded).not.toHaveBeenCalled();
  });

  it('achat : Premium s’active, l’état est enregistré et un message le confirme', async () => {
    const store = fakePurchases({ buy: 'purchased' });
    setPurchaseServiceForTesting(store);
    renderProvider(EMPTY_MONETIZATION);
    await waitFor(() => expect(api.purchaseAvailable).toBe(true));
    expect(api.price).toBe('2,99 €');
    expect(api.premium).toBe(false);

    let outcome: string | undefined;
    await act(async () => {
      outcome = await api.buyPremium();
    });
    expect(outcome).toBe('purchased');
    expect(store.buy).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(api.premium).toBe(true));
    expect(api.unlimited).toBe(true);
    expect(await screen.findByText('Premium est activé. Profitez de tout, sans publicité.')).toBeTruthy();
    await waitFor(async () => expect(await loadJSON<{ premium: boolean }>(MONETIZATION_KEY)).toMatchObject({ v: 1, premium: true }));
    // Plus aucune vidéo demandée.
    await expect(ask('hint')).resolves.toBe(true);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('achat annulé ou refusé : Premium reste inactif', async () => {
    const store = fakePurchases({ buy: 'cancelled' });
    setPurchaseServiceForTesting(store);
    renderProvider(EMPTY_MONETIZATION);
    await waitFor(() => expect(api.purchaseAvailable).toBe(true));
    await act(async () => {
      await expect(api.buyPremium()).resolves.toBe('cancelled');
    });
    expect(api.premium).toBe(false);
    expect(screen.queryByText(/Premium est activé/)).toBeNull();
  });

  it('code promo échangé dans le Play Store, puis remboursement : Premium suit le magasin', async () => {
    const store = fakePurchases();
    setPurchaseServiceForTesting(store);
    renderProvider(EMPTY_MONETIZATION);
    await waitFor(() => expect(api.purchaseAvailable).toBe(true));

    act(() => store.setOwned(true));
    await waitFor(() => expect(api.premium).toBe(true));
    expect(await screen.findByText(/Premium est activé/)).toBeTruthy();

    act(() => store.setOwned(false)); // remboursé : retour à la version gratuite, sans message
    await waitFor(() => expect(api.premium).toBe(false));
    expect(api.unlimited).toBe(false);
  });

  it('Premium déjà connu du magasin au démarrage mais pas du cache : activé avec le message', async () => {
    setPurchaseServiceForTesting(fakePurchases({ owned: true }));
    renderProvider(EMPTY_MONETIZATION);
    await waitFor(() => expect(api.premium).toBe(true));
    expect(await screen.findByText(/Premium est activé/)).toBeTruthy();
  });

  it('prix et disponibilité suivent le magasin ; restauration des achats', async () => {
    const store = fakePurchases({ price: null, available: false, restore: true });
    setPurchaseServiceForTesting(store);
    renderProvider(EMPTY_MONETIZATION);
    await waitFor(() => expect(store.start).toHaveBeenCalled());
    expect(api).toMatchObject({ price: null, purchaseAvailable: false });

    act(() => store.update({ price: '3,49 €', available: true }));
    await waitFor(() => expect(api).toMatchObject({ price: '3,49 €', purchaseAvailable: true }));

    await act(async () => {
      await expect(api.restorePurchases()).resolves.toBe('owned');
    });
    await waitFor(() => expect(api.premium).toBe(true));
  });

  it('paiement en attente (espèces, validation parentale) : signalé, Premium inactif jusqu’à confirmation', async () => {
    const store = fakePurchases({ buy: 'pending' });
    setPurchaseServiceForTesting(store);
    renderProvider(EMPTY_MONETIZATION);
    await waitFor(() => expect(api.purchaseAvailable).toBe(true));
    await act(async () => {
      await expect(api.buyPremium()).resolves.toBe('pending');
    });
    await waitFor(() => expect(api.purchasePending).toBe(true));
    expect(api.premium).toBe(false);
    act(() => {
      store.update({ pending: false });
      store.setOwned(true); // paiement confirmé
    });
    await waitFor(() => expect(api).toMatchObject({ premium: true, purchasePending: false }));
  });

  it('restauration : magasin injoignable ≠ aucun achat', async () => {
    setPurchaseServiceForTesting(fakePurchases({ restore: 'unavailable' }));
    renderProvider(EMPTY_MONETIZATION);
    await act(async () => {
      await expect(api.restorePurchases()).resolves.toBe('unavailable');
    });
    expect(api.premium).toBe(false);
  });

  it('sans magasin (navigateur) : achat indisponible, restauration vide', async () => {
    renderProvider(EMPTY_MONETIZATION);
    expect(api).toMatchObject({ price: null, purchaseAvailable: false });
    await act(async () => {
      await expect(api.buyPremium()).resolves.toBe('error');
      await expect(api.restorePurchases()).resolves.toBe('unavailable');
    });
  });
});

describe('état enregistré', () => {
  it('lu dans le stockage au montage', async () => {
    await saveJSON(MONETIZATION_KEY, encodeMonetization({ ...EMPTY_MONETIZATION, premium: true, unlocked: ['2026-10-08'], freezeClaimedOn: '2026-10-20' }));
    renderProvider();
    await waitFor(() => expect(api.premium).toBe(true));
    expect([...api.unlocked]).toEqual(['2026-10-08']);
    expect(api.freezeClaimedOn).toBe('2026-10-20');
  });

  it('stockage vide : version gratuite', async () => {
    renderProvider();
    await act(async () => undefined);
    expect(api).toMatchObject({ premium: false, unlimited: false, adsEnabled: true });
    expect(api.unlocked.size).toBe(0);
    expect(api.freezeClaimedOn).toBeNull();
  });

  it('avant la lecture du stockage : les changements attendent, puis s’ajoutent à l’état enregistré', async () => {
    await saveJSON(MONETIZATION_KEY, encodeMonetization({ ...EMPTY_MONETIZATION, premium: true, unlocked: ['2026-10-08'] }));
    renderProvider();
    expect(api.ready).toBe(false);
    act(() => api.unlockArchive('2026-10-09')); // état pas encore lu : mis en attente
    await waitFor(() => expect(api.ready).toBe(true));
    expect(api.premium).toBe(true);
    expect([...api.unlocked]).toEqual(['2026-10-08', '2026-10-09']);
    expect(await loadJSON(MONETIZATION_KEY)).toMatchObject({ premium: true, unlocked: ['2026-10-08', '2026-10-09'] });
  });

  it('archives débloquées et gel réclamé : enregistrés, sans doublon', async () => {
    renderProvider(EMPTY_MONETIZATION);
    act(() => {
      api.unlockArchive('2026-10-10');
      api.unlockArchive('2026-10-08');
      api.unlockArchive('2026-10-10');
      api.markFreezeClaimed('2026-11-02');
    });
    expect([...api.unlocked]).toEqual(['2026-10-08', '2026-10-10']);
    expect(api.freezeClaimedOn).toBe('2026-11-02');
    await waitFor(async () =>
      expect(await loadJSON(MONETIZATION_KEY)).toMatchObject({ v: 1, unlocked: ['2026-10-08', '2026-10-10'], freezeClaimedOn: '2026-11-02' }),
    );
  });
});

describe('annonces et consentement', () => {
  /** Faux minuteries : l'attente de la réponse du magasin et l'horloge (délai après une vidéo). */
  const fakeTimers = () => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  const advance = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));
  const settle = () => act(async () => void (await new Promise((r) => setTimeout(r, 0))));
  const transition = () => act(async () => api.showPendingInterstitial());
  /** App au premier plan ou en arrière-plan (navigateur : visibilitychange). */
  const setVisible = (visible: boolean) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (visible ? 'visible' : 'hidden') });
    act(() => void document.dispatchEvent(new Event('visibilitychange')));
  };
  afterEach(() => setVisible(true));

  it('consentement relu en silence dès que le magasin a répondu, en version gratuite seulement', async () => {
    const ads = fakeAds();
    setAdsServiceForTesting(ads);
    setPurchaseServiceForTesting(fakePurchases({ owned: false }));
    renderProvider(EMPTY_MONETIZATION);
    await waitFor(() => expect(ads.start).toHaveBeenCalledTimes(1));
    expect(ads.prepareInterstitial).not.toHaveBeenCalled(); // rien de chargé sans occasion
  });

  it('magasin muet : les annonces attendent sa réponse quelques secondes avant de démarrer', async () => {
    fakeTimers();
    const ads = fakeAds();
    setAdsServiceForTesting(ads);
    const store = fakePurchases();
    store.start.mockImplementation(async () => {}); // ne répond jamais
    setPurchaseServiceForTesting(store);
    renderProvider(EMPTY_MONETIZATION);
    await advance(5000);
    expect(ads.start).not.toHaveBeenCalled();
    await advance(4000);
    expect(ads.start).toHaveBeenCalledTimes(1);
  });

  it('acheteur Premium (nouvelle installation) : le magasin répond avant tout démarrage des annonces', async () => {
    const ads = fakeAds();
    setAdsServiceForTesting(ads);
    setPurchaseServiceForTesting(fakePurchases({ owned: true }));
    renderProvider(EMPTY_MONETIZATION);
    await waitFor(() => expect(api.premium).toBe(true));
    await settle();
    expect(ads.start).not.toHaveBeenCalled();
  });

  it('Premium : ni démarrage des annonces, ni interstitiel', async () => {
    const ads = fakeAds();
    setAdsServiceForTesting(ads);
    renderProvider({ ...EMPTY_MONETIZATION, premium: true });
    await settle();
    act(() => api.notifySolved({ mode: 'daily', date: '2026-10-07' }));
    await transition();
    expect(ads.start).not.toHaveBeenCalled();
    expect(ads.prepareInterstitial).not.toHaveBeenCalled();
    expect(ads.showInterstitial).not.toHaveBeenCalled();
  });

  it('choix de confidentialité : proposés si le consentement l’exige, suivis quand ils changent, rouverts à la demande', async () => {
    const ads = fakeAds('rewarded', { privacyOptions: true });
    setAdsServiceForTesting(ads);
    renderProvider(EMPTY_MONETIZATION);
    await waitFor(() => expect(api.privacyOptionsRequired).toBe(true));
    act(() => ads.setPrivacyOptions(false));
    expect(api.privacyOptionsRequired).toBe(false);
    act(() => ads.setPrivacyOptions(true));
    expect(api.privacyOptionsRequired).toBe(true);
    await act(async () => api.showPrivacyOptions());
    expect(ads.showPrivacyOptions).toHaveBeenCalledTimes(1);
  });

  it('puzzle du jour résolu : interstitiel préparé, montré à la transition suivante, une seule fois', async () => {
    const ads = fakeAds();
    setAdsServiceForTesting(ads);
    renderProvider(EMPTY_MONETIZATION);
    await settle();

    act(() => api.notifySolved({ mode: 'daily', date: '2026-10-07' }));
    await settle();
    expect(ads.prepareInterstitial).toHaveBeenCalledTimes(1);
    expect(ads.showInterstitial).not.toHaveBeenCalled(); // jamais sur une minuterie
    await transition();
    expect(ads.showInterstitial).toHaveBeenCalledTimes(1);
    await transition(); // plus rien de dû
    expect(ads.showInterstitial).toHaveBeenCalledTimes(1);

    // Même puzzle (rattrapage au redémarrage…) : pas un second.
    act(() => api.notifySolved({ mode: 'daily', date: '2026-10-07' }));
    await transition();
    expect(ads.showInterstitial).toHaveBeenCalledTimes(1);

    // Puzzle du lendemain : à nouveau un.
    act(() => api.notifySolved({ mode: 'daily', date: '2026-10-08' }));
    await transition();
    expect(ads.showInterstitial).toHaveBeenCalledTimes(2);
    expect(await loadJSON(MONETIZATION_KEY)).toMatchObject({ dailyInterstitialFor: '2026-10-08' });
  });

  it(`mode illimité : une partie résolue sur ${INTERSTITIAL_UNLIMITED_EVERY}`, async () => {
    const ads = fakeAds();
    setAdsServiceForTesting(ads);
    renderProvider(EMPTY_MONETIZATION);
    await settle();

    const shown: number[] = [];
    for (let i = 0; i < 2 * INTERSTITIAL_UNLIMITED_EVERY; i++) {
      act(() => api.notifySolved({ mode: 'unlimited' }));
      await transition();
      shown.push(ads.showInterstitial.mock.calls.length);
    }
    expect(shown).toEqual([0, 0, 1, 1, 1, 2]);
    expect(await loadJSON(MONETIZATION_KEY)).toMatchObject({ unlimitedSolved: 6 });
  });

  it('app en arrière-plan à la transition : interstitiel abandonné', async () => {
    const ads = fakeAds();
    setAdsServiceForTesting(ads);
    renderProvider(EMPTY_MONETIZATION);
    await settle();
    act(() => api.notifySolved({ mode: 'daily', date: '2026-10-07' }));
    setVisible(false);
    await transition();
    setVisible(true);
    await transition();
    expect(ads.showInterstitial).not.toHaveBeenCalled();
  });

  it('dialogue des vidéos ouvert : pas d’interstitiel par-dessus', async () => {
    const ads = fakeAds();
    setAdsServiceForTesting(ads);
    renderProvider(EMPTY_MONETIZATION);
    await settle();
    act(() => api.notifySolved({ mode: 'daily', date: '2026-10-07' }));
    void ask('hint');
    await dialog('Débloquer cet indice');
    await transition();
    expect(ads.showInterstitial).not.toHaveBeenCalled();
  });

  it('juste après une vidéo avec récompense : pas d’interstitiel (deux annonces d’affilée)', async () => {
    const ads = fakeAds('rewarded');
    setAdsServiceForTesting(ads);
    renderProvider(EMPTY_MONETIZATION);
    await settle();
    const reward = ask('hint');
    fireEvent.click(within(await dialog('Débloquer cet indice')).getByRole('button', { name: /^Regarder/ }));
    expect(await reward).toBe(true);

    act(() => api.notifySolved({ mode: 'daily', date: '2026-10-07' }));
    await transition();
    expect(ads.showInterstitial).not.toHaveBeenCalled();

    // Bien plus tard, un nouveau puzzle du jour : de nouveau un interstitiel.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + INTERSTITIAL_AFTER_REWARD_MS + 1000);
    act(() => api.notifySolved({ mode: 'daily', date: '2026-10-08' }));
    await transition();
    expect(ads.showInterstitial).toHaveBeenCalledTimes(1);
  });

  it('Premium acheté entre la victoire et la transition : interstitiel annulé', async () => {
    const ads = fakeAds();
    setAdsServiceForTesting(ads);
    const store = fakePurchases();
    setPurchaseServiceForTesting(store);
    renderProvider(EMPTY_MONETIZATION);
    await settle();
    act(() => api.notifySolved({ mode: 'daily', date: '2026-10-07' }));
    act(() => store.setOwned(true));
    await transition();
    expect(ads.showInterstitial).not.toHaveBeenCalled();
  });
});
