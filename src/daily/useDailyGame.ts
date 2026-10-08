/**
 * Puzzle d'un jour (du jour ou d'archive) : métadonnées, grille (cache local validé, sinon générée
 * dans le worker), partie sauvegardée, résultat enregistré à la victoire.
 */
import { useCallback, useEffect, useState } from 'react';
import { isValidISODate, localISODate, type ISODate } from '../../engine/core/date';
import type { DailyInfo } from '../../engine/core/types';
import type { AnyDailyPuzzle } from '../../engine/registry';
import { engine } from '../engine-client/client';
import type { GameKindUI } from '../game/core/kind';
import { NO_RULES } from '../game/core/rules';
import { isStarted, type GameState } from '../game/core/state';
import { useGameSession } from '../game/core/useGameSession';
import { isStoredGenerated } from '../game/core/validate';
import { gameKind } from '../game/kinds';
import { useMonetization } from '../monetization/MonetizationContext';
import { dailyProgressKey, dailyPuzzleKey, dailyStartedKey } from '../persistence';
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
  const { recordDaily } = useProgress();
  const { notifySolved } = useMonetization();
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
        const kind = gameKind(meta.type);
        const valid =
          kind !== null &&
          isStoredGenerated(cached, kind, { version: meta.version, size: meta.target.size }) &&
          (cached as AnyDailyPuzzle).date === date;
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

  // Jour du premier coup : une partie commencée le jour même compte pour la série si elle est
  // finie au plus tard le lendemain, qu'on la termine depuis « Aujourd'hui » ou les archives.
  const [startedOn, setStartedOn] = useState<{ date: ISODate; on: ISODate | null } | null>(null);
  useEffect(() => {
    let cancelled = false;
    setStartedOn(null);
    void loadJSON<unknown>(dailyStartedKey(date)).then((v) => {
      if (!cancelled) setStartedOn({ date, on: typeof v === 'string' && isValidISODate(v) ? v : null });
    });
    return () => {
      cancelled = true;
    };
  }, [date]);
  const started = startedOn?.date === date ? startedOn : null;

  const onSolved = useCallback(
    (g: GameState<unknown>) => {
      if (!daily) return;
      const onTime = started?.on ? started.on === date : mode === 'daily';
      const { earnedFreeze, mode: recorded } = recordDaily({
        date,
        type: daily.type,
        size: daily.target.size,
        tier: daily.target.tier,
        timeMs: Math.floor(g.elapsedMs),
        hintsUsed: g.hintsUsed,
        mode: onTime ? 'daily' : 'archive',
        solvedOn: localISODate(new Date()),
      });
      // Interstitiel (un seul par puzzle du jour, géré par la monétisation) : seulement pour un résultat
      // enregistré comme puzzle du jour, jamais pour une archive rejouée.
      if (recorded === 'daily') notifySolved({ mode: 'daily', date });
      onRecorded?.(earnedFreeze);
    },
    [daily, date, mode, started, recordDaily, notifySolved, onRecorded],
  );

  const { ready, history } = useProgress();
  // Résultat enregistré pour ce jour, s'il porte sur le même type de puzzle (un résultat d'un autre type
  // viendrait d'un calendrier antérieur : il ne doit pas passer pour la victoire de cette grille).
  const recorded = history.get(date);
  const known = recorded && daily && (recorded.type ?? 'queens') === daily.type ? recorded : undefined;
  const kind: GameKindUI<unknown> | null = daily ? gameKind(daily.type) : null;
  const { settings } = useSettings();
  const session = useGameSession(kind?.rules ?? NO_RULES, {
    puzzle: kind && daily ? daily.puzzle : null,
    storageKey: daily ? dailyProgressKey(date) : null,
    visible,
    onSolved,
    solvedFallback: known ? { timeMs: known.timeMs, hintsUsed: known.hintsUsed } : null,
    showConflicts: settings.showConflicts,
  });

  // Premier coup : date notée une fois (après lecture de la valeur sauvegardée).
  const game = session.game;
  const playedOnce = game !== null && kind !== null && !game.solved && isStarted(kind.rules, game);
  useEffect(() => {
    if (!playedOnce || !started || started.on !== null) return;
    const on = localISODate(new Date());
    setStartedOn({ date, on });
    void saveJSON(dailyStartedKey(date), on);
  }, [playedOnce, started, date]);

  // Partie déjà résolue sans résultat enregistré (arrêt brutal juste après la victoire) : rattrapée.
  const solvedGame = session.game?.solved ? session.game : null;
  useEffect(() => {
    if (solvedGame && ready && !history.has(date)) onSolved(solvedGame);
  }, [solvedGame, ready, history, date, onSolved]);

  return { info, daily, error, retry: () => setAttempt((a) => a + 1), session, kind };
}
