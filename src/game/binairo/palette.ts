/**
 * Couleurs des deux symboles de Binairo : le soleil est chaud (ambre), la lune froide (azur). Elles ne
 * suivent pas la couleur du thème : un soleil reste chaud quel que soit le fond d'écran. Elles sont réglées
 * en HCT sur des TONS fixes : le contraste WCAG ne dépend que de l'écart de ton, il est donc le même pour
 * toutes les teintes et tous les thèmes. La couleur double la FORME (disque à rayons / croissant), elle ne la
 * remplace jamais.
 *
 * Chaque symbole a une tuile teintée (conteneur) et une encre (couleur « sur le conteneur ») ; les cases
 * données sont plus soutenues (tuile plus foncée en clair, plus claire en sombre, encre plus appuyée).
 */
import { Hct } from '@material/material-color-utilities';
import { argbToHex } from '../../theme/color';

export interface SymbolColors {
  /** Fond de la case portant ce symbole (posé par le joueur). */
  readonly tile: string;
  /** Couleur du symbole posé par le joueur (contraste ≥ 4,5:1 sur `tile`). */
  readonly ink: string;
  /** Fond d'une case donnée. */
  readonly givenTile: string;
  /** Symbole d'une case donnée (contraste ≥ 4,5:1 sur `givenTile`). */
  readonly givenInk: string;
}

export interface BinairoPalette {
  readonly sun: SymbolColors;
  readonly moon: SymbolColors;
}

/** Teinte HCT de chaque symbole (ambre / azur). */
export const SYMBOL_HUES = { sun: 70, moon: 250 } as const;

/** Chroma et ton HCT de chaque couleur, par thème. */
export const SYMBOL_LEVELS = {
  light: {
    tile: { chroma: 45, tone: 90 },
    ink: { chroma: 80, tone: 34 },
    givenTile: { chroma: 60, tone: 80 },
    givenInk: { chroma: 90, tone: 22 },
  },
  dark: {
    tile: { chroma: 34, tone: 22 },
    ink: { chroma: 60, tone: 86 },
    givenTile: { chroma: 45, tone: 34 },
    givenInk: { chroma: 30, tone: 94 },
  },
} as const;

const cache = new Map<boolean, BinairoPalette>();

function symbolColors(hue: number, dark: boolean): SymbolColors {
  const level = dark ? SYMBOL_LEVELS.dark : SYMBOL_LEVELS.light;
  const hex = ({ chroma, tone }: { readonly chroma: number; readonly tone: number }) => argbToHex(Hct.from(hue, chroma, tone).toInt());
  return { tile: hex(level.tile), ink: hex(level.ink), givenTile: hex(level.givenTile), givenInk: hex(level.givenInk) };
}

/** Palette des symboles pour le thème clair ou sombre (mémorisée). */
export function binairoPalette(dark: boolean): BinairoPalette {
  let palette = cache.get(dark);
  if (!palette) {
    palette = { sun: symbolColors(SYMBOL_HUES.sun, dark), moon: symbolColors(SYMBOL_HUES.moon, dark) };
    cache.set(dark, palette);
  }
  return palette;
}
