/** Puzzle du jour : grille identique pour tous, numérotée depuis l'epoch, progression sauvegardée. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DailyInfo } from '../../engine/core/types';
import { SCHEDULE } from '../../engine/config';
import { isScheduleStale } from '../../engine/core/schedule';
import type { AnyDailyPuzzle } from '../../engine/registry';
import { engine } from '../engine-client/client';
import { GameView } from '../game/GameView';
import { isStoredQueensPuzzle } from '../game/queens/validate';
import { useQueensGame } from '../game/queens/useQueensGame';
import type { QueensGame } from '../game/queens/state';
import type { Language } from '../i18n';
import { formatClock, formatDate, formatNumber } from '../i18n/format';
import { dailyProgressKey, dailyPuzzleKey, dailyResultKey } from '../persistence';
import { loadJSON, saveJSON } from '../platform/storage';
import { useSettings } from '../settings/SettingsContext';
import { Button, Card, CircularProgress, Icon, InfoChip } from '../ui';
import { msUntilMidnight, useToday } from '../useToday';
import './screens.css';

/** Résultat du jour (utilisé par les statistiques, étape suivante). */
export interface DailyResult {
  readonly date: string;
  readonly timeMs: number;
  readonly hintsUsed: number;
  readonly solvedAt: string;
}

/** Partie entamée et non terminée : elle n'est pas remplacée sous les yeux du joueur à minuit. */
const inProgress = (g: QueensGame | null) => g !== null && !g.solved && (g.past.length > 0 || g.marks.some((m) => m !== 0));

export function TodayScreen({ visible }: { visible: boolean }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language as Language;
  const today = useToday();
  const { settings } = useSettings();
  // Date de la grille affichée : suit le jour, sauf partie en cours au passage de minuit.
  const [playingDate, setPlayingDate] = useState(today);
  const [info, setInfo] = useState<DailyInfo | null>(null);
  const [daily, setDaily] = useState<AnyDailyPuzzle | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // Chargement : cache local validé, sinon génération dans le worker (puis mise en cache).
  useEffect(() => {
    let cancelled = false;
    setDaily(null);
    setInfo(null);
    setError(false);
    void (async () => {
      try {
        const meta = await engine.dailyInfo(playingDate);
        if (cancelled) return;
        setInfo(meta);
        const cached = await loadJSON<unknown>(dailyPuzzleKey(playingDate));
        const valid =
          isStoredQueensPuzzle(cached, { version: meta.version, size: meta.target.size }) && (cached as AnyDailyPuzzle).date === playingDate;
        const puzzle = valid ? (cached as AnyDailyPuzzle) : await engine.daily(playingDate);
        // Une grille de secours temps réel n'est pas celle des autres joueurs : jamais mise en cache.
        if (!valid && puzzle.source !== 'emergency') await saveJSON(dailyPuzzleKey(playingDate), puzzle);
        if (!cancelled) setDaily(puzzle);
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [playingDate, attempt]);

  const onSolved = useCallback(
    (g: QueensGame) => {
      const result: DailyResult = { date: playingDate, timeMs: Math.floor(g.elapsedMs), hintsUsed: g.hintsUsed, solvedAt: new Date().toISOString() };
      void saveJSON(dailyResultKey(playingDate), result);
    },
    [playingDate],
  );

  const api = useQueensGame({
    puzzle: daily?.puzzle ?? null,
    storageKey: daily ? dailyProgressKey(playingDate) : null,
    visible,
    autoCross: settings.autoCross,
    onSolved,
  });

  // Minuit : nouvelle grille tout de suite, sauf si une partie est en cours (le joueur choisit).
  const busy = useRef(false);
  busy.current = inProgress(api.game);
  useEffect(() => {
    setPlayingDate((current) => (current === today || busy.current ? current : today));
  }, [today]);
  const newPuzzleWaiting = playingDate !== today;

  const stale = isScheduleStale(SCHEDULE, today);

  return (
    <section className="screen" aria-labelledby="today-title" hidden={!visible}>
      <header className="screen__header">
        <p className="md-typescale-label-large screen__overline">
          {info && info.dayNumber > 0 ? t('today.number', { n: formatNumber(info.dayNumber, lang) }) : ' '}
        </p>
        <h1 id="today-title" className="md-typescale-headline-medium screen__title">
          {t('today.title')}
        </h1>
        <p className="md-typescale-body-large screen__subtitle">{formatDate(playingDate, lang, 'long')}</p>
        {info && (
          <div className="screen__chips">
            <InfoChip icon="crown">{t('puzzle.queens.name')}</InfoChip>
            <InfoChip icon="grid_view">{t('unlimited.sizeValue', { n: info.target.size })}</InfoChip>
            <InfoChip icon="bolt">{t(`difficulty.${info.target.tier}`)}</InfoChip>
          </div>
        )}
      </header>

      {newPuzzleWaiting && (
        <Card variant="filled" className="screen__notice screen__notice--action">
          <Icon name="today" />
          <p className="md-typescale-body-medium">{t('today.newPuzzle')}</p>
          <Button variant="filled" size="s" icon="play_arrow" onClick={() => setPlayingDate(today)}>
            {t('today.play')}
          </Button>
        </Card>
      )}

      {stale && (
        <Card variant="outlined" className="screen__notice">
          <Icon name="info" />
          <p className="md-typescale-body-medium">{t('today.updateAvailable')}</p>
        </Card>
      )}

      {error ? (
        <div className="screen__center">
          <Icon name="error" size={40} />
          <p className="md-typescale-body-large">{t('errors.generation')}</p>
          <Button variant="tonal" icon="refresh" onClick={() => setAttempt((a) => a + 1)}>
            {t('common.retry')}
          </Button>
        </div>
      ) : !daily || !api.game ? (
        <div className="screen__center" role="status">
          <CircularProgress aria-label={t('today.generating')} />
          <p className="md-typescale-body-large">{t('today.generating')}</p>
        </div>
      ) : (
        <GameView
          key={playingDate}
          puzzle={daily.puzzle}
          api={api}
          visible={visible}
          victoryExtra={newPuzzleWaiting ? undefined : <NextPuzzleCountdown lang={lang} />}
        />
      )}
    </section>
  );
}

function NextPuzzleCountdown({ lang }: { lang: Language }) {
  const { t } = useTranslation();
  const [left, setLeft] = useState(msUntilMidnight);
  useEffect(() => {
    const id = setInterval(() => setLeft(msUntilMidnight()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <p className="md-typescale-title-medium next-puzzle">
      <Icon name="schedule" size={20} />
      {t('today.nextIn', { time: formatClock(left, lang) })}
    </p>
  );
}
