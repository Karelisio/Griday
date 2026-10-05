/** Puzzle du jour : grille identique pour tous, numérotée depuis l'epoch, série de jours, partage. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SCHEDULE } from '../../engine/config';
import { isScheduleStale } from '../../engine/core/schedule';
import { useDailyGame } from '../daily/useDailyGame';
import { GameView } from '../game/GameView';
import type { QueensGame } from '../game/queens/state';
import type { Language } from '../i18n';
import { formatClock, formatDate, formatNumber } from '../i18n/format';
import { useProgress } from '../progress/ProgressContext';
import { ShareButton } from '../share/ShareButton';
import { Button, Card, CircularProgress, Icon, InfoChip, useSnackbar } from '../ui';
import { msUntilMidnight, useToday } from '../useToday';
import './screens.css';

/** Partie entamée et non terminée : elle n'est pas remplacée sous les yeux du joueur à minuit. */
const inProgress = (g: QueensGame | null) => g !== null && !g.solved && (g.past.length > 0 || g.marks.some((m) => m !== 0));

/** Série de jours : flamme + nombre (texte complet pour les lecteurs d'écran). */
export function StreakChip({ count }: { count: number }) {
  const { t } = useTranslation();
  return (
    <InfoChip icon="local_fire_department" className="streak-chip">
      <span aria-hidden="true">{count}</span>
      <span className="md-sr-only">{t('streak.label', { count })}</span>
    </InfoChip>
  );
}

export function TodayScreen({ visible }: { visible: boolean }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language as Language;
  const today = useToday();
  const { summary } = useProgress();
  const snackbar = useSnackbar();
  // Date de la grille affichée : suit le jour, sauf partie en cours au passage de minuit.
  const [playingDate, setPlayingDate] = useState(today);
  const onRecorded = useCallback(
    (earnedFreeze: boolean) => {
      if (earnedFreeze) snackbar.show({ message: t('streak.freezeEarned'), duration: 8000 });
    },
    [snackbar, t],
  );
  const { info, daily, error, retry, api } = useDailyGame({ date: playingDate, mode: 'daily', visible, onRecorded });

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
            {summary.current > 0 && <StreakChip count={summary.current} />}
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
          <Button variant="tonal" icon="refresh" onClick={retry}>
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
          victoryChips={summary.current > 0 ? <StreakChip count={summary.current} /> : null}
          victoryExtra={
            <>
              {!newPuzzleWaiting && <NextPuzzleCountdown lang={lang} />}
              <div className="victory-card__actions">
                <ShareButton
                  result={{
                    kind: 'daily',
                    n: daily.dayNumber,
                    size: daily.target.size,
                    tier: daily.target.tier,
                    timeMs: api.game.elapsedMs,
                    hintsUsed: api.game.hintsUsed,
                    streak: summary.current,
                  }}
                />
              </div>
            </>
          }
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
