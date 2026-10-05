import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  native: true,
  plugin: {
    checkPermissions: vi.fn(),
    requestPermissions: vi.fn(),
    getPending: vi.fn(),
    cancel: vi.fn(),
    getDeliveredNotifications: vi.fn(),
    removeDeliveredNotifications: vi.fn(),
    createChannel: vi.fn(),
    deleteChannel: vi.fn(),
    schedule: vi.fn(),
    addListener: vi.fn(),
  },
}));

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => h.native } }));
vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: h.plugin }));

import {
  cancelReminders,
  clearDeliveredReminders,
  notificationPermission,
  notificationsAvailable,
  onReminderOpened,
  requestNotificationPermission,
  scheduleReminders,
  type Reminder,
} from './notifications';

const { plugin } = h;
const calls = () => Object.values(plugin).reduce((n, fn) => n + fn.mock.calls.length, 0);
const order = (fn: ReturnType<typeof vi.fn>) => fn.mock.invocationCallOrder[0]!;
/** Laisse s'achever l'enregistrement asynchrone d'un écouteur. */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const reminder = (id: number, hour = 19): Reminder => ({
  id,
  at: new Date(2026, 9, 5, hour),
  title: `Titre ${id}`,
  body: `Texte ${id}`,
});
const pending = (...ids: number[]) => ({ notifications: ids.map((id) => ({ id, title: '', body: '' })) });
const delivered = (...ids: number[]) => ({ notifications: ids.map((id) => ({ id, title: `Titre ${id}`, body: `Texte ${id}` })) });

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  h.native = true;
  for (const fn of Object.values(plugin)) fn.mockReset().mockResolvedValue(undefined);
  plugin.checkPermissions.mockResolvedValue({ display: 'granted' });
  plugin.requestPermissions.mockResolvedValue({ display: 'granted' });
  plugin.getPending.mockResolvedValue(pending());
  plugin.getDeliveredNotifications.mockResolvedValue(delivered());
  warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => warn.mockRestore());

describe('disponibilité', () => {
  it('natif : disponible ; navigateur : non', () => {
    expect(notificationsAvailable()).toBe(true);
    h.native = false;
    expect(notificationsAvailable()).toBe(false);
  });
});

describe('autorisation', () => {
  it.each([
    ['granted', 'granted'],
    ['denied', 'denied'],
    ['prompt', 'prompt'],
    ['prompt-with-rationale', 'prompt'],
  ])('lecture : %s → %s', async (display, expected) => {
    plugin.checkPermissions.mockResolvedValue({ display });
    expect(await notificationPermission()).toBe(expected);
    expect(plugin.requestPermissions).not.toHaveBeenCalled();
  });

  it.each([
    ['granted', 'granted'],
    ['denied', 'denied'],
    ['prompt', 'prompt'],
  ])('demande : %s → %s', async (display, expected) => {
    plugin.requestPermissions.mockResolvedValue({ display });
    expect(await requestNotificationPermission()).toBe(expected);
  });

  it('navigateur : indisponible, le plugin n’est pas appelé', async () => {
    h.native = false;
    expect(await notificationPermission()).toBe('unavailable');
    expect(await requestNotificationPermission()).toBe('unavailable');
    expect(calls()).toBe(0);
  });

  it('erreur du plugin : indisponible, sans lever, avec un avertissement', async () => {
    plugin.checkPermissions.mockRejectedValue(new Error('boom'));
    plugin.requestPermissions.mockImplementation(() => {
      throw new Error('boom');
    });
    expect(await notificationPermission()).toBe('unavailable');
    expect(await requestNotificationPermission()).toBe('unavailable');
    expect(warn).toHaveBeenCalledTimes(2);
  });
});

describe('annulation', () => {
  it('annule les rappels programmés, et eux seuls (plage des dates « AAAAMMJJ »)', async () => {
    plugin.getPending.mockResolvedValue(pending(20261005, 7, 20261006, 123456789, 99991231, 18991231, -5));
    await cancelReminders();
    expect(plugin.cancel).toHaveBeenCalledExactlyOnceWith({ notifications: [{ id: 20261005 }, { id: 20261006 }, { id: 99991231 }] });
  });

  it('rien à annuler : le plugin (qui refuse une liste vide) n’est pas appelé', async () => {
    plugin.getPending.mockResolvedValue(pending(7));
    await cancelReminders();
    expect(plugin.cancel).not.toHaveBeenCalled();
  });

  it('navigateur : sans effet', async () => {
    h.native = false;
    await cancelReminders();
    expect(calls()).toBe(0);
  });

  it('erreur du plugin : ne lève pas', async () => {
    plugin.getPending.mockRejectedValue(new Error('boom'));
    await expect(cancelReminders()).resolves.toBeUndefined();
    plugin.getPending.mockResolvedValue(pending(20261005));
    plugin.cancel.mockRejectedValue(new Error('boom'));
    await expect(cancelReminders()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(2);
  });
});

describe('rappels déjà affichés', () => {
  it('retire de la zone de notifications les rappels affichés, et eux seuls (plage des dates « AAAAMMJJ »)', async () => {
    const shown = delivered(20261005, 7, 20261006, 123456789, 99991231, 18991231, -5);
    plugin.getDeliveredNotifications.mockResolvedValue(shown);
    await clearDeliveredReminders();
    const [first, , second, , third] = shown.notifications;
    expect(plugin.removeDeliveredNotifications).toHaveBeenCalledExactlyOnceWith({ notifications: [first, second, third] });
    expect(plugin.cancel).not.toHaveBeenCalled(); // les rappels programmés ne sont pas touchés
  });

  it('les notifications sont renvoyées telles que le plugin les a décrites (étiquette comprise)', async () => {
    const tagged = { id: 20261005, tag: 'rappel', title: 'Titre', body: 'Texte' };
    plugin.getDeliveredNotifications.mockResolvedValue({ notifications: [tagged] });
    await clearDeliveredReminders();
    expect(plugin.removeDeliveredNotifications).toHaveBeenCalledExactlyOnceWith({ notifications: [tagged] });
  });

  it.each([[[]], [[7, 123456789]]])('rien à retirer (%j) : le plugin n’est pas appelé pour retirer', async (ids) => {
    plugin.getDeliveredNotifications.mockResolvedValue(delivered(...ids));
    await clearDeliveredReminders();
    expect(plugin.getDeliveredNotifications).toHaveBeenCalledTimes(1);
    expect(plugin.removeDeliveredNotifications).not.toHaveBeenCalled();
  });

  it('navigateur : sans effet', async () => {
    h.native = false;
    await expect(clearDeliveredReminders()).resolves.toBeUndefined();
    expect(calls()).toBe(0);
  });

  it('erreur du plugin : ne lève pas, avertissement', async () => {
    plugin.getDeliveredNotifications.mockRejectedValue(new Error('boom'));
    await expect(clearDeliveredReminders()).resolves.toBeUndefined();
    plugin.getDeliveredNotifications.mockResolvedValue(delivered(20261005));
    plugin.removeDeliveredNotifications.mockRejectedValue(new Error('boom'));
    await expect(clearDeliveredReminders()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(2);
  });
});

describe('programmation', () => {
  it('annule les anciens rappels, crée le canal, puis programme', async () => {
    plugin.getPending.mockResolvedValue(pending(20261004, 20261005));
    expect(await scheduleReminders([reminder(20261005), reminder(20261006)], 'Rappel quotidien')).toBe('scheduled');

    expect(plugin.cancel).toHaveBeenCalledExactlyOnceWith({ notifications: [{ id: 20261004 }, { id: 20261005 }] });
    expect(plugin.createChannel).toHaveBeenCalledExactlyOnceWith({ id: 'daily-reminder', name: 'Rappel quotidien', importance: 3 });
    expect(order(plugin.getPending)).toBeLessThan(order(plugin.cancel));
    expect(order(plugin.cancel)).toBeLessThan(order(plugin.createChannel));
    expect(order(plugin.createChannel)).toBeLessThan(order(plugin.schedule));
  });

  it('retire le canal « Default » que le plugin crée de lui-même, une fois le nôtre créé', async () => {
    await scheduleReminders([reminder(20261005)], 'Rappel quotidien');
    expect(plugin.deleteChannel).toHaveBeenCalledExactlyOnceWith({ id: 'default' });
    expect(order(plugin.createChannel)).toBeLessThan(order(plugin.deleteChannel));
    expect(plugin.schedule).toHaveBeenCalledTimes(1);
  });

  it('suppression du canal « Default » en échec : les rappels sont programmés quand même', async () => {
    plugin.deleteChannel.mockRejectedValue(new Error('boom'));
    expect(await scheduleReminders([reminder(20261005)], 'Rappel quotidien')).toBe('scheduled');
    expect(plugin.schedule).toHaveBeenCalledTimes(1);
  });

  it('chaque rappel : instant précis, canal, petite icône, alarme inexacte tolérée en veille', async () => {
    const [a, b] = [reminder(20261005), reminder(20261006, 20)];
    await scheduleReminders([a, b], 'Rappel quotidien');
    expect(plugin.schedule).toHaveBeenCalledExactlyOnceWith({
      notifications: [a, b].map(({ id, at, title, body }) => ({
        id,
        title,
        body,
        schedule: { at, allowWhileIdle: true },
        channelId: 'daily-reminder',
        smallIcon: 'ic_stat_griday',
        // Sans cela, le plugin ouvrirait les réglages « Alarmes et rappels » (permission retirée du manifeste).
        isExactNotification: false,
      })),
    });
  });

  it('aucun rappel à programmer : anciens annulés, rien de plus', async () => {
    plugin.getPending.mockResolvedValue(pending(20261005));
    expect(await scheduleReminders([], 'Rappel quotidien')).toBe('scheduled');
    expect(plugin.cancel).toHaveBeenCalledTimes(1);
    expect(plugin.createChannel).not.toHaveBeenCalled();
    expect(plugin.deleteChannel).not.toHaveBeenCalled();
    expect(plugin.schedule).not.toHaveBeenCalled();
  });

  it.each(['denied', 'prompt'])('autorisation « %s » : rien n’est programmé (le plugin la réclamerait lui-même)', async (display) => {
    plugin.checkPermissions.mockResolvedValue({ display });
    expect(await scheduleReminders([reminder(20261005)], 'Rappel quotidien')).toBe('denied');
    expect(plugin.schedule).not.toHaveBeenCalled();
    expect(plugin.createChannel).not.toHaveBeenCalled();
    expect(plugin.deleteChannel).not.toHaveBeenCalled();
    expect(plugin.requestPermissions).not.toHaveBeenCalled();
  });

  it('navigateur : indisponible, aucun appel au plugin', async () => {
    h.native = false;
    expect(await scheduleReminders([reminder(20261005)], 'Rappel quotidien')).toBe('unavailable');
    expect(calls()).toBe(0);
  });

  it('Android 7 (pas de canaux, appel rejeté) : les rappels sont programmés quand même', async () => {
    plugin.createChannel.mockRejectedValue(new Error('not available'));
    expect(await scheduleReminders([reminder(20261005)], 'Rappel quotidien')).toBe('scheduled');
    expect(plugin.deleteChannel).not.toHaveBeenCalled(); // pas de canaux, donc pas de canal « Default » à retirer
    expect(plugin.schedule).toHaveBeenCalledTimes(1);
  });

  it('annulation en échec : la programmation remplace les anciens rappels par identifiant', async () => {
    plugin.getPending.mockRejectedValue(new Error('boom'));
    expect(await scheduleReminders([reminder(20261005)], 'Rappel quotidien')).toBe('scheduled');
    expect(plugin.schedule).toHaveBeenCalledTimes(1);
  });

  it('programmation en échec (rejet ou exception) : ne lève pas, indisponible', async () => {
    plugin.schedule.mockRejectedValueOnce(new Error('boom'));
    expect(await scheduleReminders([reminder(20261005)], 'Rappel quotidien')).toBe('unavailable');
    plugin.schedule.mockImplementationOnce(() => {
      throw new Error('boom');
    });
    expect(await scheduleReminders([reminder(20261005)], 'Rappel quotidien')).toBe('unavailable');
    expect(warn).toHaveBeenCalledTimes(2);
  });
});
