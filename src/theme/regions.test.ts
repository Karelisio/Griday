import { DislikeAnalyzer, Hct } from '@material/material-color-utilities';
import { describe, expect, it } from 'vitest';
import { COLOR_VISION_DEFICIENCIES, contrastRatio, deltaE, deltaEColorVision, relativeLuminance } from './color';
import { fakeSystemPalettes } from './fakePalettes';
import { REGION_PATTERNS, hueRing, regionPalette, regionPatternStyle, regionStyle, ringHue, type RegionPaletteOptions } from './regions';
import { GRIDAY_SEED, primaryHue } from './scheme';

type Source = Pick<RegionPaletteOptions, 'seed' | 'palettes'> & { name: string };
const SOURCES: Source[] = [
  { name: 'marque', seed: GRIDAY_SEED },
  { name: 'bleu', seed: 0xff0061a4 },
  { name: 'vert', seed: 0xff386a20 },
  { name: 'rouge', seed: 0xffb3261e },
  { name: 'jaune', seed: 0xffe3b800 },
  { name: 'olive', seed: 0xff808000 },
  { name: 'gris', seed: 0xff777777 },
  { name: 'système (vert)', palettes: fakeSystemPalettes(140) },
  { name: 'système (orange)', palettes: fakeSystemPalettes(50) },
  { name: 'système (jaune-vert)', palettes: fakeSystemPalettes(104) },
];

/** Bandes de teintes exclues des fonds (voir LEVELS dans regions.ts). */
const AVOID = { light: [84, 142], dark: [70, 135] } as const;
const hctOf = (hex: string) => Hct.fromInt(parseInt(hex.slice(1), 16) | 0xff000000);
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

  it('suit la teinte principale du thème (graine ou palettes système), hors bande boueuse', () => {
    for (const source of SOURCES) {
      if (source.name === 'gris') continue; // les neutres n'ont pas de teinte stable
      const base = primaryHue(source.seed ?? GRIDAY_SEED, source.palettes);
      for (const dark of [false, true]) {
        const [start, end] = AVOID[dark ? 'dark' : 'light'];
        const first = regionPalette({ ...source, dark, count: 8 })[0];
        const hue = hctOf(first?.fill ?? '#000000').hue;
        const inBand = base > start && base < end;
        // Hors bande : la région 0 garde la teinte du thème ; dans la bande : repli sur un bord.
        const expected = inBand ? (base - start <= end - base ? start : end) : base;
        const diff = Math.abs(((hue - expected + 540) % 360) - 180);
        expect(diff, `${source.name} ${dark ? 'sombre' : 'clair'}`).toBeLessThan(6);
      }
    }
    // Deux thèmes de teintes différentes donnent des palettes différentes.
    expect(regionPalette({ seed: 0xff0061a4, dark: false, count: 8 })).not.toEqual(regionPalette({ seed: 0xffb3261e, dark: false, count: 8 }));
  });

  it('aucun fond n’est « détesté » par Material (olive/kaki) et aucune teinte n’entre dans la bande boueuse', () => {
    for (const source of SOURCES) {
      for (const dark of [false, true]) {
        const [start, end] = AVOID[dark ? 'dark' : 'light'];
        for (const count of COUNTS) {
          for (const color of regionPalette({ ...source, dark, count })) {
            const hct = hctOf(color.fill);
            expect(DislikeAnalyzer.isDisliked(hct), `${source.name} ${color.fill}`).toBe(false);
            // Marge de 3° : la teinte relue sur un hex arrondi bouge un peu, surtout à faible chroma.
            if (hct.chroma > 8) expect(hct.hue > start + 3 && hct.hue < end - 3, `${source.name} ${color.fill} teinte ${hct.hue.toFixed(0)}`).toBe(false);
          }
        }
      }
    }
  });

  it('clair : pastels (tons 80 à 94) ; sombre : conteneurs doux (tons 30 à 48, chroma modéré)', () => {
    const light = regionPalette({ dark: false, count: 10 }).map((c) => hctOf(c.fill));
    const dark = regionPalette({ dark: true, count: 10 }).map((c) => hctOf(c.fill));
    for (const h of light) {
      expect(h.tone).toBeGreaterThan(79);
      expect(h.tone).toBeLessThan(95);
    }
    for (const h of dark) {
      expect(h.tone).toBeGreaterThan(30);
      expect(h.tone).toBeLessThan(48);
      expect(h.chroma).toBeLessThanOrEqual(32);
    }
    expect(Math.min(...light.map((h) => h.tone))).toBeGreaterThan(Math.max(...dark.map((h) => h.tone)));
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
          expect(deltaE(a, b), `vision normale ${source.name} n=${count}`).toBeGreaterThanOrEqual(8);
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
        // Les pastels clairs à 11-12 régions se rapprochent (teintes voisines à même ton) ; les bordures du plateau aident.
        const min = count <= 10 ? 2.5 : 2.2;
        for (let i = 0; i < count; i++) {
          for (let j = i + 1; j < count; j++) {
            expect(deltaE(palette[i]!.fill, palette[j]!.fill), `${source.name} n=${count} ${i}/${j}`).toBeGreaterThanOrEqual(min);
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

describe('ringHue', () => {
  const band = [84, 142] as const;

  it('garde la teinte de base hors bande et reste à pas égaux autour du cercle refermé', () => {
    expect(ringHue(290, 0, 8, band)).toBeCloseTo(290, 6);
    expect(ringHue(20, 0, 8, band)).toBeCloseTo(20, 6);
    // 8 cases à pas égaux sur 360 − 58 = 302° : 37,75° d'écart (hors saut de la bande).
    expect(ringHue(200, 1, 8, band) - 200).toBeCloseTo(37.75, 6);
    expect(ringHue(200, 2, 8, band) - 200).toBeCloseTo(75.5, 6);
  });

  it('une base dans la bande est ramenée sur le bord le plus proche', () => {
    expect(ringHue(95, 0, 8, band)).toBeCloseTo(84, 4);
    expect(ringHue(130, 0, 8, band)).toBeCloseTo(142, 4);
  });

  it('ne tombe jamais dans la bande, quelle que soit la base ou la taille', () => {
    for (let base = 0; base < 360; base += 7) {
      for (let size = 2; size <= 16; size += 2) {
        for (let slot = 0; slot < size; slot++) {
          const hue = ringHue(base, slot, size, band);
          expect(hue >= 0 && hue < 360, `base ${base} case ${slot}/${size}`).toBe(true);
          expect(hue > band[0] + 1e-6 && hue < band[1] - 1e-6, `base ${base} case ${slot}/${size} → ${hue}`).toBe(false);
        }
      }
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
