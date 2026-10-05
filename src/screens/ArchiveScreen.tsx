/**
 * Archives : calendrier des puzzles passés (résolu, rattrapé, gelé, en cours, verrouillé) et résumé du mois affiché.
 * Un jour ancien jamais commencé est verrouillé : une vidéo le débloque pour de bon (Premium : tout est ouvert).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SCHEDULE } from '../../engine/config';
import { compareISO, type ISODate } from '../../engine/core/date';
import { typeForDate } from '../../engine/core/schedule';
import { ArchiveCalendar } from '../archive/ArchiveCalendar';
import { clampMonth, diffMonths, monthKey, monthOf, playableDays, type MonthRef } from '../archive/calendarModel';
import { useMonetization } from '../monetization/MonetizationContext';
import { FREE_ARCHIVE_DAYS } from '../monetization/config';
import { archiveLocked } from '../monetization/rules';
import { useProgress } from '../progress/ProgressContext';
import { dayStatus } from '../progress/stats';
import { loadStartedDays } from '../progress/store';
import { Icon, InfoChip } from '../ui';
import './screens.css';
import './ArchiveScreen.css';

const FIRST_DAY = SCHEDULE.epoch;

export function ArchiveScreen({ visible, onOpen }: { visible: boolean; onOpen: (date: ISODate) => void }) {
  const { t } = useTranslation();
  const { today, ready, history, streak } = useProgress();
  // Les types alternent d'un jour à l'autre : le nom accessible de chaque jour dit lequel.
  const puzzleName = useCallback((date: ISODate) => t(`puzzle.${typeForDate(SCHEDULE, date)}.name`), [t]);
  // Mois choisi par le joueur ; `null` tant qu'il reste sur le mois courant, que l'écran suit alors quand le calendrier
  // change de mois (app restée ouverte). S'il s'en est éloigné exprès, son choix est gardé.
  const [picked, setPicked] = useState<MonthRef | null>(null);
  const current = monthOf(today);
  // Toujours entre le mois de l'epoch et le mois courant (l'horloge peut avoir changé).
  const month = clampMonth(picked ?? current, FIRST_DAY, today);
  const key = monthKey(month);
  const days = useMemo(() => playableDays(month, FIRST_DAY, today), [key, today]);
  const changeMonth = (next: MonthRef) => setPicked(diffMonths(next, current) === 0 ? null : next);

  // Parties entamées du mois affiché : relues à chaque retour sur l'écran et à chaque partie terminée.
  const [started, setStarted] = useState<ReadonlySet<ISODate>>(() => new Set());
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    void loadStartedDays(days).then((set) => {
      if (!cancelled) setStarted(set);
    });
    return () => {
      cancelled = true;
    };
  }, [visible, days, history]);

  const frozen = useMemo(() => new Set(streak.frozen), [streak.frozen]);
  const status = useCallback((date: ISODate) => dayStatus(date, history, frozen, started), [history, frozen, started]);

  // Verrouillage : jamais pour un jour déjà commencé ou résolu, ni en Premium.
  const { unlimited, unlocked, requestReward, unlockArchive } = useMonetization();
  const locked = useCallback(
    (date: ISODate) => archiveLocked(date, today, { unlimited, unlocked, played: history.has(date) || started.has(date) }),
    [today, unlimited, unlocked, history, started],
  );
  const anyLocked = days.some(locked);
  const select = async (date: ISODate) => {
    if (locked(date)) {
      // Jour verrouillé : la vidéo regardée, il est débloqué pour toujours puis ouvert.
      if (!(await requestReward('archive'))) return;
      unlockArchive(date);
    }
    onOpen(date);
  };
  const solved = days.filter((date) => history.has(date)).length;
  // Résumé du mois ; texte à part pour un seul jour jouable (en anglais, le nom suit le total : « of 1 day »).
  const summary = t(days.length === 1 ? 'archive.summaryOneDay' : 'archive.summary', { count: solved, total: days.length });
  // Aucun jour passé : les archives se remplissent à partir de demain.
  const empty = compareISO(today, FIRST_DAY) <= 0;

  return (
    <section className="screen" aria-labelledby="archive-title" hidden={!visible}>
      <header className="screen__header">
        <h1 id="archive-title" className="md-typescale-headline-medium screen__title">
          {t('archive.title')}
        </h1>
        <p className="md-typescale-body-large screen__subtitle">{t('archive.subtitle')}</p>
        {ready && !empty && (
          <div className="screen__chips">
            <InfoChip icon="event_available">{summary}</InfoChip>
          </div>
        )}
      </header>

      {empty ? (
        <div className="screen__center archive__empty">
          <span className="archive__empty-icon">
            <Icon name="calendar_month" size={40} />
          </span>
          <h2 className="md-typescale-title-large archive__empty-title">{t('archive.emptyTitle')}</h2>
          <p className="md-typescale-body-large">{t('archive.empty')}</p>
        </div>
      ) : (
        <>
          <ArchiveCalendar
            month={month}
            onMonthChange={changeMonth}
            today={today}
            first={FIRST_DAY}
            status={status}
            locked={locked}
            puzzleName={puzzleName}
            onSelect={(date) => void select(date)}
          />
          {anyLocked && (
            <p className="md-typescale-body-small archive__note">
              <Icon name="lock" size={18} />
              <span>{t('archive.lockedNote', { days: FREE_ARCHIVE_DAYS })}</span>
            </p>
          )}
        </>
      )}
    </section>
  );
}
