import { act, cleanup, render, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeSystemPalettes } from './fakePalettes';
import { COLOR_ROLES, GRIDAY_SEED, colorRoleToCssVar, createScheme } from './scheme';
import { ThemeProvider, useTheme, type ThemeProviderProps } from './ThemeProvider';

/** matchMedia contrôlable : `prefers-color-scheme: dark` modifiable en direct. */
function mockMatchMedia(initialDark: boolean) {
  let dark = initialDark;
  const listeners = new Set<() => void>();
  window.matchMedia = vi.fn((query: string) => ({
    get matches() {
      return query.includes('prefers-color-scheme: dark') ? dark : false;
    },
    media: query,
    onchange: null,
    addEventListener: (_type: string, cb: () => void) => listeners.add(cb),
    removeEventListener: (_type: string, cb: () => void) => listeners.delete(cb),
    addListener: (cb: () => void) => listeners.add(cb),
    removeListener: (cb: () => void) => listeners.delete(cb),
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  return {
    setDark(value: boolean) {
      dark = value;
      act(() => listeners.forEach((cb) => cb()));
    },
  };
}

const root = () => document.documentElement;
const cssVar = (role: Parameters<typeof colorRoleToCssVar>[0]) => root().style.getPropertyValue(colorRoleToCssVar(role));
const themeColor = () => document.head.querySelector('meta[name="theme-color"]')?.getAttribute('content');

function wrapper(props: ThemeProviderProps = {}) {
  return ({ children }: { children: ReactNode }) => <ThemeProvider {...props}>{children}</ThemeProvider>;
}

beforeEach(() => {
  document.head.innerHTML = '<meta name="theme-color" content="#ffffff">';
});

afterEach(() => {
  cleanup();
  document.head.innerHTML = '';
});

describe('ThemeProvider', () => {
  it('écrit tous les rôles en variables CSS, color-scheme et la meta theme-color (mode clair)', () => {
    mockMatchMedia(false);
    const onThemeApplied = vi.fn();
    render(<ThemeProvider mode="light" onThemeApplied={onThemeApplied} />);
    const scheme = createScheme({ seed: GRIDAY_SEED, dark: false });
    for (const role of COLOR_ROLES) expect(cssVar(role), role).toBe(scheme[role]);
    expect(root().style.getPropertyValue('color-scheme')).toBe('light');
    expect(root().getAttribute('data-theme')).toBe('light');
    expect(themeColor()).toBe(scheme.surface);
    expect(onThemeApplied).toHaveBeenCalledTimes(1);
    expect(onThemeApplied).toHaveBeenLastCalledWith(false);
  });

  it('crée la meta theme-color si elle manque', () => {
    mockMatchMedia(false);
    document.head.innerHTML = '';
    render(<ThemeProvider mode="dark" />);
    expect(themeColor()).toBe(createScheme({ seed: GRIDAY_SEED, dark: true }).surface);
  });

  it('mode sombre forcé', () => {
    mockMatchMedia(false);
    render(<ThemeProvider mode="dark" />);
    const scheme = createScheme({ seed: GRIDAY_SEED, dark: true });
    expect(cssVar('surface')).toBe(scheme.surface);
    expect(root().style.getPropertyValue('color-scheme')).toBe('dark');
    expect(root().getAttribute('data-theme')).toBe('dark');
  });

  it('mode système : suit prefers-color-scheme en direct', () => {
    const media = mockMatchMedia(false);
    const onThemeApplied = vi.fn();
    const { result } = renderHook(() => useTheme(), { wrapper: wrapper({ mode: 'system', onThemeApplied }) });
    expect(result.current.dark).toBe(false);
    expect(cssVar('surface')).toBe(createScheme({ seed: GRIDAY_SEED, dark: false }).surface);

    media.setDark(true);
    expect(result.current.dark).toBe(true);
    expect(cssVar('surface')).toBe(createScheme({ seed: GRIDAY_SEED, dark: true }).surface);
    expect(root().getAttribute('data-theme')).toBe('dark');
    expect(onThemeApplied).toHaveBeenLastCalledWith(true);

    media.setDark(false);
    expect(result.current.dark).toBe(false);
    expect(onThemeApplied).toHaveBeenLastCalledWith(false);
  });

  it('le mode explicite ignore le système', () => {
    const media = mockMatchMedia(true);
    const { result } = renderHook(() => useTheme(), { wrapper: wrapper({ mode: 'light' }) });
    expect(result.current.dark).toBe(false);
    media.setDark(false);
    media.setDark(true);
    expect(result.current.dark).toBe(false);
  });

  it('fonctionne sans matchMedia (jsdom nu) : thème clair', () => {
    // @ts-expect-error simulation d'un environnement sans matchMedia
    delete window.matchMedia;
    const { result } = renderHook(() => useTheme(), { wrapper: wrapper({ mode: 'system' }) });
    expect(result.current.dark).toBe(false);
  });

  it('couleurs dynamiques : palettes du système si activées, sinon marque', () => {
    mockMatchMedia(false);
    const palettes = fakeSystemPalettes(140);
    const dynamic = renderHook(() => useTheme(), { wrapper: wrapper({ mode: 'light', dynamic: true, systemPalettes: palettes }) });
    expect(dynamic.result.current.dynamic).toBe(true);
    expect(dynamic.result.current.scheme).toEqual(createScheme({ seed: GRIDAY_SEED, dark: false, palettes }));
    expect(cssVar('primary')).toBe(createScheme({ seed: GRIDAY_SEED, dark: false, palettes }).primary);
    dynamic.unmount();

    const off = renderHook(() => useTheme(), { wrapper: wrapper({ mode: 'light', dynamic: false, systemPalettes: palettes }) });
    expect(off.result.current.dynamic).toBe(false);
    expect(off.result.current.scheme).toEqual(createScheme({ seed: GRIDAY_SEED, dark: false }));

    const absent = renderHook(() => useTheme(), { wrapper: wrapper({ mode: 'light', dynamic: true, systemPalettes: null }) });
    expect(absent.result.current.dynamic).toBe(false);
  });

  it('seed personnalisée', () => {
    mockMatchMedia(false);
    const { result } = renderHook(() => useTheme(), { wrapper: wrapper({ mode: 'light', seed: 0xff0061a4 }) });
    expect(result.current.seed).toBe(0xff0061a4);
    expect(result.current.scheme.primary).toBe(createScheme({ seed: 0xff0061a4, dark: false }).primary);
  });

  it('useTheme : regionColors(count) est mémoïsé et suit le mode', () => {
    mockMatchMedia(false);
    let props: ThemeProviderProps = { mode: 'light' };
    const { result, rerender } = renderHook(() => useTheme(), { wrapper: ({ children }) => <ThemeProvider {...props}>{children}</ThemeProvider> });
    const first = result.current.regionColors(8);
    expect(first).toHaveLength(8);
    expect(result.current.regionColors(8)).toBe(first);
    expect(result.current.regionColors(6)).toHaveLength(6);
    const value = result.current;

    rerender();
    expect(result.current).toBe(value); // même thème : valeur de contexte stable
    expect(result.current.regionColors(8)).toBe(first);

    props = { mode: 'dark' };
    rerender();
    expect(result.current.dark).toBe(true);
    expect(result.current.regionColors(8)).not.toBe(first);
    expect(result.current.regionColors(8)[0]?.fill).not.toBe(first[0]?.fill);
  });

  it('ne recalcule pas le thème quand les palettes sont recréées à l’identique', () => {
    mockMatchMedia(false);
    let palettes = fakeSystemPalettes(200);
    const { result, rerender } = renderHook(() => useTheme(), {
      wrapper: ({ children }) => (
        <ThemeProvider mode="light" systemPalettes={palettes}>
          {children}
        </ThemeProvider>
      ),
    });
    const scheme = result.current.scheme;
    palettes = fakeSystemPalettes(200); // nouvel objet, même contenu
    rerender();
    expect(result.current.scheme).toBe(scheme);
    palettes = fakeSystemPalettes(10);
    rerender();
    expect(result.current.scheme).not.toBe(scheme);
  });

  it('active le fondu après la première application seulement', () => {
    mockMatchMedia(false);
    const { unmount } = render(<ThemeProvider mode="light" />);
    expect(root().hasAttribute('data-theme-fade')).toBe(true);
    unmount();
    expect(root().hasAttribute('data-theme-fade')).toBe(false);
  });

  it('retire ses variables au démontage', () => {
    mockMatchMedia(false);
    const { unmount } = render(<ThemeProvider mode="light" />);
    expect(cssVar('primary')).not.toBe('');
    unmount();
    for (const role of COLOR_ROLES) expect(cssVar(role)).toBe('');
    expect(root().getAttribute('data-theme')).toBeNull();
    expect(root().style.getPropertyValue('color-scheme')).toBe('');
  });

  it('useTheme hors fournisseur lève une erreur claire', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useTheme())).toThrow(/ThemeProvider/);
    spy.mockRestore();
  });
});
