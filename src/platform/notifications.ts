/**
 * Notifications locales du rappel quotidien (@capacitor/local-notifications, Android).
 * Rien ne lève d'erreur : un échec est signalé dans la console. Hors natif (navigateur), tout est sans effet.
 */
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

/** Autorisation d'afficher des notifications. `unavailable` : navigateur, ou plugin inutilisable. */
export type NotificationAccess = 'granted' | 'denied' | 'prompt' | 'unavailable';

/** Un rappel à programmer : l'identifiant du jour, l'instant d'envoi et un texte déjà traduit. */
export interface Reminder {
  /** Entier 32 bits stable pour un jour donné : sa date locale « AAAAMMJJ ». */
  readonly id: number;
  readonly at: Date;
  readonly title: string;
  readonly body: string;
}

/** `scheduled` : programmés ; `denied` : autorisation absente, rien programmé ; `unavailable` : navigateur ou erreur. */
export type ScheduleOutcome = 'scheduled' | 'denied' | 'unavailable';

const CHANNEL_ID = 'daily-reminder';
const SMALL_ICON = 'ic_stat_griday';
/** IMPORTANCE_DEFAULT : son et notification discrète, sans bandeau intrusif. */
const CHANNEL_IMPORTANCE = 3;

/** Nos identifiants sont des dates « AAAAMMJJ » : toute autre notification est laissée intacte. */
const isReminderId = (id: number): boolean => Number.isInteger(id) && id >= 19000101 && id <= 99991231;

/** Les notifications locales sont-elles utilisables ici (app Android, pas navigateur) ? */
export const notificationsAvailable = (): boolean => Capacitor.isNativePlatform();

/** Le plugin répond aussi `prompt-with-rationale` (refus unique sur Android) : c'est une demande encore possible. */
const toAccess = (display: string): NotificationAccess => (display === 'granted' || display === 'denied' ? display : 'prompt');

/** Autorisation actuelle, sans rien demander. */
export async function notificationPermission(): Promise<NotificationAccess> {
  if (!notificationsAvailable()) return 'unavailable';
  try {
    return toAccess((await LocalNotifications.checkPermissions()).display);
  } catch (error) {
    console.warn('Notifications : autorisation illisible', error);
    return 'unavailable';
  }
}

/** Demande l'autorisation (boîte de dialogue système sur Android 13+, sinon réponse immédiate). */
export async function requestNotificationPermission(): Promise<NotificationAccess> {
  if (!notificationsAvailable()) return 'unavailable';
  try {
    return toAccess((await LocalNotifications.requestPermissions()).display);
  } catch (error) {
    console.warn('Notifications : demande d’autorisation impossible', error);
    return 'unavailable';
  }
}

/** Annule les rappels déjà programmés (ceux de notre plage d'identifiants). */
export async function cancelReminders(): Promise<void> {
  if (!notificationsAvailable()) return;
  try {
    const { notifications } = await LocalNotifications.getPending();
    // Le plugin refuse une liste vide.
    const ids = notifications.map((n) => n.id).filter(isReminderId);
    if (ids.length > 0) await LocalNotifications.cancel({ notifications: ids.map((id) => ({ id })) });
  } catch (error) {
    console.warn('Notifications : annulation impossible', error);
  }
}

/**
 * Remplace les rappels programmés par `reminders` (`channelName` : nom localisé du canal Android).
 * Sans autorisation, ne programme rien : le plugin la réclamerait lui-même à l'utilisateur (Android 13+),
 * ce qui n'est acceptable qu'après un geste explicite (`requestNotificationPermission`).
 */
export async function scheduleReminders(reminders: readonly Reminder[], channelName: string): Promise<ScheduleOutcome> {
  const access = await notificationPermission();
  if (access === 'unavailable') return 'unavailable';
  if (access !== 'granted') return 'denied';
  try {
    await cancelReminders();
    if (reminders.length === 0) return 'scheduled';
    try {
      // Android 8+ : le canal est obligatoire (recréé à chaque fois, son nom suit la langue).
      await LocalNotifications.createChannel({ id: CHANNEL_ID, name: channelName, importance: CHANNEL_IMPORTANCE });
    } catch {
      // Android 7 n'a pas de canaux : le plugin y rejette l'appel, les notifications s'affichent sans.
    }
    await LocalNotifications.schedule({
      notifications: reminders.map(({ id, at, title, body }) => ({
        id,
        title,
        body,
        schedule: { at, allowWhileIdle: true },
        channelId: CHANNEL_ID,
        smallIcon: SMALL_ICON,
        // Alarme inexacte : Google Play réserve les exactes aux réveils et agendas (permission retirée du manifeste).
        // Par défaut, le plugin ouvrirait à chaque programmation les réglages « Alarmes et rappels » pour l'obtenir.
        isExactNotification: false,
      })),
    });
    return 'scheduled';
  } catch (error) {
    console.warn('Notifications : programmation impossible', error);
    return 'unavailable';
  }
}
