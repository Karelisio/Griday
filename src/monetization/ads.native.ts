/**
 * Publicités AdMob (Android) : rien n'est chargé ni montré sans occasion réelle.
 *
 * - Lancement : état du consentement UMP relu en silence ; SDK démarré (contenu « PG » au plus) s'il
 *   le permet déjà. Ni formulaire, ni annonce préchargée.
 * - Formulaire de consentement (requis et jamais recueilli) au premier vrai besoin : vidéo demandée par
 *   le joueur, ou moment d'interstitiel (il remplace alors l'annonce).
 * - Une seule annonce (ou un seul formulaire) à la fois, jamais app en arrière-plan.
 * - Vidéo avec récompense : le plugin ne résout l'appel d'affichage qu'à la récompense gagnée ; une
 *   fermeture anticipée n'arrive que par l'événement `Dismissed`. Interstitiel : l'appel se résout dès
 *   l'affichage, la fin arrive par `Dismissed`. Les événements ne sont pas conservés par le plugin : les
 *   écouteurs sont posés avant l'affichage.
 * - Une annonce chargée expire au bout d'une heure : au-delà de 50 min, elle est rechargée.
 */
import {
  AdMob,
  AdmobConsentStatus,
  InterstitialAdPluginEvents,
  MaxAdContentRating,
  RewardAdPluginEvents,
  type AdmobConsentInfo,
} from '@capacitor-community/admob';
import type { PluginListenerHandle } from '@capacitor/core';
import { onAppActiveChange } from '../platform';
import type { AdsService, RewardOutcome } from './ads';
import { AD_UNITS } from './config';

/** Durée de vie d'une annonce chargée (Google : 1 h), avec marge. */
const AD_TTL_MS = 50 * 60_000;
/** Attente maximale de chaque étape (consentement relu, SDK, chargement) d'une vidéo demandée par le joueur. */
const STEP_TIMEOUT_MS = 12_000;
/** Après un échec (hors ligne…), nouvelle tentative de consentement ou de démarrage du SDK au plus à ce rythme. */
const RETRY_AFTER_MS = 15_000;
/** L'annonce doit s'afficher (`Showed`) dans ce délai après l'appel, sinon elle est tenue pour indisponible. */
const SHOWED_TIMEOUT_MS = 15_000;
/** Interstitiel affiché dont la fermeture ne serait jamais signalée : libéré au bout de ce délai (rien à perdre). */
const INTERSTITIAL_GUARD_MS = 5 * 60_000;
/** Vidéo fermée sans récompense : un instant de grâce pour une récompense signalée juste après. */
const LATE_REWARD_MS = 500;

type Timer = ReturnType<typeof setTimeout>;

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: Timer | undefined;
  const late = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}

function removeAll(handles: readonly PluginListenerHandle[]): void {
  for (const handle of handles) void Promise.resolve().then(() => handle.remove()).catch(() => {});
}

/** Écouteurs tous posés, ou aucun (ceux déjà posés sont retirés). */
async function listenAll(registrations: () => readonly Promise<PluginListenerHandle>[]): Promise<PluginListenerHandle[] | null> {
  let results: PromiseSettledResult<PluginListenerHandle>[];
  try {
    results = await Promise.allSettled(registrations());
  } catch {
    return null;
  }
  const handles = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
  if (handles.length === results.length) return handles;
  removeAll(handles);
  return null;
}

interface Consent {
  /** Annonces permises (consentement recueilli ou non requis). */
  readonly canRequestAds: boolean;
  /** Consentement requis et jamais recueilli : formulaire au premier vrai besoin. */
  readonly formRequired: boolean;
  /** Formulaire configuré et disponible. */
  readonly formAvailable: boolean;
  /** Le joueur doit pouvoir revoir ses choix (entrée des réglages). */
  readonly privacyRequired: boolean;
}

interface Slot {
  readonly prepare: () => Promise<unknown>;
  loading: Promise<boolean> | null;
  loadedAt: number | null;
  /** Incrémenté quand les annonces chargées sont jetées : un chargement en cours devient caduc. */
  generation: number;
}

export function createAdMobService(): AdsService {
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of listeners) {
      try {
        listener();
      } catch {
        // un abonné défaillant n'empêche pas les autres
      }
    }
  };

  let consent: Consent | null = null;
  let reading: Promise<boolean> | null = null;
  let initialized = false;
  let initializing: Promise<boolean> | null = null;
  let failedAt = -Infinity;
  let showing = false;
  // L'état courant n'est pas émis à l'abonnement : premier plan supposé.
  let active = true;
  onAppActiveChange((value) => {
    active = value;
  });

  const retryAllowed = () => Date.now() - failedAt >= RETRY_AFTER_MS;
  const adOptions = (adId: string) => ({ adId, isTesting: AD_UNITS.testing });
  const slot = (prepare: () => Promise<unknown>): Slot => ({ prepare, loading: null, loadedAt: null, generation: 0 });
  const rewarded = slot(() => AdMob.prepareRewardVideoAd(adOptions(AD_UNITS.rewarded)));
  const interstitial = slot(() => AdMob.prepareInterstitial(adOptions(AD_UNITS.interstitial)));

  function applyConsent(info: AdmobConsentInfo): void {
    const next: Consent = {
      canRequestAds: info.canRequestAds,
      formRequired: info.status === AdmobConsentStatus.REQUIRED,
      // (Absent de la réponse du formulaire : valeur précédente.)
      formAvailable: info.isConsentFormAvailable ?? consent?.formAvailable ?? true,
      // (Énumération non exportée par le plugin : comparaison sur sa valeur.)
      privacyRequired: String(info.privacyOptionsRequirementStatus) === 'REQUIRED',
    };
    const before = consent;
    consent = next;
    if (!before || (Object.keys(next) as (keyof Consent)[]).some((key) => next[key] !== before[key])) notify();
  }

  /** Relecture silencieuse de l'état du consentement (jamais de formulaire) ; vrai si elle a abouti. */
  function readConsent(): Promise<boolean> {
    reading ??= Promise.resolve()
      .then(() => AdMob.requestConsentInfo())
      .then(
        (info) => {
          applyConsent(info);
          return true;
        },
        () => {
          failedAt = Date.now();
          return false;
        },
      )
      .finally(() => {
        reading = null;
      });
    return reading;
  }

  /** Formulaire de consentement (UMP : montré seulement s'il est requis). */
  async function askConsent(): Promise<void> {
    try {
      applyConsent(await AdMob.showConsentForm());
    } catch {
      failedAt = Date.now();
    }
  }

  /** SDK démarré, une fois : contenu « tous publics, accord parental conseillé » au plus. */
  function initialize(): Promise<boolean> {
    if (initialized) return Promise.resolve(true);
    initializing ??= Promise.resolve()
      .then(() => AdMob.initialize({ maxAdContentRating: MaxAdContentRating.ParentalGuidance }))
      .then(
        () => {
          initialized = true;
          notify();
          return true;
        },
        () => {
          failedAt = Date.now();
          return false;
        },
      )
      .finally(() => {
        initializing = null;
      });
    return initializing;
  }

  const needsForm = () => consent !== null && consent.formRequired && consent.formAvailable;

  /**
   * Annonces permises et SDK démarré. Avec `form` (le joueur attend une annonce), le formulaire de
   * consentement est d'abord montré s'il est requis ; sans, rien n'est jamais affiché.
   */
  async function ensureReady(form: boolean): Promise<boolean> {
    if (!consent) {
      if (!reading && !retryAllowed()) return false;
      if (!(await withTimeout(readConsent(), STEP_TIMEOUT_MS, false))) return false;
    }
    if (form && needsForm() && active && retryAllowed()) await askConsent();
    if (!consent?.canRequestAds) return false;
    if (initialized) return true;
    if (!initializing && !retryAllowed()) return false;
    return withTimeout(initialize(), STEP_TIMEOUT_MS, false);
  }

  const fresh = (s: Slot) => s.loadedAt !== null && Date.now() - s.loadedAt < AD_TTL_MS;

  /** Annonce chargée et fraîche, ou chargement lancé (un seul à la fois) ; vrai une fois prête. */
  function load(s: Slot): Promise<boolean> {
    if (fresh(s)) return Promise.resolve(true);
    s.loadedAt = null;
    if (!s.loading) {
      const generation = s.generation;
      const loading: Promise<boolean> = Promise.resolve()
        .then(s.prepare)
        .then(
          () => {
            if (s.generation !== generation) return false;
            s.loadedAt = Date.now();
            return true;
          },
          () => false,
        )
        .finally(() => {
          if (s.loading === loading) s.loading = null;
        });
      s.loading = loading;
    }
    return s.loading;
  }

  /** Choix de confidentialité modifiés : annonces chargées (ou en chargement) avec les anciens jetées. */
  function discard(s: Slot): void {
    s.generation++;
    s.loading = null;
    s.loadedAt = null;
  }

  /** Interstitiel préparé si le consentement le permet déjà (jamais de formulaire) ; sans effet s'il est prêt. */
  function prepareInterstitial(): void {
    void ensureReady(false).then((ok) => (ok ? load(interstitial) : false));
  }

  /** Montre la vidéo chargée ; l'issue est connue à sa fermeture. */
  async function presentRewarded(): Promise<RewardOutcome> {
    let earned = false;
    let shown = false;
    let done = false;
    let guard: Timer | undefined;
    let settle: (outcome: RewardOutcome) => void = () => {};
    const outcome = new Promise<RewardOutcome>((resolve) => {
      settle = resolve;
    });
    const finish = (value: RewardOutcome) => {
      if (done) return;
      done = true;
      clearTimeout(guard);
      settle(value);
    };
    const earn = () => {
      earned = true;
    };
    const handles = await listenAll(() => [
      // Affichée : elle attend sa fermeture sans limite (une récompense méritée n'est jamais perdue).
      AdMob.addListener(RewardAdPluginEvents.Showed, () => {
        shown = true;
        clearTimeout(guard);
      }),
      AdMob.addListener(RewardAdPluginEvents.Rewarded, earn),
      AdMob.addListener(RewardAdPluginEvents.Dismissed, () => {
        clearTimeout(guard);
        if (earned) finish('rewarded');
        // La récompense peut être signalée juste après la fermeture : un instant de grâce.
        else guard = setTimeout(() => finish(earned ? 'rewarded' : 'dismissed'), LATE_REWARD_MS);
      }),
      AdMob.addListener(RewardAdPluginEvents.FailedToShow, () => finish(earned ? 'rewarded' : 'unavailable')),
    ]);
    if (!handles) return 'unavailable';
    // Jamais affichée dans le délai : tenue pour indisponible.
    guard = setTimeout(() => finish(earned ? 'rewarded' : 'unavailable'), SHOWED_TIMEOUT_MS);
    // L'appel ne se résout qu'à la récompense gagnée ; il échoue si la vidéo ne peut être montrée.
    Promise.resolve()
      .then(() => AdMob.showRewardVideoAd())
      .then(earn, () => {
        if (!shown) finish(earned ? 'rewarded' : 'unavailable');
      });
    try {
      return await outcome;
    } finally {
      removeAll(handles);
    }
  }

  /** Montre l'interstitiel chargé ; vrai s'il a été vu. */
  async function presentInterstitial(): Promise<boolean> {
    let shown = false;
    let done = false;
    let guard: Timer | undefined;
    let settle: (seen: boolean) => void = () => {};
    const outcome = new Promise<boolean>((resolve) => {
      settle = resolve;
    });
    const finish = (seen: boolean) => {
      if (done) return;
      done = true;
      clearTimeout(guard);
      settle(seen);
    };
    const handles = await listenAll(() => [
      AdMob.addListener(InterstitialAdPluginEvents.Showed, () => {
        shown = true;
        clearTimeout(guard);
        guard = setTimeout(() => finish(true), INTERSTITIAL_GUARD_MS);
      }),
      AdMob.addListener(InterstitialAdPluginEvents.Dismissed, () => finish(true)),
      AdMob.addListener(InterstitialAdPluginEvents.FailedToShow, () => finish(false)),
    ]);
    if (!handles) return false;
    guard = setTimeout(() => finish(shown), SHOWED_TIMEOUT_MS);
    // L'appel se résout dès l'affichage : seule la fermeture (`Dismissed`) termine l'interstitiel.
    Promise.resolve()
      .then(() => AdMob.showInterstitial())
      .catch(() => {
        if (!shown) finish(false);
      });
    try {
      return await outcome;
    } finally {
      removeAll(handles);
    }
  }

  async function showRewarded(): Promise<RewardOutcome> {
    if (showing) return 'unavailable';
    showing = true;
    try {
      if (!active || !(await ensureReady(true))) return 'unavailable';
      if (!(await withTimeout(load(rewarded), STEP_TIMEOUT_MS, false))) return 'unavailable';
      // Juste avant l'affichage : jamais en arrière-plan (la vidéo chargée reste pour la prochaine fois).
      if (!active) return 'unavailable';
      rewarded.loadedAt = null;
      return await presentRewarded();
    } finally {
      showing = false;
    }
  }

  async function showInterstitial(): Promise<boolean> {
    if (showing) return false;
    showing = true;
    try {
      if (!consent) {
        // Consentement encore inconnu (lancement hors ligne…) : relu en arrière-plan pour la prochaine fois.
        prepareInterstitial();
        return false;
      }
      if (needsForm()) {
        // Consentement jamais recueilli : le formulaire tient lieu d'interstitiel.
        if (active && retryAllowed()) await askConsent();
        return false;
      }
      if (!consent.canRequestAds) return false;
      if (!initialized || !fresh(interstitial)) {
        // Jamais d'attente : une annonce pas prête (ou expirée) est sautée et chargée pour la prochaine fois.
        prepareInterstitial();
        return false;
      }
      // Juste avant l'affichage : jamais en arrière-plan (l'annonce reste pour la prochaine fois).
      if (!active) return false;
      interstitial.loadedAt = null;
      return await presentInterstitial();
    } finally {
      showing = false;
    }
  }

  async function showPrivacyOptions(): Promise<void> {
    try {
      await AdMob.showPrivacyOptionsForm();
    } catch {
      return; // formulaire indisponible (hors ligne) : rien n'a changé
    }
    // Choix peut-être modifiés : annonces chargées avec les anciens jetées, consentement relu.
    discard(rewarded);
    discard(interstitial);
    await withTimeout(readConsent(), STEP_TIMEOUT_MS, false);
    notify();
  }

  return {
    start: async () => {
      await ensureReady(false);
    },
    showRewarded,
    prepareInterstitial,
    showInterstitial,
    privacyOptionsRequired: () => consent?.privacyRequired ?? false,
    showPrivacyOptions,
    onChange(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}
