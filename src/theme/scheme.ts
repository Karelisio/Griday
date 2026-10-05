/**
 * Schéma de couleurs Material 3 Expressive : tous les rôles M3 (clair/sombre) calculés avec
 * `DynamicScheme` (spec 2025, variante TONAL_SPOT = style par défaut d'Android), soit à partir
 * d'une couleur source (marque), soit à partir des palettes tonales du système (Android 12+).
 */
import { DynamicScheme, Hct, TonalPalette, Variant } from '@material/material-color-utilities';
import { SYSTEM_PALETTE_TONES, type SystemPalettes } from '../shared/systemPalettes';
import { argbToHex } from './color';

/** Violet de la marque Griday : couleur source quand les couleurs dynamiques sont indisponibles. */
export const GRIDAY_SEED = 0xff5b4fc4;

/** Tous les rôles de couleur M3, dans l'ordre d'écriture des variables CSS. */
export const COLOR_ROLES = [
  'primary',
  'onPrimary',
  'primaryContainer',
  'onPrimaryContainer',
  'primaryFixed',
  'primaryFixedDim',
  'onPrimaryFixed',
  'onPrimaryFixedVariant',
  'inversePrimary',
  'secondary',
  'onSecondary',
  'secondaryContainer',
  'onSecondaryContainer',
  'secondaryFixed',
  'secondaryFixedDim',
  'onSecondaryFixed',
  'onSecondaryFixedVariant',
  'tertiary',
  'onTertiary',
  'tertiaryContainer',
  'onTertiaryContainer',
  'tertiaryFixed',
  'tertiaryFixedDim',
  'onTertiaryFixed',
  'onTertiaryFixedVariant',
  'error',
  'onError',
  'errorContainer',
  'onErrorContainer',
  'surface',
  'onSurface',
  'surfaceVariant',
  'onSurfaceVariant',
  'surfaceDim',
  'surfaceBright',
  'surfaceContainerLowest',
  'surfaceContainerLow',
  'surfaceContainer',
  'surfaceContainerHigh',
  'surfaceContainerHighest',
  'inverseSurface',
  'inverseOnSurface',
  'outline',
  'outlineVariant',
  'shadow',
  'scrim',
  'surfaceTint',
  'background',
  'onBackground',
] as const;

export type ColorRole = (typeof COLOR_ROLES)[number];
/** Rôle → couleur `#rrggbb`. */
export type ColorScheme = Readonly<Record<ColorRole, string>>;

export interface SchemeOptions {
  /** Couleur source ARGB (ex. `GRIDAY_SEED`). Ignorée quand `palettes` est valide. */
  readonly seed: number;
  readonly dark: boolean;
  /** Palettes tonales du fond d'écran (Android 12+) ; prioritaires sur `seed`. */
  readonly palettes?: SystemPalettes | null;
  /** Contraste de -1 (minimal) à 1 (maximal) ; 0 = conception d'origine. */
  readonly contrast?: number;
}

/** `onPrimaryContainer` → `--md-sys-color-on-primary-container`. */
export function colorRoleToCssVar(role: ColorRole): string {
  return `--md-sys-color-${role.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
}

/** Variables CSS (nom → valeur) d'un schéma, prêtes à être posées sur `:root`. */
export function schemeToCssVars(scheme: ColorScheme): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const role of COLOR_ROLES) vars[colorRoleToCssVar(role)] = scheme[role];
  return vars;
}

// --- Palettes du système -------------------------------------------------------------------------

/** Indices (dans les 13 tons du système) des tons 80 à 30 : assez loin des extrêmes écrêtés par le gamut. */
const FIT_INDEXES = SYSTEM_PALETTE_TONES.map((tone, i) => [tone, i] as const)
  .filter(([tone]) => tone >= 30 && tone <= 80)
  .map(([, i]) => i);

const isArgbList = (list: unknown): list is readonly number[] =>
  Array.isArray(list) && list.length >= SYSTEM_PALETTE_TONES.length && list.every((v) => Number.isFinite(v));

/** Vrai si les cinq palettes système contiennent bien les 13 tons attendus. */
export function isSystemPalettes(p: SystemPalettes | null | undefined): p is SystemPalettes {
  return !!p && [p.accent1, p.accent2, p.accent3, p.neutral1, p.neutral2].every(isArgbList);
}

/**
 * Retrouve la `TonalPalette` (teinte, chroma) qui a produit les 13 tons d'une palette système.
 * Le système génère ses palettes avec `TonalPalette.fromHueAndChroma(h, c)` puis arrondit chaque ton
 * en sRGB 8 bits : on lit donc la teinte et le chroma sur les tons moyens (80 à 30), loin des tons
 * extrêmes que le gamut sRGB écrête.
 * - teinte : moyenne circulaire pondérée par le chroma (l'arrondi pèse peu sur les couleurs vives) ;
 * - chroma : moyenne des 3 plus grandes valeurs, ce qui reste exact pour une palette « chroma maximal »
 *   (écrêtée à chaque ton) comme pour une palette à chroma fixe, et amortit le bruit d'arrondi.
 */
export function fitTonalPalette(argbTones: readonly number[]): TonalPalette {
  const samples = FIT_INDEXES.map((i) => Hct.fromInt(argbTones[i] ?? 0));
  const top = samples
    .map((h) => h.chroma)
    .sort((a, b) => b - a)
    .slice(0, 3);
  const chroma = top.reduce((sum, c) => sum + c, 0) / top.length;
  let x = 0;
  let y = 0;
  for (const h of samples) {
    const rad = (h.hue * Math.PI) / 180;
    x += h.chroma * Math.cos(rad);
    y += h.chroma * Math.sin(rad);
  }
  const hue = x === 0 && y === 0 ? (samples[0]?.hue ?? 0) : (((Math.atan2(y, x) * 180) / Math.PI) % 360 + 360) % 360;

  // Palettes très saturées (styles « vibrant » du système) : le chroma demandé dépasse le gamut à la
  // plupart des tons, la lecture directe le sous-estime. On garde, parmi quelques candidats, celui qui
  // reproduit le mieux les 13 tons fournis (les palettes à chroma fixe gardent leur valeur lue).
  let best = TonalPalette.fromHueAndChroma(hue, chroma);
  let bestError = paletteError(best, argbTones);
  for (const factor of [1.15, 1.4, 2, 200 / Math.max(chroma, 1)]) {
    if (bestError <= 3 * SYSTEM_PALETTE_TONES.length) break; // déjà fidèle à l'arrondi près
    const candidate = TonalPalette.fromHueAndChroma(hue, chroma * factor);
    const error = paletteError(candidate, argbTones);
    if (error < bestError) {
      best = candidate;
      bestError = error;
    }
  }
  return best;
}

/** Somme des carrés des écarts de canal sRGB entre une palette et les 13 tons du système. */
function paletteError(palette: TonalPalette, argbTones: readonly number[]): number {
  let sum = 0;
  SYSTEM_PALETTE_TONES.forEach((tone, i) => {
    const a = palette.tone(tone);
    const b = argbTones[i] ?? 0;
    for (const shift of [16, 8, 0]) sum += (((a >> shift) & 255) - ((b >> shift) & 255)) ** 2;
  });
  return sum;
}

interface FittedPalettes {
  readonly source: Hct;
  readonly primary: TonalPalette;
  readonly secondary: TonalPalette;
  readonly tertiary: TonalPalette;
  readonly neutral: TonalPalette;
  readonly neutralVariant: TonalPalette;
}

const fitCache = new WeakMap<SystemPalettes, FittedPalettes>();

/** Palettes M3 reconstruites depuis celles du système (mémorisées par objet). */
export function fitSystemPalettes(p: SystemPalettes): FittedPalettes {
  const cached = fitCache.get(p);
  if (cached) return cached;
  const midIndex = SYSTEM_PALETTE_TONES.indexOf(50);
  const fitted: FittedPalettes = {
    // Teinte et chroma de l'accent principal, au ton 50 : sert de « couleur source » (palette d'erreur).
    source: Hct.fromInt(p.accent1[midIndex] ?? 0xff6750a4),
    primary: fitTonalPalette(p.accent1),
    secondary: fitTonalPalette(p.accent2),
    tertiary: fitTonalPalette(p.accent3),
    neutral: fitTonalPalette(p.neutral1),
    neutralVariant: fitTonalPalette(p.neutral2),
  };
  fitCache.set(p, fitted);
  return fitted;
}

/** Teinte HCT de la palette principale (teinte de la marque ou de l'accent système). */
export function primaryHue(seed: number, palettes?: SystemPalettes | null): number {
  return isSystemPalettes(palettes) ? fitSystemPalettes(palettes).primary.hue : Hct.fromInt(seed).hue;
}

// --- Schéma ------------------------------------------------------------------------------------

const clampContrast = (c: number | undefined): number => (Number.isFinite(c) ? Math.min(1, Math.max(-1, c as number)) : 0);

/** `DynamicScheme` M3 Expressive (spec 2025, TONAL_SPOT) pour une source ou des palettes système. */
export function createDynamicScheme({ seed, dark, palettes, contrast }: SchemeOptions): DynamicScheme {
  const common = {
    variant: Variant.TONAL_SPOT,
    contrastLevel: clampContrast(contrast),
    isDark: dark,
    specVersion: '2025',
    platform: 'phone',
  } as const;
  if (isSystemPalettes(palettes)) {
    const f = fitSystemPalettes(palettes);
    return new DynamicScheme({
      ...common,
      sourceColorHct: f.source,
      primaryPalette: f.primary,
      secondaryPalette: f.secondary,
      tertiaryPalette: f.tertiary,
      neutralPalette: f.neutral,
      neutralVariantPalette: f.neutralVariant,
    });
  }
  return new DynamicScheme({ ...common, sourceColorHct: Hct.fromInt(seed) });
}

/** Tous les rôles de couleur M3 en `#rrggbb`. */
export function createScheme(options: SchemeOptions): ColorScheme {
  const dynamic = createDynamicScheme(options);
  const scheme = {} as Record<ColorRole, string>;
  for (const role of COLOR_ROLES) scheme[role] = argbToHex(dynamic[role]);
  return scheme;
}
