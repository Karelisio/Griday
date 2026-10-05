/** Puzzle du jour : grille identique pour tous, numérotée depuis l'epoch, progression sauvegardée. */
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DailyInfo } from '../../engine/core/types';
import { SCHEDULE } from '../../engine/config';
import { isScheduleStale } from '../../engine/core/schedule';
import type { AnyDailyPuzzle } from '../../engine/registry';
import { engine } from '../engine-client/client';
import { GameView } from '../game/GameView';
import { useQueensGame } from '../game/queens/useQueensGame';
import type { QueensGame } from '../game/queens/state';
import type { Language } from '../i18n';
import { formatClock, formatDate } from '../i18n/format';
import { loadJSON, saveJSON } from '../platform/storage';
import { useSettings } from '../settings/SettingsContext';
import { Button, Card, Chip, CircularProgress, Icon } from '../ui';
import { msUntilMidnight, useToday } from '../useToday';
import './screens.css';

/** Résultat du jour (utilisé par les statistiques, étape suivante). */
export interface DailyResult {
  readonly date: string;
  readonly timeMs: number;
  readonly hintsUsed: number;
  readonly solvedAt: string;
}

export const dailyPuzzleKey = (date: string) => `daily.puzzle.${date}`;
export const dailyProgressKey = (date: string) => `daily.progress.${date}`;
export const dailyResultKey = (date: string) => `daily.result.${date}`;

export function TodayScreen({ visible }: { visible: boolean }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language as Language;
  const today = useToday();
  const { settings } = useSettings();
  const [info, setInfo] = useState<DailyInfo | null>(null);
  const [daily, setDaily] = useState<AnyDailyPuzzle | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // Chargement : cache local, sinon génération dans le worker (puis mise en cache).
  useEffect(() => {
    let cancelled = false;
    setDaily(null);
    setError(false);
    void (async () => {
      try {
        const meta = await engine.dailyInfo(today);
        if (cancelled) return;
        setInfo(meta);
        const cached = await loadJSON<AnyDailyPuzzle>(dailyPuzzleKey(today));
        const puzzle = cached && cached.date === today && cached.version === meta.version ? cached : await engine.daily(today);
        if (!cached || cached !== puzzle) await saveJSON(dailyPuzzleKey(today), puzzle);
        if (!cancelled) setDaily(puzzle);
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [today, attempt]);

  const onSolved = useCallback(
    (g: QueensGame) => {
      const result: DailyResult = { date: today, timeMs: Math.round(g.elapsedMs), hintsUsed: g.hintsUsed, solvedAt: new Date().toISOString() };
      void saveJSON(dailyResultKey(today), result);
    },
    [today],
  );

  const api = useQueensGame({
    puzzle: daily?.puzzle ?? null,
    storageKey: daily ? dailyProgressKey(today) : null,
    visible,
    autoCross: settings.autoCross,
    onSolved,
  });

  const stale = isScheduleStale(SCHEDULE, today);

  return (
    <section className="screen" aria-labelledby="today-title" hidden={!visible}>
      <header className="screen__header">
        <p className="md-typescale-label-large screen__overline">{info ? t('today.number', { n: info.dayNumber }) : ' '}</p>
        <h1 id="today-title" className="md-typescale-headline-medium screen__title">
          {t('today.title')}
        </h1>
        <p className="md-typescale-body-large screen__subtitle">{formatDate(today, lang, 'long')}</p>
        {info && (
          <div className="screen__chips">
            <Chip icon="crown">{t('puzzle.queens.name')}</Chip>
            <Chip icon="grid_view">{t('unlimited.sizeValue', { n: info.target.size })}</Chip>
            <Chip icon="bolt">{t(`difficulty.${info.target.tier}`)}</Chip>
          </div>
        )}
      </header>

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
          puzzle={daily.puzzle}
          api={api}
          visible={visible}
          victoryExtra={<NextPuzzleCountdown lang={lang} />}
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
