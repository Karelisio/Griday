/**
 * Monétisation : réglages de build et limites de la version gratuite.
 *
 * - `VITE_ADS=false` produit un APK personnel sans publicité ni achat : tout y est débloqué.
 * - Blocs d'annonces : ceux de test de Google en développement et faute de variables
 *   d'environnement ; les vrais via `VITE_ADMOB_REWARDED_ID` / `VITE_ADMOB_INTERSTITIAL_ID`.
 *   (L'identifiant d'application AdMob, lu par Gradle, vient de `ADMOB_APP_ID`.)
 */

/** Publicités et achat Premium présents dans ce build. */
export const ADS_ENABLED = import.meta.env.VITE_ADS !== 'false';

/** Blocs de test officiels de Google (Android) : aucune impression réelle, aucun risque pour le compte. */
const TEST_UNITS = {
  rewarded: 'ca-app-pub-3940256099942544/5224354917',
  interstitial: 'ca-app-pub-3940256099942544/1033173712',
} as const;

const AD_UNIT_FORMAT = /^ca-app-pub-\d+\/\d+$/;

export interface AdUnits {
  readonly rewarded: string;
  readonly interstitial: string;
  /** Blocs de test : annonces marquées comme telles. */
  readonly testing: boolean;
}

/** Blocs réels seulement en production et s'ils sont tous fournis et bien formés. */
export function resolveAdUnits(env: { readonly dev: boolean; readonly rewarded?: string; readonly interstitial?: string }): AdUnits {
  const rewarded = env.rewarded?.trim() ?? '';
  const interstitial = env.interstitial?.trim() ?? '';
  if (env.dev || !AD_UNIT_FORMAT.test(rewarded) || !AD_UNIT_FORMAT.test(interstitial)) return { ...TEST_UNITS, testing: true };
  return { rewarded, interstitial, testing: false };
}

export const AD_UNITS: AdUnits = resolveAdUnits({
  dev: import.meta.env.DEV,
  rewarded: import.meta.env.VITE_ADMOB_REWARDED_ID,
  interstitial: import.meta.env.VITE_ADMOB_INTERSTITIAL_ID,
});

/** Produit non consommable « Premium » (Play Console). */
export const PREMIUM_PRODUCT_ID = import.meta.env.VITE_PREMIUM_PRODUCT_ID?.trim() || 'griday_premium';

/** Indices gratuits par grille ; au-delà, une vidéo par indice (illimités en Premium). */
export const FREE_HINTS_PER_PUZZLE = 2;
/** Archives jouables librement : les N derniers jours. Au-delà, une vidéo par jour (toutes en Premium). */
export const FREE_ARCHIVE_DAYS = 7;
/** Gel de série offert contre une vidéo (ou directement en Premium) : un tous les N jours. */
export const FREEZE_REWARD_EVERY_DAYS = 7;
/** Interstitiel en mode illimité : une partie résolue sur N. */
export const INTERSTITIAL_UNLIMITED_EVERY = 3;
/** Délai entre la victoire et l'interstitiel : l'animation de réussite se joue d'abord. */
export const INTERSTITIAL_DELAY_MS = 1600;
/** Page « Utiliser un code promo » du Play Store (les codes Premium s'y échangent). */
export const PLAY_REDEEM_URL = 'https://play.google.com/redeem';
