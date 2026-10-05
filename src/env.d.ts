/// <reference types="vite/client" />

/** Variables de build (fichier `.env` ou environnement de la CI). */
interface ImportMetaEnv {
  /** `false` : APK personnel sans publicité ni achat, tout est débloqué. */
  readonly VITE_ADS?: string;
  /** Blocs d'annonces AdMob réels (sinon : blocs de test de Google). */
  readonly VITE_ADMOB_REWARDED_ID?: string;
  readonly VITE_ADMOB_INTERSTITIAL_ID?: string;
  /** Identifiant du produit Premium dans la Play Console. */
  readonly VITE_PREMIUM_PRODUCT_ID?: string;
}
