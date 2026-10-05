/**
 * Couche plateforme (Android / Capacitor) : API publique.
 * Tout fonctionne sans effet (ou avec un repli) dans un navigateur ; rien ne lève d'erreur.
 * Le stockage local reste dans ./storage.
 */
export { initBackHandling, pushBackHandler } from './back';
export { getAppVersion, getSystemLanguages, isNativeAndroid } from './device';
export { getSystemPalettes, onSystemPalettesChanged } from './dynamicColor';
export { haptic, isHapticsEnabled, setHapticsEnabled } from './haptics';
export type { HapticKind } from './haptics';
export { onAppActiveChange } from './lifecycle';
export { applySystemBarsStyle } from './systemBars';
export type { SystemPalettes } from '../shared/systemPalettes';
