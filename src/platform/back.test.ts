import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  native: true,
  addListener: vi.fn(),
  toggle: vi.fn(),
  minimize: vi.fn(),
}));

vi.mock('@capacitor/app', () => ({
  App: { addListener: h.addListener, toggleBackButtonHandler: h.toggle, minimizeApp: h.minimize },
}));
vi.mock('./device', () => ({ isNativeAndroid: () => h.native }));

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Module neuf à chaque test : la pile et l'état d'initialisation sont globaux au module. */
async function load() {
  vi.resetModules();
  return import('./back');
}

/** Récupère l'écouteur `backButton` enregistré auprès du plugin App. */
function nativeBackListener(): () => void {
  const call = h.addListener.mock.calls.find((c) => c[0] === 'backButton');
  if (!call) throw new Error('écouteur backButton absent');
  return call[1] as () => void;
}

const enabledArgs = () => h.toggle.mock.calls.map((c) => (c[0] as { enabled: boolean }).enabled);

beforeEach(() => {
  h.native = true;
  h.addListener.mockReset().mockResolvedValue({ remove: vi.fn() });
  h.toggle.mockReset().mockResolvedValue(undefined);
  h.minimize.mockReset().mockResolvedValue(undefined);
});

describe('pile de gestionnaires', () => {
  it('appelle le gestionnaire le plus récent, puis le précédent après retrait', async () => {
    const { pushBackHandler, dispatchBack } = await load();
    const calls: string[] = [];
    const offA = pushBackHandler(() => calls.push('a'));
    const offB = pushBackHandler(() => calls.push('b'));
    const offC = pushBackHandler(() => calls.push('c'));

    expect(dispatchBack()).toBe(true);
    expect(calls).toEqual(['c']);
    offC();
    expect(dispatchBack()).toBe(true);
    expect(calls).toEqual(['c', 'b']);
    offB();
    offA();
    expect(dispatchBack()).toBe(false);
    expect(calls).toEqual(['c', 'b']);
  });

  it("retirer un gestionnaire du milieu conserve l'ordre des autres", async () => {
    const { pushBackHandler, dispatchBack } = await load();
    const calls: string[] = [];
    pushBackHandler(() => calls.push('a'));
    const offB = pushBackHandler(() => calls.push('b'));
    const offC = pushBackHandler(() => calls.push('c'));
    offB();
    dispatchBack();
    offC();
    dispatchBack();
    expect(calls).toEqual(['c', 'a']);
  });

  it('le retrait est idempotent et ne touche pas les autres entrées', async () => {
    const { pushBackHandler, dispatchBack } = await load();
    const a = vi.fn();
    const b = vi.fn();
    pushBackHandler(a);
    const offB = pushBackHandler(b);
    offB();
    offB();
    expect(dispatchBack()).toBe(true);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).not.toHaveBeenCalled();
  });

  it('deux enregistrements de la même fonction sont indépendants', async () => {
    const { pushBackHandler, dispatchBack } = await load();
    const same = vi.fn();
    const off1 = pushBackHandler(same);
    pushBackHandler(same);
    off1();
    expect(dispatchBack()).toBe(true);
    expect(same).toHaveBeenCalledTimes(1);
  });

  it("un gestionnaire peut se retirer lui-même pendant l'appel", async () => {
    const { pushBackHandler, dispatchBack } = await load();
    const outer = vi.fn();
    pushBackHandler(outer);
    const off = pushBackHandler(() => off());
    dispatchBack();
    dispatchBack();
    expect(outer).toHaveBeenCalledTimes(1);
  });
});

describe('Android natif', () => {
  it("n'enregistre l'écouteur backButton qu'une fois (idempotent)", async () => {
    const { initBackHandling } = await load();
    await Promise.all([initBackHandling(), initBackHandling()]);
    await initBackHandling();
    expect(h.addListener).toHaveBeenCalledTimes(1);
    expect(h.addListener).toHaveBeenCalledWith('backButton', expect.any(Function));
  });

  it("désactive le gestionnaire natif à l'initialisation (pile vide : retour prédictif du système)", async () => {
    const { initBackHandling } = await load();
    await initBackHandling();
    await flush();
    expect(enabledArgs()).toEqual([false]);
  });

  it('active le gestionnaire natif au premier ajout et le désactive quand la pile se vide', async () => {
    const { initBackHandling, pushBackHandler } = await load();
    await initBackHandling();
    await flush();
    h.toggle.mockClear();

    const offA = pushBackHandler(() => {});
    const offB = pushBackHandler(() => {});
    await flush();
    expect(enabledArgs()).toEqual([true]); // pas de rappel au 2e ajout

    offB();
    await flush();
    expect(enabledArgs()).toEqual([true]); // la pile n'est pas vide

    offA();
    offA();
    await flush();
    expect(enabledArgs()).toEqual([true, false]);
  });

  it("un ajout avant la fin de l'initialisation est pris en compte sans passage par « false »", async () => {
    const { pushBackHandler } = await load(); // initBackHandling() jamais appelé explicitement
    pushBackHandler(() => {});
    await flush();
    expect(h.addListener).toHaveBeenCalledTimes(1);
    expect(enabledArgs()).toEqual([true]);
  });

  it("l'événement backButton appelle le gestionnaire du dessus", async () => {
    const { initBackHandling, pushBackHandler } = await load();
    await initBackHandling();
    const bottom = vi.fn();
    const top = vi.fn();
    pushBackHandler(bottom);
    pushBackHandler(top);

    nativeBackListener()();
    expect(top).toHaveBeenCalledTimes(1);
    expect(bottom).not.toHaveBeenCalled();
    expect(h.minimize).not.toHaveBeenCalled();
  });

  it("événement backButton avec une pile vide : l'app passe en arrière-plan", async () => {
    const { initBackHandling } = await load();
    await initBackHandling();
    nativeBackListener()();
    await flush();
    expect(h.minimize).toHaveBeenCalledTimes(1);
  });

  it("un échec du plugin ne lève rien", async () => {
    h.toggle.mockRejectedValue(new Error('indisponible'));
    const { initBackHandling, pushBackHandler } = await load();
    await expect(initBackHandling()).resolves.toBeUndefined();
    const off = pushBackHandler(() => {});
    off();
    await flush();
    expect(enabledArgs()).toEqual([false, true, false]);
  });

  it("après un échec du plugin, le changement de pile suivant renvoie l'état voulu", async () => {
    const { initBackHandling, pushBackHandler } = await load();
    await initBackHandling();
    await flush();
    h.toggle.mockClear();
    h.toggle.mockRejectedValueOnce(new Error('indisponible'));

    pushBackHandler(() => {}); // « true » rejeté
    await flush();
    pushBackHandler(() => {}); // état voulu toujours « true » : renvoyé
    await flush();
    expect(enabledArgs()).toEqual([true, true]);
  });

  it("sans écouteur (addListener échoue), rien n'est basculé et rien ne lève", async () => {
    h.addListener.mockRejectedValue(new Error('indisponible'));
    const { initBackHandling, pushBackHandler, dispatchBack } = await load();
    await expect(initBackHandling()).resolves.toBeUndefined();
    const off = pushBackHandler(() => {});
    off();
    await flush();
    expect(h.toggle).not.toHaveBeenCalled();
    expect(dispatchBack()).toBe(false);
  });
});

describe('web', () => {
  beforeEach(() => {
    h.native = false;
  });

  it("n'appelle aucune API native mais la pile fonctionne", async () => {
    const { initBackHandling, pushBackHandler, dispatchBack } = await load();
    await initBackHandling();
    const handler = vi.fn();
    const off = pushBackHandler(handler);
    expect(dispatchBack()).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
    off();
    expect(dispatchBack()).toBe(false);
    await flush();
    expect(h.addListener).not.toHaveBeenCalled();
    expect(h.toggle).not.toHaveBeenCalled();
  });
});
