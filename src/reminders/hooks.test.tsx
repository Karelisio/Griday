import { act, render, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { addDays, type ISODate } from '../../engine/core/date';
import { initI18n, setLanguage } from '../i18n';
import type { Reminder } from '../platform/notifications';
import { ProgressProvider, useProgress } from '../progress/ProgressContext';
import type { ProgressData } from '../progress/store';
import { EMPTY_STREAK } from '../progress/streak';
import type { DailyResult } from '../progress/types';
import { SettingsProvider, useSettings } from '../settings/SettingsContext';
import { DEFAULT_SETTINGS, type Settings } from '../settings/types';
import { SYNC_DELAY_MS, useEnableReminder, useReminderOpened, useReminderRevoked, useReminderSync } from './hooks';

const h = vi.hoisted(() => ({
  notificationsAvailable: vi.fn(),
  notificationPermission: vi.fn(),
  requestNotificationPermission: vi.fn(),
  scheduleReminders: vi.fn(),
  cancelReminders: vi.fn(),
  clearDeliveredReminders: vi.fn(),
  onReminderOpened: vi.fn(),
  /** Chargement de la progression : remplacé par une promesse en attente pour tester l'état « non chargé ». */
  loadProgress: undefined as (() => Promise<unknown>) | undefined,
}));

vi.mock('../platform/notifications', () => ({
  notificationsAvailable: h.notificationsAvailable,
  notificationPermission: h.notificationPermission,
  requestNotificationPermission: h.requestNotificationPermission,
  scheduleReminders: h.scheduleReminders,
  cancelReminders: h.cancelReminders,
  clearDeliveredReminders: h.clearDeliveredReminders,
  onReminderOpened: h.onReminderOpened,
}));
vi.mock('../progress/store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../progress/store')>();
  return { ...actual, loadProgressData: () => (h.loadProgress ?? actual.loadProgressData)() };
});

beforeAll(async () => {
  await initI18n('fr');
});
beforeEach(async () => {
  localStorage.clear();
  h.loadProgress = undefined;
  h.notificationsAvailable.mockReset().mockReturnValue(true);
  h.notificationPermission.mockReset().mockResolvedValue('granted');
  h.requestNotificationPermission.mockReset().mockResolvedValue('granted');
  h.scheduleReminders.mockReset().mockResolvedValue('scheduled');
  h.cancelReminders.mockReset().mockResolvedValue(undefined);
  h.clearDeliveredReminders.mockReset().mockResolvedValue(undefined);
  h.onReminderOpened.mockReset().mockReturnValue(() => undefined);
  await setLanguage('fr');
});

const TODAY = '2026-10-05';
const solved = (date: ISODate): DailyResult => ({ date, size: 6, tier: 1, timeMs: 60_000, hintsUsed: 0, mode: 'daily', solvedOn: date });
const progress = (...days: ISODate[]): ProgressData => ({
  history: new Map(days.map((d) => [d, solved(d)])),
  unlimited: [],
  streak: EMPTY_STREAK,
});

describe('useReminderSync', () => {
  let settingsApi!: ReturnType<typeof useSettings>;
  let progressApi!: ReturnType<typeof useProgress>;
  /** Appelée quand le rappel est coupé parce qu'Android a retiré l'autorisation. */
  const revoked = vi.fn();
  function Probe({ onRevoked }: { onRevoked: () => void }) {
    useReminderSync();
    useReminderRevoked(onRevoked);
    settingsApi = useSettings();
    progressApi = useProgress();
    return null;
  }
  /** `initial` nul : la progression se charge comme dans l'app (voir `h.loadProgress`). */
  const tree = (settings: Partial<Settings>, initial: ProgressData | null, onRevoked: () => void = revoked) => (
    <SettingsProvider initial={{ ...DEFAULT_SETTINGS, language: 'fr', reminder: true, ...settings }}>
      <ProgressProvider initial={initial ?? undefined}>
        <Probe onRevoked={onRevoked} />
      </ProgressProvider>
    </SettingsProvider>
  );
  const mount = (settings: Partial<Settings> = {}, initial: ProgressData | null = progress()) => render(tree(settings, initial));
  /** Laisse s'écouler le délai de regroupement, puis les appels qui en découlent. */
  const settle = (ms = SYNC_DELAY_MS + 100) =>
    act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  const lastCall = () => {
    const [plan, channel] = h.scheduleReminders.mock.calls.at(-1) as [Reminder[], string];
    return { plan, channel };
  };
  const setVisibility = (state: 'visible' | 'hidden') =>
    act(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
      document.dispatchEvent(new Event('visibilitychange'));
    });

  beforeEach(() => {
    vi.useFakeTimers({ now: new Date(2026, 9, 5, 10, 30), toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    revoked.mockReset();
  });
  afterEach(() => {
    Reflect.deleteProperty(document, 'visibilityState');
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('rappel activé : programme 14 jours de rappels, canal au nom localisé', async () => {
    mount();
    expect(h.scheduleReminders).not.toHaveBeenCalled(); // regroupement : pas d'appel natif au premier rendu
    await settle();
    expect(h.scheduleReminders).toHaveBeenCalledTimes(1);
    const { plan, channel } = lastCall();
    expect(channel).toBe('Rappel quotidien');
    expect(plan).toHaveLength(14);
    expect(plan[0]!.id).toBe(20261005);
    expect(plan[0]!.at).toEqual(new Date(2026, 9, 5, 19, 0));
    expect(plan[0]!.title).toBe('Le puzzle n° 1 est prêt');
    expect(h.cancelReminders).not.toHaveBeenCalled();
    expect(h.clearDeliveredReminders).not.toHaveBeenCalled(); // puzzle du jour pas résolu : les rappels affichés restent
    expect(revoked).not.toHaveBeenCalled();
  });

  it('rappel désactivé : annule ce qui était programmé, ne programme rien', async () => {
    mount({ reminder: false });
    await settle();
    expect(h.cancelReminders).toHaveBeenCalledTimes(1);
    expect(h.scheduleReminders).not.toHaveBeenCalled();
    expect(h.clearDeliveredReminders).not.toHaveBeenCalled();
    expect(revoked).not.toHaveBeenCalled();
  });

  it('progression pas encore chargée : rien avant la fin du chargement', async () => {
    let finish!: (data: ProgressData) => void;
    h.loadProgress = () => new Promise((resolve) => (finish = resolve));
    mount({}, null);
    await settle(5_000);
    expect(progressApi.ready).toBe(false);
    expect(h.scheduleReminders).not.toHaveBeenCalled();
    expect(h.cancelReminders).not.toHaveBeenCalled();

    await act(async () => finish(progress(addDays(TODAY, -1), addDays(TODAY, -2))));
    await settle();
    expect(progressApi.ready).toBe(true);
    expect(h.scheduleReminders).toHaveBeenCalledTimes(1);
    expect(lastCall().plan[0]!.body).toBe('Gardez votre série de 2 jours 🔥');
  });

  it('changements rapprochés : une seule programmation, avec les dernières valeurs', async () => {
    mount();
    await settle();
    h.scheduleReminders.mockClear();
    for (const time of ['20:00', '20:30', '21:15']) {
      act(() => settingsApi.update({ reminderTime: time }));
      await settle(100);
    }
    expect(h.scheduleReminders).not.toHaveBeenCalled();
    await settle();
    expect(h.scheduleReminders).toHaveBeenCalledTimes(1);
    expect(lastCall().plan[0]!.at).toEqual(new Date(2026, 9, 5, 21, 15));
  });

  it('heure modifiée : reprogrammation (heure déjà passée aujourd’hui : dès demain)', async () => {
    mount();
    await settle();
    act(() => settingsApi.update({ reminderTime: '08:15' }));
    await settle();
    expect(h.scheduleReminders).toHaveBeenCalledTimes(2);
    expect(lastCall().plan[0]!.at).toEqual(new Date(2026, 9, 6, 8, 15));
  });

  it('langue modifiée : textes et nom du canal reprogrammés dans la nouvelle langue', async () => {
    mount();
    await settle();
    await act(async () => setLanguage('en'));
    await settle();
    expect(h.scheduleReminders).toHaveBeenCalledTimes(2);
    const { plan, channel } = lastCall();
    expect(channel).toBe('Daily reminder');
    expect(plan[0]!.title).toBe('Puzzle #1 is ready');
    expect(plan[0]!.body).toBe('A fresh grid to solve in a few minutes.');
  });

  it('puzzle du jour résolu : le rappel d’aujourd’hui disparaît, la série (aujourd’hui compris) est défendue', async () => {
    mount({}, progress(addDays(TODAY, -3), addDays(TODAY, -2), addDays(TODAY, -1)));
    await settle();
    expect(lastCall().plan[0]!.id).toBe(20261005);
    expect(lastCall().plan[0]!.body).toBe('Gardez votre série de 3 jours 🔥');

    expect(h.clearDeliveredReminders).not.toHaveBeenCalled();

    act(() => void progressApi.recordDaily(solved(TODAY)));
    await settle();
    expect(h.scheduleReminders).toHaveBeenCalledTimes(2);
    const { plan } = lastCall();
    expect(plan).toHaveLength(14);
    expect(plan[0]!.id).toBe(20261006);
    expect(plan[0]!.body).toBe('Gardez votre série de 4 jours 🔥');
    expect(plan[1]!.body).toBe('Une nouvelle grille à résoudre en quelques minutes.');
  });

  it('puzzle du jour résolu : les rappels déjà affichés sont retirés, une fois les rappels programmés remplacés', async () => {
    mount();
    await settle();
    expect(h.clearDeliveredReminders).not.toHaveBeenCalled();

    act(() => void progressApi.recordDaily(solved(TODAY)));
    await settle();
    expect(h.clearDeliveredReminders).toHaveBeenCalledTimes(1);
    // Un rappel du jour qui se déclencherait pendant la synchronisation serait retiré lui aussi.
    expect(h.scheduleReminders.mock.invocationCallOrder[1]).toBeLessThan(h.clearDeliveredReminders.mock.invocationCallOrder[0]!);
  });

  it('puzzle déjà résolu au démarrage : rappels affichés retirés dès la première synchronisation', async () => {
    mount({}, progress(TODAY));
    await settle();
    expect(h.clearDeliveredReminders).toHaveBeenCalledTimes(1);
    expect(lastCall().plan[0]!.id).toBe(20261006);
  });

  it('puzzle du jour résolu, rappel désactivé : annulation, et rappels affichés retirés quand même', async () => {
    mount({ reminder: false }, progress(TODAY));
    await settle();
    expect(h.cancelReminders).toHaveBeenCalledTimes(1);
    expect(h.scheduleReminders).not.toHaveBeenCalled();
    expect(h.clearDeliveredReminders).toHaveBeenCalledTimes(1);
  });

  it('retrait des rappels affichés en échec : avertissement, la file continue de fonctionner', async () => {
    h.clearDeliveredReminders.mockRejectedValueOnce(new Error('boom'));
    mount({}, progress(TODAY));
    await settle();
    expect(console.warn).toHaveBeenCalledTimes(1);
    act(() => settingsApi.update({ reminderTime: '20:00' }));
    await settle();
    expect(h.scheduleReminders).toHaveBeenCalledTimes(2);
    expect(h.clearDeliveredReminders).toHaveBeenCalledTimes(2);
  });

  it('rappel désactivé ensuite : annulation, plus de programmation', async () => {
    mount();
    await settle();
    act(() => settingsApi.update({ reminder: false }));
    await settle();
    expect(h.cancelReminders).toHaveBeenCalledTimes(1);
    expect(h.scheduleReminders).toHaveBeenCalledTimes(1);
  });

  it('retour au premier plan : nouvelle synchronisation (la fenêtre de rappels glisse)', async () => {
    mount();
    await settle();
    await setVisibility('hidden');
    await settle();
    expect(h.scheduleReminders).toHaveBeenCalledTimes(1);
    await setVisibility('visible');
    await settle();
    expect(h.scheduleReminders).toHaveBeenCalledTimes(2);
  });

  it('nouveau jour à minuit : fenêtre reprogrammée à partir du jour qui commence', async () => {
    vi.setSystemTime(new Date(2026, 9, 5, 23, 58));
    mount({ reminderTime: '23:59' });
    await settle();
    expect(lastCall().plan[0]!.id).toBe(20261005);
    await settle(130_000); // minuit passé : useToday change de jour
    await settle(); // puis délai de regroupement
    expect(h.scheduleReminders).toHaveBeenCalledTimes(2);
    expect(lastCall().plan[0]!.id).toBe(20261006);
    expect(lastCall().plan[13]!.id).toBe(20261019);
  });

  it('appels natifs jamais entrelacés : les demandes reçues pendant une synchronisation n’en déclenchent qu’une autre', async () => {
    let finish!: (outcome: string) => void;
    h.scheduleReminders.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    mount();
    await settle();
    expect(h.scheduleReminders).toHaveBeenCalledTimes(1); // bloquée dans le plugin

    act(() => settingsApi.update({ reminderTime: '21:15' }));
    await settle();
    act(() => settingsApi.update({ reminderTime: '21:45' }));
    await settle();
    expect(h.scheduleReminders).toHaveBeenCalledTimes(1); // délais écoulés, mais la première n'a pas fini
    expect(h.cancelReminders).not.toHaveBeenCalled();

    await act(async () => finish('scheduled'));
    expect(h.scheduleReminders).toHaveBeenCalledTimes(2); // une seule reprise, avec la situation la plus récente
    expect(lastCall().plan[0]!.at).toEqual(new Date(2026, 9, 5, 21, 45));
    await settle();
    expect(h.scheduleReminders).toHaveBeenCalledTimes(2);
  });

  it('rappel désactivé pendant une synchronisation : l’annulation attend la fin de celle-ci', async () => {
    let finish!: (outcome: string) => void;
    h.scheduleReminders.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    mount();
    await settle();
    act(() => settingsApi.update({ reminder: false }));
    await settle();
    expect(h.cancelReminders).not.toHaveBeenCalled();

    await act(async () => finish('scheduled'));
    expect(h.cancelReminders).toHaveBeenCalledTimes(1);
    expect(h.scheduleReminders.mock.invocationCallOrder[0]).toBeLessThan(h.cancelReminders.mock.invocationCallOrder[0]!);
    expect(h.scheduleReminders).toHaveBeenCalledTimes(1);
  });

  it('autorisation retirée dans les réglages d’Android : le rappel est désactivé (et annulé)', async () => {
    h.scheduleReminders.mockResolvedValueOnce('denied');
    mount();
    await settle();
    expect(settingsApi.settings.reminder).toBe(false);
    expect(revoked).toHaveBeenCalledTimes(1); // l'utilisateur en est informé
    await settle();
    expect(h.cancelReminders).toHaveBeenCalledTimes(1);
    expect(h.scheduleReminders).toHaveBeenCalledTimes(1);
    expect(revoked).toHaveBeenCalledTimes(1); // une seule fois : le réglage est désormais coupé
  });

  it('autorisation retirée : c’est la dernière fonction reçue qui est prévenue', async () => {
    h.scheduleReminders.mockResolvedValueOnce('denied');
    const view = mount();
    const later = vi.fn();
    view.rerender(tree({}, progress(), later));
    await settle();
    expect(later).toHaveBeenCalledTimes(1);
    expect(revoked).not.toHaveBeenCalled();
  });

  it('autorisation retirée pendant la synchronisation, composant démonté : plus personne n’est prévenu', async () => {
    let finish!: (outcome: string) => void;
    h.scheduleReminders.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    const view = mount();
    await settle();
    view.unmount();
    await act(async () => finish('denied'));
    expect(revoked).not.toHaveBeenCalled();
  });

  it('navigateur ou plugin indisponible : le réglage est conservé, personne n’est prévenu', async () => {
    h.scheduleReminders.mockResolvedValue('unavailable');
    mount();
    await settle();
    expect(settingsApi.settings.reminder).toBe(true);
    expect(revoked).not.toHaveBeenCalled();
  });

  it('erreur inattendue : avertissement, la file continue de fonctionner', async () => {
    h.scheduleReminders.mockRejectedValueOnce(new Error('boom'));
    mount();
    await settle();
    expect(console.warn).toHaveBeenCalledTimes(1);
    act(() => settingsApi.update({ reminderTime: '20:00' }));
    await settle();
    expect(h.scheduleReminders).toHaveBeenCalledTimes(2);
    expect(lastCall().plan[0]!.at).toEqual(new Date(2026, 9, 5, 20, 0));
  });

  it('démontage avant la fin du délai : rien n’est programmé', async () => {
    const view = mount();
    view.unmount();
    await settle();
    expect(h.scheduleReminders).not.toHaveBeenCalled();
  });
});

describe('useReminderOpened', () => {
  /** La fonction que le hook a confiée au module de notifications, pour simuler un appui sur un rappel. */
  const tap = () => (h.onReminderOpened.mock.calls.at(-1)![0] as () => void)();

  it('un seul abonnement tant que le composant est monté ; l’appui appelle la dernière fonction reçue', () => {
    const first = vi.fn();
    const second = vi.fn();
    const view = renderHook(({ callback }) => useReminderOpened(callback), { initialProps: { callback: first } });
    expect(h.onReminderOpened).toHaveBeenCalledTimes(1);
    view.rerender({ callback: second });
    expect(h.onReminderOpened).toHaveBeenCalledTimes(1);

    tap();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    tap();
    expect(second).toHaveBeenCalledTimes(2);
  });

  it('se désabonne au démontage', () => {
    const stop = vi.fn();
    h.onReminderOpened.mockReturnValue(stop);
    const view = renderHook(() => useReminderOpened(vi.fn()));
    expect(stop).not.toHaveBeenCalled();
    view.unmount();
    expect(stop).toHaveBeenCalledTimes(1);
  });
});

describe('useEnableReminder', () => {
  const wrapper = ({ children }: { children: ReactNode }) => <SettingsProvider initial={DEFAULT_SETTINGS}>{children}</SettingsProvider>;
  /** Appelle la fonction d'activation, comme le ferait un bouton. */
  async function enable() {
    const view = renderHook(() => ({ enable: useEnableReminder(), settings: useSettings().settings }), { wrapper });
    let outcome;
    await act(async () => void (outcome = await view.result.current.enable()));
    return { outcome, settings: () => view.result.current.settings };
  }

  it('déjà autorisé : active sans rien demander', async () => {
    const { outcome, settings } = await enable();
    expect(outcome).toBe('enabled');
    expect(h.requestNotificationPermission).not.toHaveBeenCalled();
    expect(settings()).toMatchObject({ reminder: true, reminderPrompted: true });
  });

  it('autorisation à demander et accordée : active', async () => {
    h.notificationPermission.mockResolvedValue('prompt');
    const { outcome, settings } = await enable();
    expect(h.requestNotificationPermission).toHaveBeenCalledTimes(1);
    expect(outcome).toBe('enabled');
    expect(settings()).toMatchObject({ reminder: true, reminderPrompted: true });
  });

  it.each(['prompt', 'denied'])('autorisation « %s » puis refusée : reste désactivé, mais proposé', async (state) => {
    h.notificationPermission.mockResolvedValue(state);
    h.requestNotificationPermission.mockResolvedValue('denied');
    const { outcome, settings } = await enable();
    expect(h.requestNotificationPermission).toHaveBeenCalledTimes(1);
    expect(outcome).toBe('denied');
    expect(settings()).toMatchObject({ reminder: false, reminderPrompted: true });
  });

  it('indisponible (navigateur) : ne touche à rien', async () => {
    h.notificationPermission.mockResolvedValue('unavailable');
    const { outcome, settings } = await enable();
    expect(outcome).toBe('unavailable');
    expect(h.requestNotificationPermission).not.toHaveBeenCalled();
    expect(settings()).toMatchObject({ reminder: false, reminderPrompted: false });
  });

  it('la demande elle-même indisponible : ne touche à rien', async () => {
    h.notificationPermission.mockResolvedValue('prompt');
    h.requestNotificationPermission.mockResolvedValue('unavailable');
    const { outcome, settings } = await enable();
    expect(outcome).toBe('unavailable');
    expect(settings()).toMatchObject({ reminder: false, reminderPrompted: false });
  });
});
