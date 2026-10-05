import { Hct } from '@material/material-color-utilities';
import { describe, expect, it } from 'vitest';
import { COLOR_VISION_DEFICIENCIES, contrastRatio, deltaE, deltaEColorVision, relativeLuminance } from './color';
import { fakeSystemPalettes } from './fakePalettes';
import { REGION_PATTERNS, hueRing, regionPalette, regionPatternStyle, regionStyle, type RegionPaletteOptions } from './regions';
import { GRIDAY_SEED, primaryHue } from './scheme';

type Source = Pick<RegionPaletteOptions, 'seed' | 'palettes'> & { name: string };
const SOURCES: Source[] = [
  { name: 'marque', seed: GRIDAY_SEED },
  { name: 'bleu', seed: 0xff0061a4 },
  { name: 'vert', seed: 0xff386a20 },
  { name: 'rouge', seed: 0xffb3261e },
  { name: 'jaune', seed: 0xffe3b800 },
  { name: 'gris', seed: 0xff777777 },
  { name: 'système (vert)', palettes: fakeSystemPalettes(140) },
  { name: 'système (orange)', palettes: fakeSystemPalettes(50) },
];
const COUNTS = [4, 5, 6, 7, 8, 9, 10, 11, 12];

describe('regionPalette', () => {
  it('renvoie count couleurs complètes et déterministes', () => {
    for (const count of COUNTS) {
      const palette = regionPalette({ dark: false, count });
      expect(palette).toHaveLength(count);
      for (const c of palette) {
        expect(c.fill).toMatch(/^#[0-9a-f]{6}$/);
        expect(c.on).toMatch(/^#[0-9a-f]{6}$/);
        expect([0, 1, 2, 3]).toContain(c.pattern);
      }
      expect(regionPalette({ dark: false, count })).toEqual(palette);
    }
    expect(regionPalette({ dark: true, count: 0 })).toEqual([]);
    expect(regionPalette({ dark: true, count: 1 })).toHaveLength(1);
  });

  it('les fonds sont tous différents et les textures alternent', () => {
    for (const dark of [false, true]) {
      for (const count of COUNTS) {
        const palette = regionPalette({ dark, count });
        expect(new Set(palette.map((c) => c.fill)).size).toBe(count);
        palette.forEach((c, i) => expect(c.pattern).toBe(i % 4));
      }
    }
  });

  it('suit la teinte principale du thème (graine ou palettes système)', () => {
    for (const source of SOURCES) {
      const base = primaryHue(source.seed ?? GRIDAY_SEED, source.palettes);
      const first = regionPalette({ ...source, dark: false, count: 8 })[0];
      const hue = Hct.fromInt(parseInt((first?.fill ?? '#000000').slice(1), 16) | 0xff000000).hue;
      const diff = Math.abs(((hue - base + 540) % 360) - 180);
      // Les neutres (gris) n'ont pas de teinte stable : seul le test coloré compte.
      if (source.name !== 'gris') expect(diff, source.name).toBeLessThan(6);
    }
    // Deux thèmes de teintes différentes donnent des palettes différentes.
    expect(regionPalette({ seed: 0xff0061a4, dark: false, count: 8 })).not.toEqual(regionPalette({ seed: 0xffb3261e, dark: false, count: 8 }));
  });

  it('les tons clairs/foncés restent dans les plages prévues', () => {
    const light = regionPalette({ dark: false, count: 10 }).map((c) => Hct.fromInt(parseInt(c.fill.slice(1), 16) | 0xff000000).tone);
    const dark = regionPalette({ dark: true, count: 10 }).map((c) => Hct.fromInt(parseInt(c.fill.slice(1), 16) | 0xff000000).tone);
    for (const t of light) expect(t).toBeGreaterThan(70);
    for (const t of dark) expect(t).toBeLessThan(48);
    expect(Math.min(...light)).toBeGreaterThan(Math.max(...dark));
  });

  describe.each([false, true])('mode sombre : %s', (dark) => {
    it.each(SOURCES)('le symbole `on` est contrasté ≥ 4,5:1 sur tous les fonds ($name)', (source) => {
      for (const count of COUNTS) {
        const palette = regionPalette({ ...source, dark, count });
        for (const c of palette) {
          for (const bg of palette) {
            expect(contrastRatio(c.on, bg.fill), `${source.name} n=${count}`).toBeGreaterThanOrEqual(4.5);
          }
        }
      }
    });

    it.each(SOURCES)('deux régions consécutives diffèrent par la luminance et la couleur ($name)', (source) => {
      for (const count of COUNTS) {
        const palette = regionPalette({ ...source, dark, count });
        for (let i = 0; i + 1 < count; i++) {
          const a = palette[i]!.fill;
          const b = palette[i + 1]!.fill;
          const ratio = contrastRatio(a, b);
          expect(ratio, `luminance ${source.name} n=${count} ${i}/${i + 1}`).toBeGreaterThanOrEqual(1.25);
          expect(relativeLuminance(a)).not.toBeCloseTo(relativeLuminance(b), 2);
          expect(deltaE(a, b), `vision normale ${source.name} n=${count}`).toBeGreaterThanOrEqual(10);
        }
      }
    });

    it.each(SOURCES)('deux régions consécutives restent distinctes en protanopie, deutéranopie et tritanopie ($name)', (source) => {
      for (const count of [6, 7, 8, 9, 10]) {
        const palette = regionPalette({ ...source, dark, count });
        for (let i = 0; i + 1 < count; i++) {
          for (const kind of COLOR_VISION_DEFICIENCIES) {
            const d = deltaEColorVision(palette[i]!.fill, palette[i + 1]!.fill, kind);
            expect(d, `${kind} ${source.name} n=${count} ${i}/${i + 1}`).toBeGreaterThanOrEqual(6);
          }
        }
      }
    });

    it.each(SOURCES)('toutes les paires restent discernables en vision normale ($name)', (source) => {
      for (const count of COUNTS) {
        const palette = regionPalette({ ...source, dark, count });
        for (let i = 0; i < count; i++) {
          for (let j = i + 1; j < count; j++) {
            expect(deltaE(palette[i]!.fill, palette[j]!.fill), `${source.name} n=${count} ${i}/${j}`).toBeGreaterThanOrEqual(3);
          }
        }
      }
    });
  });
});

describe('hueRing', () => {
  const circular = (a: number, b: number, size: number) => Math.min(Math.abs(a - b), size - Math.abs(a - b));

  it('est une injection qui garde la parité et place la région 0 sur la teinte du thème', () => {
    for (let n = 1; n <= 16; n++) {
      const { size, order } = hueRing(n);
      expect(size % 2).toBe(0);
      expect(order).toHaveLength(n);
      expect(new Set(order).size).toBe(n);
      expect(order[0]).toBe(0);
      order.forEach((slot, i) => {
        expect(slot).toBeGreaterThanOrEqual(0);
        expect(slot).toBeLessThan(size);
        expect(slot % 2, `n=${n} i=${i}`).toBe(i % 2);
      });
    }
  });

  it('écarte les régions consécutives de la grille (≥ 90° de teinte pour 7 à 12 régions)', () => {
    for (let n = 5; n <= 16; n++) {
      const { size, order } = hueRing(n);
      const min = Math.min(...order.slice(1).map((slot, i) => circular(slot, order[i]!, size))) * (360 / size);
      expect(min, `n=${n}`).toBeGreaterThanOrEqual(n >= 7 && n <= 12 ? 90 : 60);
    }
  });
});

describe('textures', () => {
  it('regionPatternStyle : aucune texture pour 0, une image pour 1 à 3, rebouclage au-delà', () => {
    expect(REGION_PATTERNS).toEqual(['none', 'dots', 'stripes', 'crosshatch']);
    expect(regionPatternStyle(0, '#000000')).toBeUndefined();
    for (const p of [1, 2, 3]) expect(regionPatternStyle(p, '#101010')?.backgroundImage).toContain('#101010');
    expect(regionPatternStyle(5, '#000000')).toEqual(regionPatternStyle(1, '#000000'));
    expect(regionPatternStyle(-1, '#000000')).toEqual(regionPatternStyle(3, '#000000'));
  });

  it('regionStyle pose le fond, la couleur et les variables', () => {
    const color = { fill: '#aabbcc', on: '#112233', pattern: 2 };
    const plain = regionStyle(color);
    expect(plain.backgroundColor).toBe('#aabbcc');
    expect(plain.color).toBe('#112233');
    expect(plain.backgroundImage).toBeUndefined();
    const dotted = regionStyle(color, true);
    expect(dotted.backgroundImage).toContain('repeating-linear-gradient');
    expect((dotted as Record<string, unknown>)['--md-region-fill']).toBe('#aabbcc');
  });
});
