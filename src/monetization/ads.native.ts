/**
 * Publicités AdMob (Android) : consentement UMP au démarrage, puis SDK et préchargement.
 *
 * - Aucune annonce n'est demandée sans consentement exploitable (`canRequestAds`).
 * - La vidéo avec récompense : le plugin ne résout l'appel d'affichage qu'une fois la récompense
 *   gagnée ; une fermeture anticipée n'arrive que par l'événement `Dismissed`. Les deux sont écoutés.
 * - Une annonce chargée expire au bout d'une heure : elle est rechargée avant d'être montrée.
 */
import { AdMob, AdmobConsentStatus, InterstitialAdPluginEvents, RewardAdPluginEvents } from '@capacitor-community/admob';
import type { PluginListenerHandle } from '@capacitor/core';
import type { AdsService, RewardOutcome } from './ads';
import { AD_UNITS } from './config';

/** Durée de vie d'une annonce chargée (Google : 1 h), avec marge. */
const AD_TTL_MS = 50 * 60_000;
/** Attente maximale du chargement d'une vidéo demandée par le joueur. */
const LOAD_TIMEOUT_MS = 12_000;
/** Nouvelle tentative de consentement / démarrage après un échec (hors ligne…). */
const RETRY_AFTER_MS = 60_000;
/** Garde-fou : une annonce dont aucun événement de fin n'arrive libère l'affichage au bout de ce délai. */
const SHOW_GUARD_MS = 5 * 60_000;

const timeout = <T>(p: Promise<T>, ms: number, fallback: T) =>
  Promise.race([p, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);

const removeAll = (handles: readonly PluginListenerHandle[]) => {
  for (const h of handles) void h.remove().catch(() => {});
};

interface Slot {
  loading: Promise<boolean> | null;
  loadedAt: number | null;
}

export function createAdMobService(): AdsService {
  let started: Promise<boolean> | null = null;
  let lastAttempt = 0;
  let privacyRequired = false;
  let showing = false;
  const rewarded: Slot = { loading: null, loadedAt: null };
  const interstitial: Slot = { loading: null, loadedAt: null };
  const adOptions = (adId: string) => ({ adId, isTesting: AD_UNITS.testing });

  async function consent(): Promise<boolean> {
    let info = await AdMob.requestConsentInfo();
    if (info.isConsentFormAvailable && info.status === AdmobConsentStatus.REQUIRED) info = await AdMob.showConsentForm();
    // (Énumération non exportée par le plugin : comparaison sur sa valeur.)
    privacyRequired = String(info.privacyOptionsRequirementStatus) === 'REQUIRED';
    return info.canRequestAds;
  }

  async function init(): Promise<boolean> {
    lastAttempt = Date.now();
    try {
      if (!(await consent())) return false;
      await AdMob.initialize();
    } catch {
      return false;
    }
    void load(rewarded, () => AdMob.prepareRewardVideoAd(adOptions(AD_UNITS.rewarded)));
    void load(interstitial, () => AdMob.prepareInterstitial(adOptions(AD_UNITS.interstitial)));
    return true;
  }

  /** Démarré (consentement exploitable + SDK) ; retente après un échec. */
  async function ensureStarted(): Promise<boolean> {
    if (started && !(await started) && Date.now() - lastAttempt > RETRY_AFTER_MS) started = null;
    started ??= init();
    return started;
  }

  const fresh = (slot: Slot) => slot.loadedAt !== null && Date.now() - slot.loadedAt < AD_TTL_MS;

  function load(slot: Slot, prepare: () => Promise<unknown>): Promise<boolean> {
    if (fresh(slot)) return Promise.resolve(true);
    slot.loadedAt = null;
    slot.loading ??= prepare().then(
      () => {
        slot.loadedAt = Date.now();
        slot.loading = null;
        return true;
      },
      () => {
        slot.loading = null;
        return false;
      },
    );
    return slot.loading;
  }

  async function showRewarded(): Promise<RewardOutcome> {
    if (showing || !(await ensureStarted())) return 'unavailable';
    if (!(await timeout(load(rewarded, () => AdMob.prepareRewardVideoAd(adOptions(AD_UNITS.rewarded))), LOAD_TIMEOUT_MS, false))) return 'unavailable';
    showing = true;
    rewarded.loadedAt = null;
    const handles: PluginListenerHandle[] = [];
    try {
      return await new Promise<RewardOutcome>((resolve) => {
        let earned = false;
        let done = false;
        const finish = (outcome: RewardOutcome) => {
          if (done) return;
          done = true;
          resolve(outcome);
        };
        setTimeout(() => finish(earned ? 'rewarded' : 'dismissed'), SHOW_GUARD_MS);
        void Promise.all([
          AdMob.addListener(RewardAdPluginEvents.Rewarded, () => {
            earned = true;
          }),
          // La récompense peut arriver juste après la fermeture : on lui laisse un instant.
          AdMob.addListener(RewardAdPluginEvents.Dismissed, () => setTimeout(() => finish(earned ? 'rewarded' : 'dismissed'), 150)),
          AdMob.addListener(RewardAdPluginEvents.FailedToShow, () => finish(earned ? 'rewarded' : 'unavailable')),
        ]).then(
          (list) => {
            handles.push(...list);
            if (done) return;
            AdMob.showRewardVideoAd().then(
              () => {
                earned = true;
              },
              () => finish(earned ? 'rewarded' : 'unavailable'),
            );
          },
          () => finish('unavailable'),
        );
      });
    } finally {
      removeAll(handles);
      showing = false;
      void load(rewarded, () => AdMob.prepareRewardVideoAd(adOptions(AD_UNITS.rewarded)));
    }
  }

  async function showInterstitial(): Promise<boolean> {
    if (showing || !(await ensureStarted())) return false;
    const prepare = () => AdMob.prepareInterstitial(adOptions(AD_UNITS.interstitial));
    // Jamais d'attente : une annonce pas encore prête est simplement sautée (et préparée pour la suite).
    if (!fresh(interstitial)) {
      void load(interstitial, prepare);
      return false;
    }
    showing = true;
    interstitial.loadedAt = null;
    const handles: PluginListenerHandle[] = [];
    try {
      return await new Promise<boolean>((resolve) => {
        let done = false;
        const finish = (seen: boolean) => {
          if (done) return;
          done = true;
          resolve(seen);
        };
        setTimeout(() => finish(true), SHOW_GUARD_MS);
        void Promise.all([
          AdMob.addListener(InterstitialAdPluginEvents.Dismissed, () => finish(true)),
          AdMob.addListener(InterstitialAdPluginEvents.FailedToShow, () => finish(false)),
        ]).then(
          (list) => {
            handles.push(...list);
            if (!done) AdMob.showInterstitial().catch(() => finish(false));
          },
          () => finish(false),
        );
      });
    } finally {
      removeAll(handles);
      showing = false;
      void load(interstitial, prepare);
    }
  }

  return {
    start: async () => {
      await ensureStarted();
    },
    showRewarded,
    showInterstitial,
    privacyOptionsRequired: () => privacyRequired,
    showPrivacyOptions: async () => {
      try {
        await AdMob.showPrivacyOptionsForm();
        // Le choix a pu changer : l'état du consentement est relu (et le SDK démarré s'il le peut).
        started = null;
        await ensureStarted();
      } catch {
        // formulaire indisponible (hors ligne) : rien à faire
      }
    },
  };
}
