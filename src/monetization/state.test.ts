import { describe, expect, it } from 'vitest';
import { EMPTY_MONETIZATION, decodeMonetization, encodeMonetization, withUnlocked } from './state';

describe('état de monétisation', () => {
  it('aller-retour', () => {
    const s = { premium: true, unlocked: ['2026-10-06', '2026-10-09'], freezeClaimedOn: '2026-11-01', unlimitedSolved: 7, dailyInterstitialFor: '2026-11-18' };
    expect(decodeMonetization(JSON.parse(JSON.stringify(encodeMonetization(s))))).toEqual(s);
  });
  it('valeurs illisibles : valeurs par défaut', () => {
    expect(decodeMonetization(null)).toEqual(EMPTY_MONETIZATION);
    expect(decodeMonetization({ v: 2, premium: true })).toEqual(EMPTY_MONETIZATION);
    expect(
      decodeMonetization({ v: 1, premium: 'oui', unlocked: ['2026-02-30', 3, '2026-10-07', '2026-10-06', '2026-10-07'], freezeClaimedOn: 'hier', unlimitedSolved: -1 }),
    ).toEqual({ ...EMPTY_MONETIZATION, unlocked: ['2026-10-06', '2026-10-07'] });
  });
  it('déblocage idempotent et trié', () => {
    const once = withUnlocked(withUnlocked(EMPTY_MONETIZATION, '2026-10-09'), '2026-10-06');
    expect(once.unlocked).toEqual(['2026-10-06', '2026-10-09']);
    expect(withUnlocked(once, '2026-10-09')).toBe(once);
  });
});
