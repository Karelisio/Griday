import { beforeEach, describe, expect, it } from 'vitest';
import { listKeys, saveJSON } from './platform/storage';
import { UNLIMITED_CURRENT_KEY, pruneStorage } from './persistence';

describe('ménage du stockage', () => {
  beforeEach(() => localStorage.clear());

  it('supprime seulement les données périmées', async () => {
    const keep = [
      'daily.puzzle.2026-10-05',
      'daily.puzzle.2026-09-28',
      'daily.progress.2026-10-05',
      'daily.progress.2026-10-02',
      'daily.progress.2026-09-05',
      'daily.result.2026-10-04',
      'daily.result.2020-01-01',
      'unlimited.progress.abc',
      UNLIMITED_CURRENT_KEY,
      'selfcheck.1.0.0',
      'settings.v1',
    ];
    const drop = [
      'daily.puzzle.2026-09-27',
      'daily.progress.2026-10-03',
      'daily.progress.2026-10-04',
      'daily.progress.2026-09-04',
      'daily.progress.garbage',
      'unlimited.progress.old',
      'selfcheck.0.9.0',
    ];
    for (const k of [...keep, ...drop]) await saveJSON(k, k === UNLIMITED_CURRENT_KEY ? { token: 'abc' } : 1);
    await saveJSON('daily.result.2026-10-03', 1);
    keep.push('daily.result.2026-10-03');
    const removed = await pruneStorage('2026-10-05', '1.0.0');
    expect(removed.sort()).toEqual(drop.sort());
    expect((await listKeys()).sort()).toEqual(keep.sort());
  });
});
