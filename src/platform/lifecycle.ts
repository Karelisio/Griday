/** Cycle de vie : l'app est-elle au premier plan ? */
import { App } from '@capacitor/app';
import { isNativeAndroid } from './device';
import { subscribe } from './internal';

/**
 * Notifie chaque passage au premier plan (true) ou en arrière-plan (false).
 * Natif : événement `appStateChange` du plugin App. Web : `visibilitychange`.
 * L'état courant n'est pas émis à l'abonnement ; une même valeur peut se répéter.
 * Renvoie la fonction de désabonnement.
 */
export function onAppActiveChange(cb: (active: boolean) => void): () => void {
  if (isNativeAndroid()) {
    return subscribe(() => App.addListener('appStateChange', (state) => cb(state.isActive)));
  }
  if (typeof document === 'undefined') return () => {};
  const listener = (): void => cb(document.visibilityState === 'visible');
  document.addEventListener('visibilitychange', listener);
  return () => document.removeEventListener('visibilitychange', listener);
}
