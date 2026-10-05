import { describe, expect, it } from 'vitest';
import {
  COLOR_VISION_DEFICIENCIES,
  argbToHex,
  contrastRatio,
  deltaE,
  deltaEColorVision,
  hexToRgb,
  relativeLuminance,
  rgbToHex,
  simulateColorVision,
} from './color';

describe('color', () => {
  it('convertit hex et rgb dans les deux sens', () => {
    expect(hexToRgb('#ff8000')).toEqual([255, 128, 0]);
    expect(hexToRgb('#abc')).toEqual([170, 187, 204]);
    expect(rgbToHex([255, 128, 0])).toBe('#ff8000');
    expect(argbToHex(0xff5b4fc4)).toBe('#5b4fc4');
    expect(() => hexToRgb('rouge')).toThrow();
  });

  it('calcule le contraste WCAG', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1, 5);
    expect(contrastRatio('#ffffff', '#767676')).toBeCloseTo(4.54, 1);
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 5);
  });

  it('distance perceptuelle : nulle entre identiques, symétrique, croissante', () => {
    expect(deltaE('#336699', '#336699')).toBe(0);
    expect(deltaE('#336699', '#6699cc')).toBeCloseTo(deltaE('#6699cc', '#336699'), 10);
    expect(deltaE('#000000', '#ffffff')).toBeGreaterThan(95);
    expect(deltaE('#808080', '#828282')).toBeLessThan(1.5);
  });

  it('simulation du daltonisme : le blanc et les gris sont préservés', () => {
    for (const kind of COLOR_VISION_DEFICIENCIES) {
      const white = simulateColorVision('#ffffff', kind);
      expect(white.every((c) => Math.abs(c - 255) < 2)).toBe(true);
      const gray = simulateColorVision('#808080', kind);
      expect(gray.every((c) => Math.abs(c - 128) < 3)).toBe(true);
    }
  });

  it('simulation du daltonisme : le rouge et le vert se rapprochent pour un protanope', () => {
    const normal = deltaE('#c0392b', '#2e8b57');
    const protan = deltaEColorVision('#c0392b', '#2e8b57', 'protanopia');
    expect(protan).toBeLessThan(normal);
  });
});
