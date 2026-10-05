/** Rappel quotidien côté React : synchronisation des notifications programmées, activation avec autorisation, événements (rappel ouvert, autorisation retirée). */
import type { TFunction } from 'i18next';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SCHEDULE } from '../../engine/config';
import { dayNumber } from '../../engine/core/schedule';
import type { Language } from '../i18n';
import { onAppActiveChange } from '../platform';
import {
  cancelReminders,
  clearDeliveredReminders,
  notificationPermission,
  onReminderOpened,
  requestNotificationPermission,
  scheduleReminders,
} from '../platform/notifications';
import { useProgress } from '../progress/ProgressContext';
import { useSettings } from '../settings/SettingsContext';
import type { Settings } from '../settings/types';
import { planReminders } from './plan';

/** Regroupe les changements rapprochés (démarrage, langue, réglages en rafale) en une seule programmation. */
export const SYNC_DELAY_MS = 500;

interface Snapshot {
  readonly reminder: boolean;
  readonly time: string;
  readonly todaySolved: boolean;
  readonly streak: number;
  readonly t: TFunction;
  readonly lang: Language;
  readonly update: (patch: Partial<Settings>) => void;
}

/** Abonnés à la coupure automatique du rappel (voir `useReminderRevoked`). */
const revokedListeners = new Set<() => void>();

/** Aligne les notifications programmées sur la situation courante (jamais d'erreur levée). */
async function sync({ reminder, time, todaySolved, streak, t, lang, update }: Snapshot): Promise<void> {
  try {
    if (!reminder) {
      await cancelReminders();
    } else {
      const plan = planReminders({ now: new Date(), time, todaySolved, streak, dayNumberOf: (date) => dayNumber(SCHEDULE, date), t, lang });
      // Autorisation retirée dans les réglages d'Android : le réglage reflète la réalité (il suffira de le réactiver), et l'on prévient.
      if ((await scheduleReminders(plan, t('reminder.title'))) === 'denied') {
        update({ reminder: false });
        for (const listener of revokedListeners) listener();
      }
    }
    // Puzzle du jour résolu : les rappels déjà affichés (d'aujourd'hui ou des jours passés) n'ont plus lieu d'être.
    if (todaySolved) await clearDeliveredReminders();
  } catch (error) {
    console.warn('Rappel : synchronisation impossible', error);
  }
}

/**
 * Exécute `job` sans jamais le chevaucher : une demande reçue pendant une exécution n'en déclenche qu'une
 * seule autre, à la fin de celle-ci (le travail relit alors la situation la plus récente). `job` ne lève pas.
 */
function serialized(job: () => Promise<void>): () => void {
  let running = false;
  let again = false;
  return () => {
    if (running) {
      again = true;
      return;
    }
    running = true;
    void (async () => {
      try {
        do {
          again = false;
          await job();
        } while (again);
      } finally {
        running = false;
      }
    })();
  };
}

/**
 * Garde les notifications programmées à jour : au démarrage (progression chargée), quand le rappel, son heure
 * ou la langue changent, quand le puzzle du jour est résolu, la série évolue, un nouveau jour commence et
 * au retour au premier plan (la fenêtre de rappels glisse). À monter une fois, sous les fournisseurs de
 * réglages, de progression et de traduction.
 */
export function useReminderSync(): void {
  const { settings, update } = useSettings();
  const { ready, today, summary } = useProgress();
  const { t, i18n } = useTranslation();
  const lang = i18n.language as Language;
  const [resumes, setResumes] = useState(0);

  // La synchronisation lit la situation au moment de s'exécuter : jamais un état périmé.
  const snapshot: Snapshot = {
    reminder: settings.reminder,
    time: settings.reminderTime,
    todaySolved: summary.todaySolved,
    streak: summary.current,
    t,
    lang,
    update,
  };
  const latest = useRef(snapshot);
  latest.current = snapshot;
  const request = useMemo(() => serialized(() => sync(latest.current)), []);

  useEffect(() => onAppActiveChange((active) => active && setResumes((n) => n + 1)), []);

  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(request, SYNC_DELAY_MS);
    return () => clearTimeout(timer);
    // `today` et `resumes` ne servent que de déclencheurs : nouveau jour, retour au premier plan.
  }, [request, ready, settings.reminder, settings.reminderTime, lang, today, summary.todaySolved, summary.current, resumes]);
}

/** Référence toujours sur la dernière valeur reçue : un abonnement fait une seule fois ne garde pas une fonction périmée. */
function useLatest<T>(value: T): { readonly current: T } {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

/**
 * Appelle `callback` quand `useReminderSync` désactive le rappel parce qu'Android a retiré l'autorisation
 * d'afficher des notifications (le réglage est alors déjà repassé à « désactivé ») : de quoi en informer
 * l'utilisateur. À monter où l'on peut afficher un message, sans ordre à respecter avec `useReminderSync`.
 */
export function useReminderRevoked(callback: () => void): void {
  const latest = useLatest(callback);
  useEffect(() => {
    const listener = () => latest.current();
    revokedListeners.add(listener);
    return () => void revokedListeners.delete(listener);
  }, [latest]);
}

/**
 * Appelle `callback` quand l'utilisateur ouvre l'app en touchant un rappel, app au premier plan, en arrière-plan
 * ou fermée (le démarrage à froid est signalé dès le montage). À monter une fois, là où l'on peut changer
 * d'onglet et refermer les pages secondaires.
 */
export function useReminderOpened(callback: () => void): void {
  const latest = useLatest(callback);
  useEffect(() => onReminderOpened(() => latest.current()), [latest]);
}

export type EnableOutcome = 'enabled' | 'denied' | 'unavailable';

/**
 * Renvoie la fonction qui active le rappel : demande l'autorisation d'afficher des notifications si besoin,
 * puis enregistre le choix (`reminderPrompted` : le rappel a été proposé, inutile de le reproposer).
 * Refus : le rappel reste désactivé.
 */
export function useEnableReminder(): () => Promise<EnableOutcome> {
  const { update } = useSettings();
  return useCallback(async () => {
    let access = await notificationPermission();
    if (access !== 'granted' && access !== 'unavailable') access = await requestNotificationPermission();
    if (access === 'unavailable') return 'unavailable';
    if (access !== 'granted') {
      update({ reminderPrompted: true });
      return 'denied';
    }
    update({ reminder: true, reminderPrompted: true });
    return 'enabled';
  }, [update]);
}
