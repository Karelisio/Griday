/**
 * Couleurs des régions de la grille Queens, harmonisées avec le thème et lisibles par tous.
 *
 * - Teintes : la région 0 prend la teinte principale du thème (HCT) ; les autres se répartissent
 *   à pas égaux sur le cercle des teintes selon un parcours « à pas d'or » : deux indices consécutifs
 *   (souvent voisins sur la grille) diffèrent d'au moins ~90° de teinte, jusqu'à ~140°.
 * - Teintes boueuses : la bande jaune-vert/olive (kaki en clair, olive foncé en sombre) est exclue du
 *   cercle : les teintes sont réparties sur le reste, sans jamais tomber dans la bande. Aucune couleur
 *   n'est « détestée » au sens de `DislikeAnalyzer` de Material (teinte 90-111°, chroma > 16, ton < 65).
 * - Tons : deux niveaux alternés entre indices consécutifs (clair/foncé). Cet écart de luminance
 *   reste visible sans distinction des couleurs (protanopie, deutéranopie, tritanopie). Le parcours
 *   conserve la parité : deux teintes voisines sur le cercle ont aussi des tons différents.
 *   Clair : pastels (tons 93 et 81). Sombre : conteneurs tonals doux (tons 46 et 33, chroma modéré).
 * - `on` (reine, croix) est contrasté ≥ 4,5:1 sur TOUS les fonds de la palette.
 * - `pattern` (0..3) désigne une texture optionnelle (voir `regionPatternStyle` et regions.css).
 */
import { Hct } from '@material/material-color-utilities';
import type { CSSProperties } from 'react';
import type { SystemPalettes } from '../shared/systemPalettes';
import { argbToHex } from './color';
import { GRIDAY_SEED, primaryHue } from './scheme';

export interface RegionColor {
  /** Couleur de fond de la région (`#rrggbb`). */
  readonly fill: string;
  /** Couleur des symboles posés dessus (reine, croix), contrastée ≥ 4,5:1 sur tous les fonds. */
  readonly on: string;
  /** Texture optionnelle : 0 aucune, 1 points, 2 rayures, 3 hachures croisées. */
  readonly pattern: number;
}

export interface RegionPaletteOptions {
  /** Couleur source ARGB (défaut : violet Griday). */
  readonly seed?: number;
  /** Palettes du système : leur teinte principale prime sur `seed`. */
  readonly palettes?: SystemPalettes | null;
  readonly dark: boolean;
  /** Nombre de régions (4..12 en jeu ; toute valeur entière ≥ 0 est acceptée). */
  readonly count: number;
}

/**
 * Niveaux de ton (haut puis bas, alternés par indice), chroma de fond, ton des symboles et bande de
 * teintes HCT exclue [début, fin] (jaune-vert/olive, boueux à ces tons : kaki en clair, olive en sombre).
 */
const LEVELS = {
  light: { tones: [93, 81], chroma: 38, onTone: 10, onChroma: 12, avoid: [84, 132] },
  dark: { tones: [46, 33], chroma: 29, onTone: 98, onChroma: 12, avoid: [70, 135] },
} as const;

/** Bande de teintes HCT [début, fin] à ne jamais utiliser pour un fond. */
type HueBand = readonly [start: number, end: number];

/**
 * Teinte HCT de la case `slot` de l'anneau (`size` cases) autour de la teinte de base, en sautant la
 * bande exclue : le cercle est « refermé » sur le reste des teintes, les cases y sont à pas égaux.
 * Une base située dans la bande est ramenée sur son bord le plus proche.
 */
export function ringHue(base: number, slot: number, size: number, [start, end]: HueBand): number {
  const width = end - start;
  const span = 360 - width;
  // Coordonnée de la base sur le cercle refermé ; dans la bande, on prend le bord le plus proche.
  let baseRaw: number;
  if (base <= start) baseRaw = base;
  else if (base >= end) baseRaw = base - width;
  else baseRaw = base - start <= end - base ? start : start + 1e-9; // `start` donne la teinte `start`, `start + ε` la teinte `end`
  const r = (baseRaw + (slot * span) / size) % span;
  return r <= start ? r : r + width;
}

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/** Anneau de teintes (taille paire) et case de chaque région pour `count` régions. */
export function hueRing(count: number): { readonly size: number; readonly order: readonly number[] } {
  const n = Math.max(0, Math.floor(count));
  const size = Math.max(2, n % 2 === 0 ? n : n + 1);
  const table = HUE_ORDER[n];
  if (table) return { size, order: table };
  // Pas impair, premier avec N, le plus proche de 0,382·N : la suite i·pas mod N garde la parité de i.
  let step = 1;
  for (let k = 1; k < size; k += 2) {
    if (gcd(k, size) === 1 && Math.abs(k - 0.382 * size) < Math.abs(step - 0.382 * size)) step = k;
  }
  return { size, order: Array.from({ length: n }, (_, i) => (i * step) % size) };
}

const cache = new Map<string, readonly RegionColor[]>();

/** Palette de `count` couleurs de région, déterministe pour (teinte du thème, mode, count). */
export function regionPalette({ seed = GRIDAY_SEED, palettes, dark, count }: RegionPaletteOptions): RegionColor[] {
  const base = primaryHue(seed, palettes);
  const n = Math.max(0, Math.floor(count));
  const key = `${base.toFixed(2)}|${dark ? 'd' : 'l'}|${n}`;
  const hit = cache.get(key);
  if (hit) return hit.slice();

  const level = dark ? LEVELS.dark : LEVELS.light;
  const { size, order } = hueRing(n);
  const palette = order.map((slot, i): RegionColor => {
    const hue = ringHue(base, slot, size, level.avoid);
    return {
      fill: argbToHex(Hct.from(hue, level.chroma, level.tones[i % 2] as number).toInt()),
      on: argbToHex(Hct.from(hue, level.onChroma, level.onTone).toInt()),
      pattern: i % 4,
    };
  });
  if (cache.size > 96) cache.clear();
  cache.set(key, palette);
  return palette.slice();
}

// --- Textures d'accessibilité ------------------------------------------------------------------

export const REGION_PATTERNS = ['none', 'dots', 'stripes', 'crosshatch'] as const;
export type RegionPatternName = (typeof REGION_PATTERNS)[number];

/**
 * Image de fond CSS de la texture `pattern` (0..3), tracée avec la couleur d'encre `ink`
 * (en général `RegionColor.on`) à faible opacité ; `undefined` pour 0 (aucune texture).
 * À poser par-dessus `background-color` (la couleur de fond de la région).
 */
export function regionPatternStyle(pattern: number, ink: string): CSSProperties | undefined {
  const mark = `color-mix(in srgb, ${ink} 32%, transparent)`;
  switch (((Math.trunc(pattern) % 4) + 4) % 4) {
    case 1:
      return {
        backgroundImage: `radial-gradient(circle at 50% 50%, ${mark} 0 1.5px, transparent 1.7px)`,
        backgroundSize: '8px 8px',
      };
    case 2:
      return { backgroundImage: `repeating-linear-gradient(45deg, ${mark} 0 1.5px, transparent 1.5px 7px)` };
    case 3:
      return {
        backgroundImage: [
          `repeating-linear-gradient(45deg, ${mark} 0 1px, transparent 1px 8px)`,
          `repeating-linear-gradient(-45deg, ${mark} 0 1px, transparent 1px 8px)`,
        ].join(', '),
      };
    default:
      return undefined;
  }
}

/**
 * Style en ligne d'une case de région : fond, couleur des symboles et, si `patterns`, la texture.
 * Pose aussi `--md-region-fill` / `--md-region-on` (utilisables par regions.css et par les enfants).
 */
export function regionStyle(color: RegionColor, patterns = false): CSSProperties {
  return {
    backgroundColor: color.fill,
    color: color.on,
    ...(patterns ? regionPatternStyle(color.pattern, color.on) : null),
    ['--md-region-fill' as string]: color.fill,
    ['--md-region-on' as string]: color.on,
  };
}
