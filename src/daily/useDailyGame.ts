/**
 * Puzzle d'un jour (du jour ou d'archive) : métadonnées, grille (cache local validé, sinon générée
 * dans le worker), partie sauvegardée, résultat enregistré à la victoire.
 */
import { useCallback, useEffect, useState } from 'react';
import { localISODate, type ISODate } from '../../engine/core/date';
import type { DailyInfo } from '../../engine/core/types';
import type { AnyDailyPuzzle } from '../../engine/registry';
import { engine } from '../engine-client/client';
import type { QueensGame } from '../game/queens/state';
import { useQueensGame } from '../game/queens/useQueensGame';
import { isStoredQueensPuzzle } from '../game/queens/validate';
import { dailyProgressKey, dailyPuzzleKey } from '../persistence';
import { loadJSON, saveJSON } from '../platform/storage';
import { useProgress } from '../progress/ProgressContext';
import type { DailyMode } from '../progress/types';
import { useSettings } from '../settings/SettingsContext';

export interface UseDailyGameOptions {
  readonly date: ISODate;
  readonly mode: DailyMode;
  readonly visible: boolean;
  /** Appelé après l'enregistrement d'une victoire (gel de série gagné ou non). */
  readonly onRecorded?: (earnedFreeze: boolean) => void;
}

export function useDailyGame({ date, mode, visible, onRecorded }: UseDailyGameOptions) {
  const { settings } = useSettings();
  const { recordDaily } = useProgress();
  const [info, setInfo] = useState<DailyInfo | null>(null);
  const [daily, setDaily] = useState<AnyDailyPuzzle | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setDaily(null);
    setInfo(null);
    setError(false);
    void (async () => {
      try {
        const meta = await engine.dailyInfo(date);
        if (cancelled) return;
        setInfo(meta);
        const cached = await loadJSON<unknown>(dailyPuzzleKey(date));
        const valid = isStoredQueensPuzzle(cached, { version: meta.version, size: meta.target.size }) && (cached as AnyDailyPuzzle).date === date;
        const puzzle = valid ? (cached as AnyDailyPuzzle) : await engine.daily(date);
        // Une grille de secours temps réel n'est pas celle des autres joueurs : jamais mise en cache.
        if (!valid && puzzle.source !== 'emergency') await saveJSON(dailyPuzzleKey(date), puzzle);
        if (!cancelled) setDaily(puzzle);
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [date, attempt]);

  const onSolved = useCallback(
    (g: QueensGame) => {
      if (!daily) return;
      const { earnedFreeze } = recordDaily({
        date,
        size: daily.target.size,
        tier: daily.target.tier,
        timeMs: Math.floor(g.elapsedMs),
        hintsUsed: g.hintsUsed,
        mode,
        solvedOn: localISODate(new Date()),
      });
      onRecorded?.(earnedFreeze);
    },
    [daily, date, mode, recordDaily, onRecorded],
  );

  const { ready, history } = useProgress();
  const known = history.get(date);
  const api = useQueensGame({
    puzzle: daily?.puzzle ?? null,
    storageKey: daily ? dailyProgressKey(date) : null,
    visible,
    autoCross: settings.autoCross,
    onSolved,
    solvedFallback: known ? { timeMs: known.timeMs, hintsUsed: known.hintsUsed } : null,
  });

  // Partie déjà résolue sans résultat enregistré (arrêt brutal juste après la victoire) : rattrapée.
  const solvedGame = api.game?.solved ? api.game : null;
  useEffect(() => {
    if (solvedGame && ready && !history.has(date)) onSolved(solvedGame);
  }, [solvedGame, ready, history, date, onSolved]);

  return { info, daily, error, retry: () => setAttempt((a) => a + 1), api };
}
