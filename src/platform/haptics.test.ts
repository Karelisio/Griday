import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  native: true,
  impact: vi.fn(),
  notification: vi.fn(),
  selectionStart: vi.fn(),
  selectionChanged: vi.fn(),
}));

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => h.native } }));
vi.mock('@capacitor/haptics', () => ({
  Haptics: {
    impact: h.impact,
    notification: h.notification,
    selectionStart: h.selectionStart,
    selectionChanged: h.selectionChanged,
  },
  ImpactStyle: { Heavy: 'HEAVY', Medium: 'MEDIUM', Light: 'LIGHT' },
  NotificationType: { Success: 'SUCCESS', Warning: 'WARNING', Error: 'ERROR' },
}));

import { haptic, isHapticsEnabled, setHapticsEnabled, type HapticKind } from './haptics';

const all = [h.impact, h.notification, h.selectionStart, h.selectionChanged];
const totalCalls = () => all.reduce((n, fn) => n + fn.mock.calls.length, 0);

beforeEach(() => {
  h.native = true;
  for (const fn of all) fn.mockReset().mockResolvedValue(undefined);
  setHapticsEnabled(true);
});

describe('correspondance des types de retour haptique', () => {
  it('tap : impact léger', async () => {
    await haptic('tap');
    expect(h.impact).toHaveBeenCalledExactlyOnceWith({ style: 'LIGHT' });
    expect(totalCalls()).toBe(1);
  });

  it('heavy : impact fort', async () => {
    await haptic('heavy');
    expect(h.impact).toHaveBeenCalledExactlyOnceWith({ style: 'HEAVY' });
    expect(totalCalls()).toBe(1);
  });

  it('select : selectionStart puis selectionChanged (sinon ignoré sur Android)', async () => {
    await haptic('select');
    expect(h.selectionStart).toHaveBeenCalledTimes(1);
    expect(h.selectionChanged).toHaveBeenCalledTimes(1);
    expect(h.selectionStart.mock.invocationCallOrder[0]).toBeLessThan(h.selectionChanged.mock.invocationCallOrder[0]!);
    expect(totalCalls()).toBe(2);
  });

  it.each([
    ['success', 'SUCCESS'],
    ['warning', 'WARNING'],
    ['error', 'ERROR'],
  ] as const)('%s : notification %s', async (kind, type) => {
    await haptic(kind);
    expect(h.notification).toHaveBeenCalledExactlyOnceWith({ type });
    expect(totalCalls()).toBe(1);
  });
});

describe('activation', () => {
  it('est activé par défaut', () => {
    expect(isHapticsEnabled()).toBe(true);
  });

  it('désactivé : aucun appel natif, puis reprend une fois réactivé', async () => {
    setHapticsEnabled(false);
    expect(isHapticsEnabled()).toBe(false);
    for (const kind of ['tap', 'select', 'success', 'warning', 'error', 'heavy'] as const) await haptic(kind);
    expect(totalCalls()).toBe(0);

    setHapticsEnabled(true);
    await haptic('tap');
    expect(h.impact).toHaveBeenCalledTimes(1);
  });

  it('hors natif (web) : sans effet', async () => {
    h.native = false;
    for (const kind of ['tap', 'select', 'success', 'warning', 'error', 'heavy'] as const) await haptic(kind);
    expect(totalCalls()).toBe(0);
  });
});

describe('ne lève jamais', () => {
  it.each(['tap', 'heavy', 'select', 'success', 'warning', 'error'] as HapticKind[])(
    '%s : erreur synchrone du plugin',
    async (kind) => {
      for (const fn of all) fn.mockImplementation(() => {
        throw new Error('boom');
      });
      await expect(haptic(kind)).resolves.toBeUndefined();
    },
  );

  it.each(['tap', 'heavy', 'select', 'success', 'warning', 'error'] as HapticKind[])(
    '%s : rejet asynchrone du plugin',
    async (kind) => {
      for (const fn of all) fn.mockRejectedValue(new Error('indisponible'));
      await expect(haptic(kind)).resolves.toBeUndefined();
    },
  );

  it('type inconnu (appelant non typé) : sans effet', async () => {
    await expect(haptic('inconnu' as HapticKind)).resolves.toBeUndefined();
    expect(totalCalls()).toBe(0);
  });
});
