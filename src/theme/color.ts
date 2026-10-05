/**
 * Outils de couleur purs (sans DOM) : conversions sRGB/linéaire/Oklab, contraste WCAG et
 * simulation du daltonisme (Machado et al. 2009, sévérité 1.0). Utilisés par les palettes de
 * régions et par les tests ; aucune dépendance.
 */

/** Canaux sRGB 0..255. */
export type Rgb = readonly [r: number, g: number, b: number];
/** Canaux linéaires 0..1. */
export type LinearRgb = readonly [r: number, g: number, b: number];
/** Coordonnées Oklab (L 0..1). */
export type Oklab = readonly [L: number, a: number, b: number];

export type ColorVisionDeficiency = 'protanopia' | 'deuteranopia' | 'tritanopia';
export const COLOR_VISION_DEFICIENCIES: readonly ColorVisionDeficiency[] = ['protanopia', 'deuteranopia', 'tritanopia'];

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/** `#rrggbb` (ou `#rgb`) vers canaux 0..255. */
export function hexToRgb(hex: string): Rgb {
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new Error(`Couleur invalide : ${hex}`);
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]: Rgb): string {
  const part = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`;
}

/** ARGB 32 bits (entier) vers `#rrggbb`. */
export function argbToHex(argb: number): string {
  return `#${(argb & 0xffffff).toString(16).padStart(6, '0')}`;
}

export function srgbToLinear(c255: number): number {
  const c = c255 / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function linearToSrgb(c: number): number {
  const v = clamp01(c);
  return 255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);
}

export function toLinear(color: string | Rgb): LinearRgb {
  const [r, g, b] = typeof color === 'string' ? hexToRgb(color) : color;
  return [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)];
}

/** Luminance relative WCAG 2.x (0..1). */
export function relativeLuminance(color: string | Rgb): number {
  const [r, g, b] = toLinear(color);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Rapport de contraste WCAG (1..21). */
export function contrastRatio(a: string | Rgb, b: string | Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** sRGB linéaire vers Oklab (Björn Ottosson). */
export function linearToOklab([r, g, b]: LinearRgb): Oklab {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export function toOklab(color: string | Rgb): Oklab {
  return linearToOklab(toLinear(color));
}

/** Distance euclidienne en Oklab × 100 (≈ 1 : à peine perceptible ; ≥ 8 : nettement distinct). */
export function deltaE(a: string | Rgb, b: string | Rgb): number {
  const [l1, a1, b1] = toOklab(a);
  const [l2, a2, b2] = toOklab(b);
  return 100 * Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

type Matrix3 = readonly [readonly [number, number, number], readonly [number, number, number], readonly [number, number, number]];

/** Matrices de Machado et al. (2009), sévérité 1.0, appliquées en sRGB linéaire. */
const CVD_MATRICES: Record<ColorVisionDeficiency, Matrix3> = {
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};

/** Couleur telle que la perçoit une personne atteinte du déficit donné (canaux sRGB 0..255). */
export function simulateColorVision(color: string | Rgb, kind: ColorVisionDeficiency): Rgb {
  const [r, g, b] = toLinear(color);
  const m = CVD_MATRICES[kind];
  const mix = (row: readonly [number, number, number]) => linearToSrgb(row[0] * r + row[1] * g + row[2] * b);
  return [mix(m[0]), mix(m[1]), mix(m[2])];
}

/** Distance perceptuelle entre deux couleurs vues avec le déficit donné. */
export function deltaEColorVision(a: string | Rgb, b: string | Rgb, kind: ColorVisionDeficiency): number {
  return deltaE(simulateColorVision(a, kind), simulateColorVision(b, kind));
}
