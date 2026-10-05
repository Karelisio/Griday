/** Thème Material 3 Expressive de Griday : schéma de couleurs, régions du plateau, mouvement, fournisseur. */
export { ThemeProvider, useTheme, usePrefersDark } from './ThemeProvider';
export type { ThemeMode, ThemeProviderProps, ThemeValue } from './ThemeProvider';
export { COLOR_ROLES, GRIDAY_SEED, colorRoleToCssVar, createScheme, schemeToCssVars } from './scheme';
export type { ColorRole, ColorScheme, SchemeOptions } from './scheme';
export { REGION_PATTERNS, regionPalette, regionPatternStyle, regionStyle } from './regions';
export type { RegionColor, RegionPaletteOptions, RegionPatternName } from './regions';
export { FADE_ONLY, INSTANT, SPRING_SPECS, motionTokensFor, spring, springToCssLinear, springs, useMotionTokens, usePrefersReducedMotion } from './motion';
export type { MotionTokens, SpringSpec, SpringSpeed } from './motion';
export {
  COLOR_VISION_DEFICIENCIES,
  contrastRatio,
  deltaE,
  deltaEColorVision,
  relativeLuminance,
  simulateColorVision,
} from './color';
export type { ColorVisionDeficiency } from './color';
