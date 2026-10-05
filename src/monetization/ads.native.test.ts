import type { AdmobConsentInfo } from '@capacitor-community/admob';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (data?: unknown) => void;

// AdMob simulé : réponses scriptables, écouteurs réels (les événements sans écouteur sont perdus, comme
// avec le plugin), premier plan / arrière-plan piloté par le test.
const h = vi.hoisted(() => ({
  admob: {
    requestConsentInfo: vi.fn(),
    showConsentForm: vi.fn(),
    showPrivacyOptionsForm: vi.fn(),
    initialize: vi.fn(),
    prepareRewardVideoAd: vi.fn(),
    showRewardVideoAd: vi.fn(),
    prepareInterstitial: vi.fn(),
    showInterstitial: vi.fn(),
    addListener: vi.fn(),
  },
  handlers: new Map<string, Set<(data?: unknown) => void>>(),
  appActive: null as ((active: boolean) => void) | null,
}));

vi.mock('@capacitor-community/admob', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@capacitor-community/admob')>()),
  AdMob: h.admob,
}));
vi.mock('../platform', () => ({
  onAppActiveChange: (cb: (active: boolean) => void) => {
    h.appActive = cb;
    return () => {};
  },
}));

import { AdmobConsentStatus, InterstitialAdPluginEvents, MaxAdContentRating, RewardAdPluginEvents } from '@capacitor-community/admob';
import { createAdMobService } from './ads.native';
import { AD_UNITS } from './config';

const { admob } = h;

/** Réponse UMP : annonces permises sauf si le consentement est requis. */
function consentInfo(
  status: AdmobConsentStatus,
  { privacy = false, form = true, canRequestAds = status !== AdmobConsentStatus.REQUIRED } = {},
): AdmobConsentInfo {
  return {
    status,
    isConsentFormAvailable: form,
    canRequestAds,
    privacyOptionsRequirementStatus: (privacy ? 'REQUIRED' : 'NOT_REQUIRED') as AdmobConsentInfo['privacyOptionsRequirementStatus'],
  };
}

/** État UMP de l'appareil (relu par requestConsentInfo). */
let ump: AdmobConsentInfo;
/** Appel d'affichage de la vidéo en cours : ne se résout qu'à la récompense gagnée. */
let rewardCall: { resolve: (item: { type: string; amount: number }) => void; reject: (error: Error) => void } | null;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Issue d'une promesse, lisible sans l'attendre. */
function track<T>(promise: Promise<T>) {
  const state: { done: boolean; value?: T } = { done: false };
  void promise.then((value) => {
    state.done = true;
    state.value = value;
  });
  return state;
}

const settle = () => vi.advanceTimersByTimeAsync(0);
const advance = (ms: number) => vi.advanceTimersByTimeAsync(ms);
const emit = (event: string, data: unknown = {}) => h.handlers.get(event)?.forEach((handler) => handler(data));
const listening = (event: string) => h.handlers.get(event)?.size ?? 0;
const setActive = (active: boolean) => h.appActive?.(active);
const order = (fn: ReturnType<typeof vi.fn>) => fn.mock.invocationCallOrder[0] ?? Infinity;
const REWARD_EVENTS = [RewardAdPluginEvents.Showed, RewardAdPluginEvents.Rewarded, RewardAdPluginEvents.Dismissed, RewardAdPluginEvents.FailedToShow];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  h.handlers.clear();
  h.appActive = null;
  for (const fn of Object.values(admob)) fn.mockReset();
  ump = consentInfo(AdmobConsentStatus.NOT_REQUIRED);
  rewardCall = null;
  admob.requestConsentInfo.mockImplementation(async () => ({ ...ump }));
  admob.showConsentForm.mockImplementation(async () => {
    // Le joueur fait son choix ; ses choix restent modifiables (EEE). Réponse sans `isConsentFormAvailable`.
    ump = consentInfo(AdmobConsentStatus.OBTAINED, { privacy: true });
    const { isConsentFormAvailable: _, ...info } = ump;
    return info;
  });
  admob.showPrivacyOptionsForm.mockResolvedValue(undefined);
  admob.initialize.mockResolvedValue(undefined);
  admob.prepareRewardVideoAd.mockResolvedValue({ adUnitId: AD_UNITS.rewarded });
  admob.prepareInterstitial.mockResolvedValue({ adUnitId: AD_UNITS.interstitial });
  admob.showRewardVideoAd.mockImplementation(
    () =>
      new Promise((resolve, reject) => {
        rewardCall = { resolve, reject };
      }),
  );
  admob.showInterstitial.mockResolvedValue(undefined);
  admob.addListener.mockImplementation(async (event: string, handler: Handler) => {
    const set = h.handlers.get(event) ?? new Set<Handler>();
    h.handlers.set(event, set);
    set.add(handler);
    return { remove: async () => void set.delete(handler) };
  });
});
afterEach(() => vi.useRealTimers());

/** Service démarré (consentement relu, SDK démarré s'il le peut). */
async function started() {
  const ads = createAdMobService();
  await ads.start();
  return ads;
}

/** Vidéo regardée jusqu'au bout : affichée, récompense (événement et appel résolu), fermée. */
async function watchToEnd() {
  emit(RewardAdPluginEvents.Showed);
  emit(RewardAdPluginEvents.Rewarded, { type: 'indice', amount: 1 });
  rewardCall?.resolve({ type: 'indice', amount: 1 });
  await settle();
  emit(RewardAdPluginEvents.Dismissed);
  await settle();
}

describe('lancement', () => {
  it('consentement relu en silence, SDK démarré (contenu PG au plus) : ni formulaire, ni annonce chargée', async () => {
    const changed = vi.fn();
    const ads = createAdMobService();
    ads.onChange(changed);
    await ads.start();
    expect(admob.requestConsentInfo).toHaveBeenCalledTimes(1);
    expect(admob.initialize).toHaveBeenCalledExactlyOnceWith({ maxAdContentRating: MaxAdContentRating.ParentalGuidance });
    expect(admob.showConsentForm).not.toHaveBeenCalled();
    expect(admob.prepareRewardVideoAd).not.toHaveBeenCalled();
    expect(admob.prepareInterstitial).not.toHaveBeenCalled();
    expect(changed).toHaveBeenCalled();
    expect(ads.privacyOptionsRequired()).toBe(false);
  });

  it('consentement requis : ni formulaire, ni SDK, ni annonce ; choix de confidentialité signalés', async () => {
    ump = consentInfo(AdmobConsentStatus.REQUIRED, { privacy: true });
    const changed = vi.fn();
    const ads = createAdMobService();
    ads.onChange(changed);
    await ads.start();
    ads.prepareInterstitial();
    await settle();
    expect(admob.showConsentForm).not.toHaveBeenCalled();
    expect(admob.initialize).not.toHaveBeenCalled();
    expect(admob.prepareInterstitial).not.toHaveBeenCalled();
    expect(ads.privacyOptionsRequired()).toBe(true);
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('relecture en échec (hors ligne) : nouvelle tentative au plus toutes les 15 s', async () => {
    admob.requestConsentInfo.mockRejectedValueOnce(new Error('hors ligne'));
    const ads = await started();
    expect(admob.initialize).not.toHaveBeenCalled();

    await advance(5_000);
    await expect(ads.showRewarded()).resolves.toBe('unavailable');
    expect(admob.requestConsentInfo).toHaveBeenCalledTimes(1);

    await advance(10_000);
    const result = track(ads.showRewarded());
    await settle();
    expect(admob.requestConsentInfo).toHaveBeenCalledTimes(2);
    expect(admob.showRewardVideoAd).toHaveBeenCalledTimes(1);
    await watchToEnd();
    expect(result.value).toBe('rewarded');
  });

  it('SDK en échec : redémarré à la demande suivante, pas avant 15 s', async () => {
    admob.initialize.mockRejectedValueOnce(new Error('pas de vue'));
    const ads = await started();
    await expect(ads.showRewarded()).resolves.toBe('unavailable');
    expect(admob.initialize).toHaveBeenCalledTimes(1);
    await advance(15_000);
    const result = track(ads.showRewarded());
    await settle();
    expect(admob.initialize).toHaveBeenCalledTimes(2);
    await watchToEnd();
    expect(result.value).toBe('rewarded');
  });
});

describe('vidéo avec récompense', () => {
  it('consentement requis : formulaire au premier appel, puis SDK, chargement et vidéo', async () => {
    ump = consentInfo(AdmobConsentStatus.REQUIRED);
    const changed = vi.fn();
    const ads = await started();
    ads.onChange(changed);
    expect(admob.showConsentForm).not.toHaveBeenCalled();

    const result = track(ads.showRewarded());
    await settle();
    expect(admob.showConsentForm).toHaveBeenCalledTimes(1);
    expect(order(admob.showConsentForm)).toBeLessThan(order(admob.initialize));
    expect(order(admob.initialize)).toBeLessThan(order(admob.prepareRewardVideoAd));
    expect(order(admob.prepareRewardVideoAd)).toBeLessThan(order(admob.showRewardVideoAd));
    expect(admob.prepareRewardVideoAd).toHaveBeenCalledWith({ adId: AD_UNITS.rewarded, isTesting: AD_UNITS.testing });
    // Choix recueillis : modifiables depuis les réglages.
    expect(ads.privacyOptionsRequired()).toBe(true);
    expect(changed).toHaveBeenCalled();

    await watchToEnd();
    expect(result.value).toBe('rewarded');

    // Consentement recueilli : plus de formulaire.
    const again = track(ads.showRewarded());
    await settle();
    await watchToEnd();
    expect(again.value).toBe('rewarded');
    expect(admob.showConsentForm).toHaveBeenCalledTimes(1);
  });

  it('récompense gagnée puis fermeture : « rewarded » ; écouteurs posés avant l’affichage, retirés ensuite', async () => {
    const ads = await started();
    const result = track(ads.showRewarded());
    await settle();
    expect(admob.showRewardVideoAd).toHaveBeenCalledTimes(1);
    for (const event of REWARD_EVENTS) expect(listening(event)).toBe(1);
    expect(Math.max(...admob.addListener.mock.invocationCallOrder)).toBeLessThan(order(admob.showRewardVideoAd));

    emit(RewardAdPluginEvents.Showed);
    emit(RewardAdPluginEvents.Rewarded, { type: 'indice', amount: 1 });
    await settle();
    // L'issue n'est donnée qu'à la fermeture.
    expect(result.done).toBe(false);
    emit(RewardAdPluginEvents.Dismissed);
    await settle();
    expect(result.value).toBe('rewarded');
    for (const event of REWARD_EVENTS) expect(listening(event)).toBe(0);
  });

  it('récompense signalée seulement par la résolution de l’appel d’affichage : « rewarded »', async () => {
    const ads = await started();
    const result = track(ads.showRewarded());
    await settle();
    emit(RewardAdPluginEvents.Showed);
    rewardCall?.resolve({ type: 'indice', amount: 1 });
    await settle();
    emit(RewardAdPluginEvents.Dismissed);
    await settle();
    expect(result.value).toBe('rewarded');
  });

  it('fermée sans récompense : « dismissed » après un court délai ; une récompense tardive compte encore', async () => {
    const ads = await started();
    const closed = track(ads.showRewarded());
    await settle();
    emit(RewardAdPluginEvents.Showed);
    emit(RewardAdPluginEvents.Dismissed);
    await settle();
    expect(closed.done).toBe(false);
    await advance(500);
    expect(closed.value).toBe('dismissed');

    const late = track(ads.showRewarded());
    await settle();
    emit(RewardAdPluginEvents.Showed);
    emit(RewardAdPluginEvents.Dismissed);
    await advance(200);
    emit(RewardAdPluginEvents.Rewarded, { type: 'indice', amount: 1 });
    await advance(500);
    expect(late.value).toBe('rewarded');
  });

  it('chargement en échec ou trop long (12 s) : « unavailable », rien d’affiché', async () => {
    const ads = await started();
    admob.prepareRewardVideoAd.mockRejectedValueOnce(Object.assign(new Error('No fill'), { code: '3' }));
    await expect(ads.showRewarded()).resolves.toBe('unavailable');

    admob.prepareRewardVideoAd.mockReturnValueOnce(new Promise(() => {}));
    const slow = track(ads.showRewarded());
    await advance(11_999);
    expect(slow.done).toBe(false);
    await advance(1);
    expect(slow.value).toBe('unavailable');
    expect(admob.showRewardVideoAd).not.toHaveBeenCalled();
  });

  it('échec d’affichage (FailedToShow) ou appel rejeté : « unavailable »', async () => {
    const ads = await started();
    const failed = track(ads.showRewarded());
    await settle();
    emit(RewardAdPluginEvents.FailedToShow, { code: 1, message: 'Ad expired' });
    await settle();
    expect(failed.value).toBe('unavailable');

    const rejected = track(ads.showRewarded());
    await settle();
    rewardCall?.reject(new Error('No Reward Video Ad can be shown.'));
    await settle();
    expect(rejected.value).toBe('unavailable');
    for (const event of REWARD_EVENTS) expect(listening(event)).toBe(0);
  });

  it('formulaire de consentement en échec : « unavailable », nouvel essai après 15 s', async () => {
    ump = consentInfo(AdmobConsentStatus.REQUIRED);
    admob.showConsentForm.mockRejectedValueOnce(new Error('Error when show consent form'));
    const ads = await started();
    await expect(ads.showRewarded()).resolves.toBe('unavailable');
    await expect(ads.showRewarded()).resolves.toBe('unavailable');
    expect(admob.showConsentForm).toHaveBeenCalledTimes(1);
    expect(admob.prepareRewardVideoAd).not.toHaveBeenCalled();

    await advance(15_000);
    const result = track(ads.showRewarded());
    await settle();
    expect(admob.showConsentForm).toHaveBeenCalledTimes(2);
    await watchToEnd();
    expect(result.value).toBe('rewarded');
  });

  it('app en arrière-plan : rien d’affiché ; la vidéo chargée sert à la demande suivante', async () => {
    ump = consentInfo(AdmobConsentStatus.REQUIRED);
    const ads = await started();
    setActive(false);
    await expect(ads.showRewarded()).resolves.toBe('unavailable');
    expect(admob.showConsentForm).not.toHaveBeenCalled();

    // Passée en arrière-plan pendant le chargement : vidéo gardée, pas montrée.
    setActive(true);
    const loading = deferred<{ adUnitId: string }>();
    admob.prepareRewardVideoAd.mockReturnValueOnce(loading.promise);
    const result = track(ads.showRewarded());
    await settle();
    setActive(false);
    loading.resolve({ adUnitId: AD_UNITS.rewarded });
    await settle();
    expect(result.value).toBe('unavailable');
    expect(admob.showRewardVideoAd).not.toHaveBeenCalled();

    setActive(true);
    const next = track(ads.showRewarded());
    await settle();
    expect(admob.prepareRewardVideoAd).toHaveBeenCalledTimes(1);
    await watchToEnd();
    expect(next.value).toBe('rewarded');
  });

  it('garde : affichée, la vidéo attend sa fermeture sans limite ; jamais affichée, « unavailable » après 15 s', async () => {
    const ads = await started();
    const watched = track(ads.showRewarded());
    await settle();
    emit(RewardAdPluginEvents.Showed);
    await advance(10 * 60_000);
    expect(watched.done).toBe(false);
    emit(RewardAdPluginEvents.Rewarded, { type: 'indice', amount: 1 });
    emit(RewardAdPluginEvents.Dismissed);
    await settle();
    expect(watched.value).toBe('rewarded');

    const lost = track(ads.showRewarded());
    await advance(14_999);
    expect(lost.done).toBe(false);
    await advance(1);
    expect(lost.value).toBe('unavailable');
    for (const event of REWARD_EVENTS) expect(listening(event)).toBe(0);
  });
});

describe('une annonce à la fois', () => {
  it('pendant le chargement d’une vidéo : interstitiel refusé, seconde vidéo indisponible', async () => {
    const ads = await started();
    ads.prepareInterstitial();
    await settle();
    const loading = deferred<{ adUnitId: string }>();
    admob.prepareRewardVideoAd.mockReturnValueOnce(loading.promise);

    const video = track(ads.showRewarded());
    await settle();
    await expect(ads.showInterstitial()).resolves.toBe(false);
    await expect(ads.showRewarded()).resolves.toBe('unavailable');
    expect(admob.showInterstitial).not.toHaveBeenCalled();

    loading.resolve({ adUnitId: AD_UNITS.rewarded });
    await settle();
    await watchToEnd();
    expect(video.value).toBe('rewarded');
    expect(admob.prepareRewardVideoAd).toHaveBeenCalledTimes(1);
  });

  it('pendant un interstitiel : vidéo indisponible', async () => {
    const ads = await started();
    ads.prepareInterstitial();
    await settle();
    const shown = track(ads.showInterstitial());
    await settle();
    await expect(ads.showRewarded()).resolves.toBe('unavailable');
    emit(InterstitialAdPluginEvents.Showed);
    emit(InterstitialAdPluginEvents.Dismissed);
    await settle();
    expect(shown.value).toBe(true);
  });
});

describe('interstitiel', () => {
  it('consentement requis : le formulaire remplace l’annonce la première fois, puis l’annonce si elle est prête', async () => {
    ump = consentInfo(AdmobConsentStatus.REQUIRED);
    const ads = await started();
    ads.prepareInterstitial();
    await settle();
    expect(admob.prepareInterstitial).not.toHaveBeenCalled();

    await expect(ads.showInterstitial()).resolves.toBe(false);
    expect(admob.showConsentForm).toHaveBeenCalledTimes(1);
    expect(admob.prepareInterstitial).not.toHaveBeenCalled();
    expect(admob.showInterstitial).not.toHaveBeenCalled();

    // Interstitiel suivant dû : préparé (consentement recueilli), puis montré.
    ads.prepareInterstitial();
    await settle();
    expect(admob.initialize).toHaveBeenCalledTimes(1);
    expect(admob.prepareInterstitial).toHaveBeenCalledExactlyOnceWith({ adId: AD_UNITS.interstitial, isTesting: AD_UNITS.testing });
    const shown = track(ads.showInterstitial());
    await settle();
    expect(admob.showInterstitial).toHaveBeenCalledTimes(1);
    expect(admob.showConsentForm).toHaveBeenCalledTimes(1);
    emit(InterstitialAdPluginEvents.Showed);
    await settle();
    expect(shown.done).toBe(false);
    emit(InterstitialAdPluginEvents.Dismissed);
    await settle();
    expect(shown.value).toBe(true);
  });

  it('jamais d’attente : pas prêt, faux tout de suite et chargement lancé pour la prochaine fois', async () => {
    const ads = await started();
    const loading = deferred<{ adUnitId: string }>();
    admob.prepareInterstitial.mockReturnValueOnce(loading.promise);
    await expect(ads.showInterstitial()).resolves.toBe(false);
    await settle();
    expect(admob.prepareInterstitial).toHaveBeenCalledTimes(1);
    // Encore en chargement : toujours sauté, sans second chargement.
    await expect(ads.showInterstitial()).resolves.toBe(false);
    await settle();
    expect(admob.prepareInterstitial).toHaveBeenCalledTimes(1);

    loading.resolve({ adUnitId: AD_UNITS.interstitial });
    await settle();
    const shown = track(ads.showInterstitial());
    await settle();
    emit(InterstitialAdPluginEvents.Showed);
    emit(InterstitialAdPluginEvents.Dismissed);
    await settle();
    expect(shown.value).toBe(true);
  });

  it('prepareInterstitial : un seul chargement pour une annonce prête ou en cours', async () => {
    const ads = await started();
    ads.prepareInterstitial();
    ads.prepareInterstitial();
    await settle();
    ads.prepareInterstitial();
    await settle();
    expect(admob.prepareInterstitial).toHaveBeenCalledTimes(1);
  });

  it('annonce expirée (plus de 50 min) : pas montrée, rechargée', async () => {
    const ads = await started();
    ads.prepareInterstitial();
    await settle();
    await advance(51 * 60_000);
    await expect(ads.showInterstitial()).resolves.toBe(false);
    await settle();
    expect(admob.prepareInterstitial).toHaveBeenCalledTimes(2);
    expect(admob.showInterstitial).not.toHaveBeenCalled();
  });

  it('échec d’affichage : faux ; jamais affiché : faux après 15 s ; affiché sans fermeture signalée : libéré après 5 min', async () => {
    const ads = await started();
    ads.prepareInterstitial();
    await settle();
    const failed = track(ads.showInterstitial());
    await settle();
    emit(InterstitialAdPluginEvents.FailedToShow, { code: 1, message: 'Ad expired' });
    await settle();
    expect(failed.value).toBe(false);

    ads.prepareInterstitial();
    await settle();
    const lost = track(ads.showInterstitial());
    await advance(15_000);
    expect(lost.value).toBe(false);

    ads.prepareInterstitial();
    await settle();
    const stuck = track(ads.showInterstitial());
    await settle();
    emit(InterstitialAdPluginEvents.Showed);
    await advance(5 * 60_000 - 1);
    expect(stuck.done).toBe(false);
    await advance(1);
    expect(stuck.value).toBe(true);
    expect(listening(InterstitialAdPluginEvents.Dismissed)).toBe(0);
  });

  it('app en arrière-plan : rien d’affiché (ni annonce, ni formulaire), l’annonce reste pour plus tard', async () => {
    const ads = await started();
    ads.prepareInterstitial();
    await settle();
    setActive(false);
    await expect(ads.showInterstitial()).resolves.toBe(false);
    expect(admob.showInterstitial).not.toHaveBeenCalled();
    setActive(true);
    const shown = track(ads.showInterstitial());
    await settle();
    emit(InterstitialAdPluginEvents.Showed);
    emit(InterstitialAdPluginEvents.Dismissed);
    await settle();
    expect(shown.value).toBe(true);
    expect(admob.prepareInterstitial).toHaveBeenCalledTimes(1);

    ump = consentInfo(AdmobConsentStatus.REQUIRED);
    const other = await started();
    setActive(false);
    await expect(other.showInterstitial()).resolves.toBe(false);
    expect(admob.showConsentForm).not.toHaveBeenCalled();
  });
});

describe('choix de confidentialité', () => {
  it('formulaire, consentement relu, annonces chargées jetées, abonnés prévenus', async () => {
    ump = consentInfo(AdmobConsentStatus.OBTAINED, { privacy: true });
    const ads = await started();
    expect(ads.privacyOptionsRequired()).toBe(true);
    ads.prepareInterstitial();
    await settle();
    expect(admob.prepareInterstitial).toHaveBeenCalledTimes(1);

    const changed = vi.fn();
    ads.onChange(changed);
    admob.showPrivacyOptionsForm.mockImplementationOnce(async () => {
      // Le joueur retire son consentement : plus de choix à revoir dans cet exemple fictif.
      ump = consentInfo(AdmobConsentStatus.OBTAINED, { privacy: false });
    });
    await ads.showPrivacyOptions();
    expect(admob.showPrivacyOptionsForm).toHaveBeenCalledTimes(1);
    expect(admob.requestConsentInfo).toHaveBeenCalledTimes(2);
    expect(ads.privacyOptionsRequired()).toBe(false);
    expect(changed).toHaveBeenCalled();

    // L'interstitiel chargé avec les anciens choix n'est pas montré : rechargé.
    await expect(ads.showInterstitial()).resolves.toBe(false);
    await settle();
    expect(admob.showInterstitial).not.toHaveBeenCalled();
    expect(admob.prepareInterstitial).toHaveBeenCalledTimes(2);
  });

  it('formulaire indisponible (hors ligne) : rien ne change', async () => {
    ump = consentInfo(AdmobConsentStatus.OBTAINED, { privacy: true });
    const ads = await started();
    const changed = vi.fn();
    ads.onChange(changed);
    admob.showPrivacyOptionsForm.mockRejectedValueOnce(new Error('Error when show privacy form'));
    await ads.showPrivacyOptions();
    expect(admob.requestConsentInfo).toHaveBeenCalledTimes(1);
    expect(changed).not.toHaveBeenCalled();
    expect(ads.privacyOptionsRequired()).toBe(true);
  });

  it('désabonnement : plus prévenu', async () => {
    const changed = vi.fn();
    const ads = createAdMobService();
    const off = ads.onChange(changed);
    off();
    await ads.start();
    expect(changed).not.toHaveBeenCalled();
  });
});
