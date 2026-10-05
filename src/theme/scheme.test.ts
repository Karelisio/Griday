import { Hct, TonalPalette } from '@material/material-color-utilities';
import { describe, expect, it } from 'vitest';
import { SYSTEM_PALETTE_TONES } from '../shared/systemPalettes';
import { contrastRatio } from './color';
import { fakeSystemPalettes } from './fakePalettes';
import {
  COLOR_ROLES,
  GRIDAY_SEED,
  colorRoleToCssVar,
  createScheme,
  fitTonalPalette,
  isSystemPalettes,
  primaryHue,
  schemeToCssVars,
  type ColorRole,
  type SchemeOptions,
} from './scheme';

const SEEDS = [GRIDAY_SEED, 0xff0061a4, 0xff386a20, 0xffb3261e, 0xffe3b800, 0xff00696b, 0xff777777];
const hue = (hex: string) => Hct.fromInt(parseInt(hex.slice(1), 16) | 0xff000000).hue;

const cases: { name: string; options: SchemeOptions }[] = [];
for (const dark of [false, true]) {
  for (const seed of SEEDS) cases.push({ name: `graine ${seed.toString(16)} ${dark ? 'sombre' : 'clair'}`, options: { seed, dark } });
  for (const h of [30, 140, 270]) {
    cases.push({ name: `palettes système h=${h} ${dark ? 'sombre' : 'clair'}`, options: { seed: GRIDAY_SEED, dark, palettes: fakeSystemPalettes(h) } });
  }
}

/** Paires (texte, fond) dont le contraste doit atteindre 4,5:1 (AA texte normal). */
const PAIRS: readonly (readonly [ColorRole, ColorRole])[] = [
  ['onPrimary', 'primary'],
  ['onPrimaryContainer', 'primaryContainer'],
  ['onSecondary', 'secondary'],
  ['onSecondaryContainer', 'secondaryContainer'],
  ['onTertiary', 'tertiary'],
  ['onTertiaryContainer', 'tertiaryContainer'],
  ['onError', 'error'],
  ['onErrorContainer', 'errorContainer'],
  ['onSurface', 'surface'],
  ['onSurface', 'surfaceContainer'],
  ['onSurface', 'surfaceContainerHighest'],
  ['onSurfaceVariant', 'surfaceContainerHighest'],
  ['onBackground', 'background'],
  ['inverseOnSurface', 'inverseSurface'],
  ['onPrimaryFixed', 'primaryFixed'],
  ['onSecondaryFixed', 'secondaryFixed'],
  ['onTertiaryFixed', 'tertiaryFixed'],
];

describe('createScheme', () => {
  it('définit tous les rôles M3 en #rrggbb', () => {
    const scheme = createScheme({ seed: GRIDAY_SEED, dark: false });
    expect(Object.keys(scheme).sort()).toEqual([...COLOR_ROLES].sort());
    for (const role of COLOR_ROLES) expect(scheme[role]).toMatch(/^#[0-9a-f]{6}$/);
    // Rôles demandés explicitement.
    for (const role of [
      'primaryFixedDim',
      'onPrimaryFixedVariant',
      'surfaceDim',
      'surfaceBright',
      'surfaceContainerLowest',
      'surfaceContainerLow',
      'inversePrimary',
      'outlineVariant',
      'shadow',
      'scrim',
      'surfaceTint',
    ] as const) {
      expect(scheme[role]).toBeDefined();
    }
  });

  it.each(cases)('contraste texte/fond ≥ 4,5:1 : $name', ({ options }) => {
    const scheme = createScheme(options);
    for (const [on, bg] of PAIRS) {
      expect(contrastRatio(scheme[on], scheme[bg]), `${on} sur ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('suit la spec M3 : surfaces claires en mode clair, sombres en mode sombre', () => {
    const light = createScheme({ seed: GRIDAY_SEED, dark: false });
    const dark = createScheme({ seed: GRIDAY_SEED, dark: true });
    expect(contrastRatio(light.surface, '#ffffff')).toBeLessThan(1.1);
    expect(contrastRatio(dark.surface, '#000000')).toBeLessThan(1.3);
    expect(light.shadow).toBe('#000000');
    expect(dark.scrim).toBe('#000000');
    // Hiérarchie des conteneurs : de plus en plus contrastés avec la surface.
    expect(contrastRatio(light.surfaceContainerHighest, light.surface)).toBeGreaterThan(contrastRatio(light.surfaceContainerLow, light.surface));
  });

  it('la teinte principale suit la couleur source', () => {
    const scheme = createScheme({ seed: 0xff0061a4, dark: false });
    expect(Math.abs(hue(scheme.primary) - Hct.fromInt(0xff0061a4).hue)).toBeLessThan(6);
  });

  it('est déterministe et sensible à la graine, au mode et au contraste', () => {
    const a = createScheme({ seed: GRIDAY_SEED, dark: false });
    expect(createScheme({ seed: GRIDAY_SEED, dark: false })).toEqual(a);
    expect(createScheme({ seed: 0xffb3261e, dark: false }).primary).not.toBe(a.primary);
    expect(createScheme({ seed: GRIDAY_SEED, dark: true }).surface).not.toBe(a.surface);
    const boosted = createScheme({ seed: GRIDAY_SEED, dark: false, contrast: 1 });
    expect(contrastRatio(boosted.onPrimary, boosted.primary)).toBeGreaterThan(contrastRatio(a.onPrimary, a.primary));
    // Valeurs hors bornes ou invalides : ramenées dans [-1, 1], jamais d'exception.
    expect(createScheme({ seed: GRIDAY_SEED, dark: false, contrast: 5 })).toEqual(boosted);
    expect(createScheme({ seed: GRIDAY_SEED, dark: false, contrast: Number.NaN })).toEqual(a);
  });

  it('suit les palettes du système quand elles sont fournies', () => {
    const palettes = fakeSystemPalettes(140);
    const fromSystem = createScheme({ seed: GRIDAY_SEED, dark: false, palettes });
    const fromSeed = createScheme({ seed: GRIDAY_SEED, dark: false });
    expect(fromSystem.primary).not.toBe(fromSeed.primary);
    expect(Math.abs(hue(fromSystem.primary) - 140)).toBeLessThan(6);
    // Les neutres portent aussi la teinte du fond d'écran.
    expect(Math.abs(hue(fromSystem.surfaceContainer) - 140)).toBeLessThan(25);
  });

  it('ignore des palettes invalides et retombe sur la graine', () => {
    const bad = { accent1: [1, 2, 3], accent2: [], accent3: [], neutral1: [], neutral2: [] };
    expect(isSystemPalettes(bad)).toBe(false);
    expect(createScheme({ seed: GRIDAY_SEED, dark: true, palettes: bad })).toEqual(createScheme({ seed: GRIDAY_SEED, dark: true }));
    expect(createScheme({ seed: GRIDAY_SEED, dark: true, palettes: null })).toEqual(createScheme({ seed: GRIDAY_SEED, dark: true }));
  });
});

describe('palettes système', () => {
  const tones = (p: TonalPalette) => SYSTEM_PALETTE_TONES.map((t) => p.tone(t));
  const channels = (argb: number) => [(argb >> 16) & 255, (argb >> 8) & 255, argb & 255];

  it.each([
    [270, 36],
    [24, 36],
    [110, 16],
    [200, 24],
    [330, 6],
    [90, 8],
    [30, 100],
    [260, 200],
  ])('reconstruit exactement la palette (teinte %d, chroma %d)', (h, c) => {
    const given = tones(TonalPalette.fromHueAndChroma(h, c));
    const rebuilt = tones(fitTonalPalette(given));
    given.forEach((argb, i) => {
      const a = channels(argb);
      const b = channels(rebuilt[i] as number);
      for (let k = 0; k < 3; k++) expect(Math.abs((a[k] as number) - (b[k] as number)), `ton ${SYSTEM_PALETTE_TONES[i]}`).toBeLessThanOrEqual(2);
    });
  });

  it('primaryHue lit la teinte de la marque ou de l’accent système', () => {
    expect(primaryHue(GRIDAY_SEED)).toBeCloseTo(Hct.fromInt(GRIDAY_SEED).hue, 5);
    expect(Math.abs(primaryHue(GRIDAY_SEED, fakeSystemPalettes(75)) - 75)).toBeLessThan(1.5);
  });
});

describe('variables CSS', () => {
  it('colorRoleToCssVar met en kebab-case', () => {
    expect(colorRoleToCssVar('primary')).toBe('--md-sys-color-primary');
    expect(colorRoleToCssVar('onPrimaryContainer')).toBe('--md-sys-color-on-primary-container');
    expect(colorRoleToCssVar('surfaceContainerHighest')).toBe('--md-sys-color-surface-container-highest');
    expect(colorRoleToCssVar('inverseOnSurface')).toBe('--md-sys-color-inverse-on-surface');
  });

  it('schemeToCssVars couvre tous les rôles', () => {
    const vars = schemeToCssVars(createScheme({ seed: GRIDAY_SEED, dark: false }));
    expect(Object.keys(vars)).toHaveLength(COLOR_ROLES.length);
    expect(vars['--md-sys-color-surface-container-low']).toMatch(/^#[0-9a-f]{6}$/);
  });
});
