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
      'daily.started.2026-10-02',
      'daily.history.v1',
      'unlimited.progress.abc',
      UNLIMITED_CURRENT_KEY,
      'selfcheck.1.0.0',
      'settings.v1',
    ];
    const drop = [
      'daily.puzzle.2026-09-27',
      'daily.progress.2026-10-03',
      'daily.progress.2026-10-04',
      'daily.started.2026-10-04',
      'daily.progress.2026-09-04',
      'daily.progress.garbage',
      'daily.result.2026-10-01',
      'unlimited.progress.old',
      'selfcheck.0.9.0',
    ];
    for (const k of [...keep, ...drop]) await saveJSON(k, k === UNLIMITED_CURRENT_KEY ? { token: 'abc' } : 1);
    // Jours résolus : leur partie n'est plus utile dès le lendemain (sauf aujourd'hui).
    const solved = new Set(['2026-10-03', '2026-10-04', '2026-10-05']);
    const removed = await pruneStorage('2026-10-05', '1.0.0', solved);
    expect(removed.sort()).toEqual(drop.sort());
    expect((await listKeys()).sort()).toEqual(keep.sort());
  });
});
