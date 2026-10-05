/**
 * Palettes système factices (mêmes proportions que le style TonalSpot d'Android) :
 * pour les tests et la galerie, sans appareil Android.
 */
import { TonalPalette } from '@material/material-color-utilities';
import { SYSTEM_PALETTE_TONES, type SystemPalettes } from '../shared/systemPalettes';

const tones = (hue: number, chroma: number): number[] => {
  const palette = TonalPalette.fromHueAndChroma(hue, chroma);
  return SYSTEM_PALETTE_TONES.map((tone) => palette.tone(tone));
};

/** Palettes `accent1..3` / `neutral1..2` d'un fond d'écran de teinte HCT `hue`. */
export function fakeSystemPalettes(hue: number): SystemPalettes {
  return {
    accent1: tones(hue, 36),
    accent2: tones(hue, 16),
    accent3: tones((hue + 60) % 360, 24),
    neutral1: tones(hue, 6),
    neutral2: tones(hue, 8),
  };
}
