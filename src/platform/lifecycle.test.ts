import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ native: false, addListener: vi.fn() }));

vi.mock('@capacitor/app', () => ({ App: { addListener: h.addListener } }));
vi.mock('./device', () => ({ isNativeAndroid: () => h.native }));

import { onAppActiveChange } from './lifecycle';

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function setVisibility(state: 'visible' | 'hidden'): void {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => {
  h.native = false;
  h.addListener.mockReset().mockResolvedValue({ remove: vi.fn() });
});

afterEach(() => {
  // Retire la propriété définie sur l'instance : retour au comportement natif de jsdom.
  Reflect.deleteProperty(document, 'visibilityState');
});

describe('web (visibilitychange)', () => {
  it('signale le passage en arrière-plan puis au premier plan', () => {
    const cb = vi.fn();
    const off = onAppActiveChange(cb);
    setVisibility('hidden');
    setVisibility('visible');
    expect(cb.mock.calls).toEqual([[false], [true]]);
    off();
  });

  it('ne signale rien avant le premier changement', () => {
    const cb = vi.fn();
    const off = onAppActiveChange(cb);
    expect(cb).not.toHaveBeenCalled();
    off();
  });

  it("le désabonnement coupe l'écoute, sans toucher aux autres abonnés", () => {
    const first = vi.fn();
    const second = vi.fn();
    const offFirst = onAppActiveChange(first);
    const offSecond = onAppActiveChange(second);
    offFirst();
    offFirst();
    setVisibility('hidden');
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledExactlyOnceWith(false);
    offSecond();
  });

  it("n'utilise pas le plugin App", () => {
    const off = onAppActiveChange(vi.fn());
    off();
    expect(h.addListener).not.toHaveBeenCalled();
  });
});

describe('Android natif (appStateChange)', () => {
  beforeEach(() => {
    h.native = true;
  });

  it("transmet isActive de l'événement natif", () => {
    const cb = vi.fn();
    onAppActiveChange(cb);
    expect(h.addListener).toHaveBeenCalledWith('appStateChange', expect.any(Function));
    const emit = h.addListener.mock.calls[0]![1] as (state: { isActive: boolean }) => void;
    emit({ isActive: false });
    emit({ isActive: true });
    expect(cb.mock.calls).toEqual([[false], [true]]);
  });

  it("n'écoute pas visibilitychange", () => {
    const cb = vi.fn();
    onAppActiveChange(cb);
    setVisibility('hidden');
    expect(cb).not.toHaveBeenCalled();
  });

  it("le désabonnement retire l'écouteur natif une seule fois", async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    h.addListener.mockResolvedValue({ remove });
    const off = onAppActiveChange(vi.fn());
    await flush();
    off();
    off();
    await flush();
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it("désabonnement avant la fin de l'enregistrement : retiré dès que possible", async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    let resolve!: (handle: { remove: () => Promise<void> }) => void;
    h.addListener.mockReturnValue(new Promise((r) => (resolve = r)));
    const off = onAppActiveChange(vi.fn());
    off();
    resolve({ remove });
    await flush();
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('un plugin indisponible ne fait pas lever la souscription', async () => {
    h.addListener.mockImplementation(() => {
      throw new Error('boom');
    });
    const off = onAppActiveChange(vi.fn());
    await flush();
    expect(() => off()).not.toThrow();
  });
});
