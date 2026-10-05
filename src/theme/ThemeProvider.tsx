/**
 * Fournisseur de thème : résout clair/sombre, calcule le schéma M3 Expressive (couleur de marque ou
 * palettes dynamiques du système), écrit les variables `--md-sys-color-*` sur `:root`, synchronise
 * `color-scheme` et `<meta name="theme-color">`, et fond les couleurs lors d'un changement.
 *
 * Usage :
 *   <ThemeProvider mode={settings.theme} dynamic={settings.dynamicColor} systemPalettes={palettes}
 *                  onThemeApplied={(dark) => setStatusBarStyle(dark)}>
 *     <App />
 *   </ThemeProvider>
 *   const { dark, scheme, regionColors } = useTheme();
 */
import { MotionConfig } from 'motion/react';
import { createContext, useContext, useLayoutEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from 'react';
import type { SystemPalettes } from '../shared/systemPalettes';
import { regionPalette, type RegionColor } from './regions';
import { COLOR_ROLES, GRIDAY_SEED, colorRoleToCssVar, createScheme, isSystemPalettes, type ColorScheme } from './scheme';
import './regions.css';
import './tokens.css';

/** Préférence de thème (identique à `ThemeMode` des réglages de l'application). */
export type ThemeMode = 'system' | 'light' | 'dark';

export interface ThemeProviderProps {
  /** `system` suit `prefers-color-scheme` en direct. Défaut : `system`. */
  readonly mode?: ThemeMode;
  /** Utiliser les palettes du système (fond d'écran) quand elles sont fournies. Défaut : `true`. */
  readonly dynamic?: boolean;
  /** Palettes tonales Android 12+ ; `null`/absent : couleur de marque. */
  readonly systemPalettes?: SystemPalettes | null;
  /** Couleur source ARGB de repli. Défaut : `GRIDAY_SEED` (violet de la marque). */
  readonly seed?: number;
  /** Contraste de -1 à 1 (0 = standard). */
  readonly contrast?: number;
  /** Appelé après chaque application du thème (ex. pour régler la couleur des icônes de barre système). */
  readonly onThemeApplied?: (dark: boolean) => void;
  readonly children?: ReactNode;
}

export interface ThemeValue {
  /** Préférence demandée. */
  readonly mode: ThemeMode;
  /** Thème sombre effectivement appliqué. */
  readonly dark: boolean;
  /** Couleurs du schéma courant (`#rrggbb`). */
  readonly scheme: ColorScheme;
  /** Couleur source ARGB utilisée quand les palettes du système sont absentes. */
  readonly seed: number;
  /** Vrai si le schéma est issu des palettes du système. */
  readonly dynamic: boolean;
  /** Couleurs des `count` régions du plateau ; tableau stable tant que le thème ne change pas. */
  readonly regionColors: (count: number) => RegionColor[];
}

const ThemeContext = createContext<ThemeValue | null>(null);

const DARK_QUERY = '(prefers-color-scheme: dark)';

function subscribePrefersDark(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  const query = window.matchMedia(DARK_QUERY);
  if (typeof query.addEventListener === 'function') {
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }
  query.addListener?.(onChange); // anciens WebView
  return () => query.removeListener?.(onChange);
}

function getPrefersDark(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(DARK_QUERY).matches;
}

/** Préférence système « thème sombre », mise à jour en direct. */
export function usePrefersDark(): boolean {
  return useSyncExternalStore(subscribePrefersDark, getPrefersDark, () => false);
}

function setThemeColorMeta(color: string): void {
  const metas = document.head.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]');
  if (metas.length === 0) {
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    meta.content = color;
    document.head.append(meta);
    return;
  }
  metas.forEach((meta) => {
    meta.content = color;
  });
}

/** Clé de contenu des palettes : évite de recalculer le thème si l'appelant recrée l'objet à chaque rendu. */
function paletteKey(p: SystemPalettes): string {
  return [p.accent1, p.accent2, p.accent3, p.neutral1, p.neutral2].map((tones) => tones.join(',')).join('|');
}

/** Renvoie la même référence tant que le contenu des palettes ne change pas. */
function useStablePalettes(palettes: SystemPalettes | null): SystemPalettes | null {
  const ref = useRef<{ key: string; value: SystemPalettes | null }>({ key: '', value: null });
  const key = palettes ? paletteKey(palettes) : '';
  if (ref.current.key !== key) ref.current = { key, value: palettes };
  return ref.current.value;
}

export function ThemeProvider({
  mode = 'system',
  dynamic = true,
  systemPalettes = null,
  seed = GRIDAY_SEED,
  contrast = 0,
  onThemeApplied,
  children,
}: ThemeProviderProps) {
  const prefersDark = usePrefersDark();
  const dark = mode === 'dark' || (mode === 'system' && prefersDark);
  const palettes = useStablePalettes(dynamic && isSystemPalettes(systemPalettes) ? systemPalettes : null);

  const scheme = useMemo(() => createScheme({ seed, dark, palettes, contrast }), [seed, dark, palettes, contrast]);

  const regionColors = useMemo(() => {
    const cache = new Map<number, RegionColor[]>();
    return (count: number): RegionColor[] => {
      let colors = cache.get(count);
      if (!colors) {
        colors = regionPalette({ seed, palettes, dark, count });
        cache.set(count, colors);
      }
      return colors;
    };
  }, [seed, palettes, dark]);

  const value = useMemo<ThemeValue>(
    () => ({ mode, dark, scheme, seed, dynamic: palettes !== null, regionColors }),
    [mode, dark, scheme, seed, palettes, regionColors],
  );

  const appliedRef = useRef(onThemeApplied);
  appliedRef.current = onThemeApplied;

  // Démontage : retire ce que le fournisseur a posé sur le document.
  useLayoutEffect(() => {
    const root = document.documentElement;
    return () => {
      for (const role of COLOR_ROLES) root.style.removeProperty(colorRoleToCssVar(role));
      root.style.removeProperty('color-scheme');
      root.removeAttribute('data-theme');
      root.removeAttribute('data-theme-fade');
    };
  }, []);

  // Application avant la peinture : variables CSS, color-scheme, meta theme-color.
  useLayoutEffect(() => {
    const root = document.documentElement;
    for (const role of COLOR_ROLES) root.style.setProperty(colorRoleToCssVar(role), scheme[role]);
    root.style.setProperty('color-scheme', dark ? 'dark' : 'light');
    root.setAttribute('data-theme', dark ? 'dark' : 'light');
    setThemeColorMeta(scheme.surface);
    if (!root.hasAttribute('data-theme-fade')) {
      // Première application : instantanée. On force le calcul de style avant d'activer le fondu,
      // pour que seuls les changements ultérieurs soient animés.
      void getComputedStyle(root).getPropertyValue('--md-sys-color-surface');
      root.setAttribute('data-theme-fade', '');
    }
    appliedRef.current?.(dark);
  }, [scheme, dark]);

  return (
    <ThemeContext.Provider value={value}>
      {/* Respecte « réduire les animations » pour tout composant `motion` de l'application. */}
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </ThemeContext.Provider>
  );
}

/** Thème courant : `{ dark, scheme, regionColors(count), … }`. À utiliser sous `<ThemeProvider>`. */
export function useTheme(): ThemeValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme hors de ThemeProvider');
  return value;
}
