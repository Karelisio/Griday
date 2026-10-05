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
import { SYNC_DELAY_MS, useEnableReminder, useReminderSync } from './hooks';

const h = vi.hoisted(() => ({
  notificationsAvailable: vi.fn(),
  notificationPermission: vi.fn(),
  requestNotificationPermission: vi.fn(),
  scheduleReminders: vi.fn(),
  cancelReminders: vi.fn(),
  /** Chargement de la progression : remplacé par une promesse en attente pour tester l'état « non chargé ». */
  loadProgress: undefined as (() => Promise<unknown>) | undefined,
}));

vi.mock('../platform/notifications', () => ({
  notificationsAvailable: h.notificationsAvailable,
  notificationPermission: h.notificationPermission,
  requestNotificationPermission: h.requestNotificationPermission,
  scheduleReminders: h.scheduleReminders,
  cancelReminders: h.cancelReminders,
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
  function Probe() {
    useReminderSync();
    settingsApi = useSettings();
    progressApi = useProgress();
    return null;
  }
  /** `initial` nul : la progression se charge comme dans l'app (voir `h.loadProgress`). */
  const mount = (settings: Partial<Settings> = {}, initial: ProgressData | null = progress()) =>
    render(
      <SettingsProvider initial={{ ...DEFAULT_SETTINGS, language: 'fr', reminder: true, ...settings }}>
        <ProgressProvider initial={initial ?? undefined}>
          <Probe />
        </ProgressProvider>
      </SettingsProvider>,
    );
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
  });

  it('rappel désactivé : annule ce qui était programmé, ne programme rien', async () => {
    mount({ reminder: false });
    await settle();
    expect(h.cancelReminders).toHaveBeenCalledTimes(1);
    expect(h.scheduleReminders).not.toHaveBeenCalled();
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

    act(() => void progressApi.recordDaily(solved(TODAY)));
    await settle();
    expect(h.scheduleReminders).toHaveBeenCalledTimes(2);
    const { plan } = lastCall();
    expect(plan).toHaveLength(14);
    expect(plan[0]!.id).toBe(20261006);
    expect(plan[0]!.body).toBe('Gardez votre série de 4 jours 🔥');
    expect(plan[1]!.body).toBe('Une nouvelle grille à résoudre en quelques minutes.');
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
    await settle();
    expect(h.cancelReminders).toHaveBeenCalledTimes(1);
    expect(h.scheduleReminders).toHaveBeenCalledTimes(1);
  });

  it('navigateur ou plugin indisponible : le réglage est conservé', async () => {
    h.scheduleReminders.mockResolvedValue('unavailable');
    mount();
    await settle();
    expect(settingsApi.settings.reminder).toBe(true);
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
