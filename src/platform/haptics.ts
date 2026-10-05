/** Retours haptiques (vibrations) : sans effet hors natif ou si l'utilisateur les a désactivés. */
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { attempt } from './internal';

export type HapticKind = 'tap' | 'select' | 'success' | 'warning' | 'error' | 'heavy';

let enabled = true;

/** Reflète le réglage « vibrations » (à appeler au chargement des réglages puis à chaque changement). */
export function setHapticsEnabled(value: boolean): void {
  enabled = value;
}

export function isHapticsEnabled(): boolean {
  return enabled;
}

/**
 * Déclenche une vibration. Sans effet hors natif ou si désactivé ; ne lève jamais.
 * La promesse renvoyée peut être ignorée.
 */
export async function haptic(kind: HapticKind): Promise<void> {
  if (!enabled || !Capacitor.isNativePlatform()) return;
  await attempt(() => play(kind));
}

async function play(kind: HapticKind): Promise<void> {
  switch (kind) {
    case 'tap':
      return Haptics.impact({ style: ImpactStyle.Light });
    case 'heavy':
      return Haptics.impact({ style: ImpactStyle.Heavy });
    case 'select':
      // Sur Android, selectionChanged() est ignoré tant que selectionStart() n'a pas été appelé.
      // Les deux messages partent dans l'ordre et sont traités dans l'ordre côté natif.
      await Promise.all([Haptics.selectionStart(), Haptics.selectionChanged()]);
      return;
    case 'success':
      return Haptics.notification({ type: NotificationType.Success });
    case 'warning':
      return Haptics.notification({ type: NotificationType.Warning });
    case 'error':
      return Haptics.notification({ type: NotificationType.Error });
  }
}
