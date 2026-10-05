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

export interface AdsService {
  /** Consentement (UMP) puis démarrage du SDK et préchargement ; sans effet au-delà du premier appel. */
  start(): Promise<void>;
  /** Montre une vidéo avec récompense (chargée au besoin). */
  showRewarded(): Promise<RewardOutcome>;
  /** Montre l'interstitiel s'il est prêt (jamais d'attente) ; vrai s'il a été vu. */
  showInterstitial(): Promise<boolean>;
  /** Le joueur doit pouvoir revoir ses choix de confidentialité (UMP, EEE / Royaume-Uni…). */
  privacyOptionsRequired(): boolean;
  showPrivacyOptions(): Promise<void>;
}

export const NO_ADS: AdsService = {
  start: async () => {},
  showRewarded: async () => 'unavailable',
  showInterstitial: async () => false,
  privacyOptionsRequired: () => false,
  showPrivacyOptions: async () => {},
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
