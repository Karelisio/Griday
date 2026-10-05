import { describe, expect, it } from 'vitest';
import { FREE_ARCHIVE_DAYS, FREE_HINTS_PER_PUZZLE, FREEZE_REWARD_EVERY_DAYS, INTERSTITIAL_UNLIMITED_EVERY, resolveAdUnits } from './config';
import { archiveLocked, freezeOffer, hintNeedsReward, onSolved } from './rules';
import { EMPTY_MONETIZATION } from './state';

const TODAY = '2026-11-18';

describe('indices', () => {
  it('gratuits jusqu’à la limite par grille, puis une vidéo ; jamais en illimité', () => {
    expect(hintNeedsReward(FREE_HINTS_PER_PUZZLE - 1, false)).toBe(false);
    expect(hintNeedsReward(FREE_HINTS_PER_PUZZLE, false)).toBe(true);
    expect(hintNeedsReward(FREE_HINTS_PER_PUZZLE + 5, true)).toBe(false);
  });
});

describe('archives', () => {
  const open = { unlimited: false, unlocked: new Set<string>(), played: false };
  it('les derniers jours sont libres, les plus anciens verrouillés', () => {
    expect(archiveLocked('2026-11-17', TODAY, open)).toBe(false);
    expect(archiveLocked('2026-11-11', TODAY, open)).toBe(FREE_ARCHIVE_DAYS < 7);
    expect(archiveLocked('2026-11-10', TODAY, open)).toBe(true);
  });
  it('débloqué par une vidéo, déjà joué, ou illimité : ouvert', () => {
    expect(archiveLocked('2026-10-10', TODAY, { ...open, unlocked: new Set(['2026-10-10']) })).toBe(false);
    expect(archiveLocked('2026-10-10', TODAY, { ...open, played: true })).toBe(false);
    expect(archiveLocked('2026-10-10', TODAY, { ...open, unlimited: true })).toBe(false);
  });
});

describe('gel de série offert', () => {
  it('possible si la réserve n’est pas pleine et le délai écoulé', () => {
    expect(freezeOffer(null, TODAY, 0, 2)).toEqual({ available: true, nextOn: null });
    expect(freezeOffer(null, TODAY, 2, 2)).toEqual({ available: false, nextOn: null });
    expect(freezeOffer('2026-11-15', TODAY, 0, 2)).toEqual({ available: false, nextOn: '2026-11-22' });
    expect(freezeOffer('2026-11-11', TODAY, 1, 2)).toEqual({ available: true, nextOn: null });
    expect(FREEZE_REWARD_EVERY_DAYS).toBe(7);
  });
});

describe('interstitiels', () => {
  it('un seul après chaque puzzle du jour', () => {
    const first = onSolved(EMPTY_MONETIZATION, { mode: 'daily', date: TODAY });
    expect(first.interstitial).toBe(true);
    expect(onSolved(first.state, { mode: 'daily', date: TODAY })).toEqual({ state: first.state, interstitial: false });
    expect(onSolved(first.state, { mode: 'daily', date: '2026-11-19' }).interstitial).toBe(true);
  });
  it('une partie illimitée sur N', () => {
    let state = EMPTY_MONETIZATION;
    const shown: boolean[] = [];
    for (let i = 0; i < 2 * INTERSTITIAL_UNLIMITED_EVERY; i++) {
      const r = onSolved(state, { mode: 'unlimited' });
      state = r.state;
      shown.push(r.interstitial);
    }
    expect(shown).toEqual([false, false, true, false, false, true]);
    expect(state.unlimitedSolved).toBe(6);
  });
});

describe('blocs d’annonces', () => {
  const real = { rewarded: 'ca-app-pub-1234567890123456/1111111111', interstitial: 'ca-app-pub-1234567890123456/2222222222' };
  it('blocs de test en développement ou sans variables complètes et valides', () => {
    expect(resolveAdUnits({ dev: true, ...real }).testing).toBe(true);
    expect(resolveAdUnits({ dev: false }).testing).toBe(true);
    expect(resolveAdUnits({ dev: false, rewarded: real.rewarded }).testing).toBe(true);
    expect(resolveAdUnits({ dev: false, ...real, interstitial: 'nimporte' }).testing).toBe(true);
    expect(resolveAdUnits({ dev: false }).rewarded).toBe('ca-app-pub-3940256099942544/5224354917');
  });
  it('blocs réels en production', () => {
    expect(resolveAdUnits({ dev: false, ...real })).toEqual({ ...real, testing: false });
    expect(resolveAdUnits({ dev: false, rewarded: ` ${real.rewarded} `, interstitial: real.interstitial }).rewarded).toBe(real.rewarded);
  });
});
