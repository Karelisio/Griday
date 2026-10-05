import { describe, expect, it } from 'vitest';
import { FADE_ONLY, INSTANT, SPRING_SPECS, motionTokensFor, spring, springToCssLinear, springs } from './motion';

describe('jetons de mouvement', () => {
  it('convertit le ratio d’amortissement en damping motion (2·ζ·√k, masse 1)', () => {
    expect(springs.spatial.fast).toMatchObject({ type: 'spring', stiffness: 800, mass: 1 });
    expect((springs.spatial.fast as { damping: number }).damping).toBeCloseTo(2 * 0.6 * Math.sqrt(800), 6);
    expect((springs.spatial.default as { damping: number }).damping).toBeCloseTo(2 * 0.8 * Math.sqrt(380), 6);
    expect((springs.spatial.slow as { damping: number }).damping).toBeCloseTo(2 * 0.8 * Math.sqrt(200), 6);
    expect((springs.effects.fast as { damping: number }).damping).toBeCloseTo(2 * Math.sqrt(3800), 6);
    expect((springs.effects.default as { damping: number }).damping).toBeCloseTo(2 * Math.sqrt(1600), 6);
    expect((springs.effects.slow as { stiffness: number }).stiffness).toBe(800);
  });

  it('les ressorts spatiaux rebondissent, les effets non (amortissement critique)', () => {
    for (const speed of ['fast', 'default', 'slow'] as const) {
      expect(SPRING_SPECS.spatial[speed].dampingRatio).toBeLessThan(1);
      expect(SPRING_SPECS.effects[speed].dampingRatio).toBe(1);
    }
    expect(spring({ stiffness: 100, dampingRatio: 0.5 })).toMatchObject({ stiffness: 100, damping: 10 });
  });

  it('animations réduites : spatial instantané, effets en fondu court', () => {
    const reduced = motionTokensFor(true);
    expect(reduced.spatial.fast).toBe(INSTANT);
    expect(reduced.spatial.slow).toBe(INSTANT);
    expect(reduced.effects.default).toBe(FADE_ONLY);
    expect(motionTokensFor(false)).toBe(springs);
  });

  it('springToCssLinear : courbe linear() qui finit à 1, plus longue pour un ressort plus mou', () => {
    const fast = springToCssLinear(SPRING_SPECS.spatial.fast);
    const slow = springToCssLinear(SPRING_SPECS.spatial.slow);
    for (const { easing, duration } of [fast, slow]) {
      expect(easing).toMatch(/^linear\(0, .+, 1\)$/);
      expect(duration).toBeGreaterThan(100);
    }
    expect(slow.duration).toBeGreaterThan(fast.duration);
    // Le ressort spatial rapide dépasse 1 (rebond), pas l'effet.
    const peak = (easing: string) => Math.max(...easing.slice(7, -1).split(', ').map(Number));
    expect(peak(fast.easing)).toBeGreaterThan(1.02);
    expect(peak(springToCssLinear(SPRING_SPECS.effects.default).easing)).toBeLessThanOrEqual(1);
  });
});
