/**
 * Palettes tonales du système Android 12+ (Material You, issues du fond d'écran).
 * Chaque tableau contient 13 couleurs ARGB (entiers non signés) dans l'ordre des ressources
 * android.R.color.system_<palette>_{0,10,50,100,200,300,400,500,600,700,800,900,1000},
 * soit les tons HCT 100, 99, 95, 90, 80, 70, 60, 50, 40, 30, 20, 10, 0.
 */
export interface SystemPalettes {
  readonly accent1: readonly number[];
  readonly accent2: readonly number[];
  readonly accent3: readonly number[];
  readonly neutral1: readonly number[];
  readonly neutral2: readonly number[];
}

/** Tons correspondant aux 13 entrées de chaque palette système. */
export const SYSTEM_PALETTE_TONES = [100, 99, 95, 90, 80, 70, 60, 50, 40, 30, 20, 10, 0] as const;
