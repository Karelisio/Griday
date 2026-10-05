/**
 * Publicités : interface commune et choix de l'implémentation.
 * Android : AdMob (consentement UMP, vidéo avec récompense, interstitiel), chargé à la demande.
 * Ailleurs (navigateur, tests) : aucune annonce — sauf en développement, où une vidéo simulée
 * permet d'essayer les parcours récompensés.
 */
import { isNativeAndroid } from '../platform';
import { ADS_ENABLED } from './config';

/** Issue d'une vidéo avec récompense. */
export type RewardOutcome = 'rewarded' | 'dismissed' | 'unavailable';

/**
 * Rien n'est chargé ni affiché sans une occasion réelle : pas de formulaire au lancement, pas
 * d'annonce préchargée tant qu'aucune n'est due (Premium : jamais).
 */
export interface AdsService {
  /** Lancement : état du consentement relu en silence (aucun formulaire, aucune annonce chargée). */
  start(): Promise<void>;
  /**
   * Vidéo avec récompense demandée par le joueur : consentement d'abord (formulaire s'il est requis et
   * jamais recueilli), puis chargement et affichage.
   */
  showRewarded(): Promise<RewardOutcome>;
  /** Un interstitiel est dû (partie résolue) : à charger dès maintenant si le consentement le permet déjà. */
  prepareInterstitial(): void;
  /**
   * Moment d'interstitiel (transition voulue par le joueur) : le formulaire de consentement s'il est requis
   * et jamais recueilli (à la place de l'annonce), sinon l'interstitiel s'il est prêt — jamais d'attente de
   * chargement. Vrai si une annonce a été vue.
   */
  showInterstitial(): Promise<boolean>;
  /** Le joueur doit pouvoir revoir ses choix de confidentialité (UMP, EEE / Royaume-Uni…). */
  privacyOptionsRequired(): boolean;
  showPrivacyOptions(): Promise<void>;
  /** État modifié (consentement recueilli, choix de confidentialité exigés…). Renvoie le désabonnement. */
  onChange(listener: () => void): () => void;
}

export const NO_ADS: AdsService = {
  start: async () => {},
  showRewarded: async () => 'unavailable',
  prepareInterstitial: () => {},
  showInterstitial: async () => false,
  privacyOptionsRequired: () => false,
  showPrivacyOptions: async () => {},
  onChange: () => () => {},
};

/** Développement dans le navigateur : vidéo simulée (une seconde), pas d'interstitiel. */
const DEV_ADS: AdsService = {
  ...NO_ADS,
  showRewarded: () => new Promise((resolve) => setTimeout(() => resolve('rewarded'), 1000)),
};

let override: AdsService | null = null;

/** Tests : remplace l'implémentation (null : retour au choix normal). */
export function setAdsServiceForTesting(service: AdsService | null): void {
  override = service;
}

let native: Promise<AdsService> | null = null;

export function getAdsService(): Promise<AdsService> {
  if (override) return Promise.resolve(override);
  if (!ADS_ENABLED) return Promise.resolve(NO_ADS);
  if (!isNativeAndroid()) return Promise.resolve(import.meta.env.DEV && import.meta.env.MODE !== 'test' ? DEV_ADS : NO_ADS);
  native ??= import('./ads.native').then((m) => m.createAdMobService(), () => NO_ADS);
  return native;
}
