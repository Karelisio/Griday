/** Archives : calendrier des puzzles passés (résolu, rattrapé, gelé, en cours) et résumé du mois affiché. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SCHEDULE } from '../../engine/config';
import { compareISO, type ISODate } from '../../engine/core/date';
import { ArchiveCalendar } from '../archive/ArchiveCalendar';
import { clampMonth, monthKey, monthOf, playableDays, type MonthRef } from '../archive/calendarModel';
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
  const [requested, setRequested] = useState<MonthRef>(() => monthOf(today));
  // Toujours entre le mois de l'epoch et le mois courant (l'horloge peut avoir changé).
  const month = clampMonth(requested, FIRST_DAY, today);
  const key = monthKey(month);
  const days = useMemo(() => playableDays(month, FIRST_DAY, today), [key, today]);

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
  const solved = days.filter((date) => history.has(date)).length;
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
            <InfoChip icon="event_available">{t('archive.summary', { solved, count: days.length })}</InfoChip>
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
        <ArchiveCalendar month={month} onMonthChange={setRequested} today={today} first={FIRST_DAY} status={status} onSelect={onOpen} />
      )}
    </section>
  );
}
