/** Puzzle du jour : grille identique pour tous, numérotée depuis l'epoch, série de jours, partage. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SCHEDULE } from '../../engine/config';
import { diffDays, type ISODate } from '../../engine/core/date';
import { isScheduleStale } from '../../engine/core/schedule';
import { useDailyGame } from '../daily/useDailyGame';
import { GameView } from '../game/GameView';
import { gameKind } from '../game/kinds';
import type { GameKindUI } from '../game/core/kind';
import { isStarted, type GameState } from '../game/core/state';
import type { Language } from '../i18n';
import { formatClock, formatDate, formatNumber, formatTimeOfDay } from '../i18n/format';
import { notificationsAvailable } from '../platform/notifications';
import { useProgress } from '../progress/ProgressContext';
import { useEnableReminder } from '../reminders';
import { useSettings } from '../settings/SettingsContext';
import { suggestReminderTime } from '../settings/types';
import { ShareButton } from '../share/ShareButton';
import { Button, Card, CircularProgress, Icon, InfoChip, useSnackbar } from '../ui';
import { msUntilMidnight, useToday } from '../useToday';
import './screens.css';

/** Partie entamée et non terminée : elle n'est pas remplacée sous les yeux du joueur à minuit. */
const inProgress = (kind: GameKindUI<unknown> | null, g: GameState<unknown> | null) => kind !== null && g !== null && !g.solved && isStarted(kind.rules, g);

/** Série de jours : flamme + nombre (texte complet pour les lecteurs d'écran). */
export function StreakChip({ count }: { count: number }) {
  const { t, i18n } = useTranslation();
  return (
    <InfoChip icon="local_fire_department" className="streak-chip">
      <span aria-hidden="true">{formatNumber(count, i18n.language as Language)}</span>
      <span className="md-sr-only">{t('streak.label', { count })}</span>
    </InfoChip>
  );
}

export interface TodayScreenProps {
  readonly visible: boolean;
  /**
   * Date de la grille affichée (gérée par la coquille, qui renvoie ici une archive de même date) :
   * suit le jour, sauf partie en cours au passage de minuit.
   */
  readonly playingDate: ISODate;
  readonly onPlayingDateChange: (date: ISODate) => void;
}

export function TodayScreen({ visible, playingDate, onPlayingDateChange }: TodayScreenProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language as Language;
  const today = useToday();
  const { summary, history, setPendingDay } = useProgress();
  const snackbar = useSnackbar();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const onRecorded = useCallback(
    (earnedFreeze: boolean) => {
      if (earnedFreeze) snackbar.show({ message: t('streak.freezeEarned'), duration: 8000 });
    },
    [snackbar, t],
  );
  const { info, daily, error, retry, session, kind } = useDailyGame({ date: playingDate, mode: 'daily', visible, onRecorded });

  // Minuit : nouvelle grille tout de suite, sauf si une partie est en cours (le joueur choisit).
  const busy = inProgress(kind, session.game);
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const playingRef = useRef(playingDate);
  playingRef.current = playingDate;
  useEffect(() => {
    if (playingRef.current !== today && !busyRef.current) onPlayingDateChange(today);
  }, [today, onPlayingDateChange]);
  const newPuzzleWaiting = playingDate !== today;
  // Puzzle de la veille encore en cours : il comptera s'il est fini, la série l'attend.
  const yesterdayPending = newPuzzleWaiting && busy && diffDays(playingDate, today) === 1;
  useEffect(() => {
    setPendingDay(yesterdayPending ? playingDate : null);
    return () => setPendingDay(null);
  }, [yesterdayPending, playingDate, setPendingDay]);
  const playToday = () => {
    onPlayingDateChange(today);
    requestAnimationFrame(() => titleRef.current?.focus());
  };

  const stale = isScheduleStale(SCHEDULE, today);

  return (
    <section className="screen" aria-labelledby="today-title" hidden={!visible}>
      <header className="screen__header">
        <div className="today__topline">
          <p className="md-typescale-label-large screen__overline">
            {info && info.dayNumber > 0 ? t('today.number', { n: formatNumber(info.dayNumber, lang) }) : ' '}
          </p>
          {summary.current > 0 && <StreakChip count={summary.current} />}
        </div>
        <h1 id="today-title" className="md-typescale-headline-medium screen__title" ref={titleRef} tabIndex={-1}>
          {t('today.title')}
        </h1>
        <p className="md-typescale-body-large screen__subtitle">{formatDate(playingDate, lang, 'long')}</p>
        {info && (
          <div className="screen__chips">
            <InfoChip icon={gameKind(info.type)?.icon ?? 'extension'}>{t(`puzzle.${info.type}.name`)}</InfoChip>
            <InfoChip icon="grid_view">{t('unlimited.sizeValue', { n: info.target.size })}</InfoChip>
            <InfoChip icon="bolt">{t(`difficulty.${info.target.tier}`)}</InfoChip>
          </div>
        )}
      </header>

      {newPuzzleWaiting && (
        <Card variant="filled" className="screen__notice screen__notice--action">
          <Icon name="today" />
          <p className="md-typescale-body-medium">{t(yesterdayPending ? 'today.finishYesterday' : 'today.newPuzzle')}</p>
          <Button variant="filled" size="s" icon="play_arrow" onClick={playToday}>
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
      ) : !daily || !kind || !session.game ? (
        <div className="screen__center" role="status">
          <CircularProgress aria-label={t('today.generating')} />
          <p className="md-typescale-body-large">{t('today.generating')}</p>
        </div>
      ) : (
        <GameView
          key={playingDate}
          puzzle={daily.puzzle}
          kind={kind}
          session={session}
          visible={visible}
          victoryChips={summary.current > 0 ? <StreakChip count={summary.current} /> : null}
          victoryExtra={
            <>
              {!newPuzzleWaiting && <NextPuzzleCountdown lang={lang} />}
              <div className="victory-card__actions">
                <ReminderButton />
                <ShareButton
                  result={{
                    kind: history.get(playingDate)?.mode === 'archive' ? 'archive' : 'daily',
                    type: daily.type,
                    n: daily.dayNumber,
                    size: daily.target.size,
                    tier: daily.target.tier,
                    timeMs: session.game.elapsedMs,
                    hintsUsed: session.game.hintsUsed,
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

/** Proposé une seule fois après une victoire : active le rappel quotidien (permission Android). */
function ReminderButton() {
  const { t, i18n } = useTranslation();
  const { settings, update } = useSettings();
  const snackbar = useSnackbar();
  const enable = useEnableReminder();
  // Proposé à une seule victoire : noté dès l'affichage, le bouton reste le temps de cette carte.
  const [offered] = useState(() => !settings.reminder && !settings.reminderPrompted && notificationsAvailable());
  useEffect(() => {
    if (offered) update({ reminderPrompted: true });
  }, [offered, update]);
  if (!offered || settings.reminder) return null;
  const onClick = async () => {
    const time = suggestReminderTime(new Date());
    update({ reminderTime: time });
    const outcome = await enable();
    if (outcome === 'enabled') snackbar.show({ message: t('victory.reminderOn', { time: formatTimeOfDay(time, i18n.language as Language) }) });
    else if (outcome === 'denied') snackbar.show({ message: t('reminder.denied'), duration: 8000 });
  };
  return (
    <Button variant="tonal" icon="notifications_active" onClick={() => void onClick()}>
      {t('victory.remindMe')}
    </Button>
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
