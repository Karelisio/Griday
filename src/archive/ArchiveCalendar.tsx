/**
 * Calendrier mensuel des archives (contrôlé) : un disque par jour jouable (de l'epoch à aujourd'hui),
 * coloré selon son état, navigation au clavier (grille ARIA, tabindex itinérant) et balayage entre les mois.
 */
import { motion } from 'motion/react';
import { useEffect, useId, useMemo, useRef, useState, type FocusEvent, type KeyboardEvent, type PointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { addDays, type ISODate } from '../../engine/core/date';
import type { Language } from '../i18n';
import { BCP47 } from '../i18n/format';
import type { DayStatus } from '../progress/types';
import { useMotionTokens } from '../theme/motion';
import { Icon, IconButton, type IconName } from '../ui';
import {
  addMonths,
  clampMonth,
  diffMonths,
  firstDayOf,
  focusableDay,
  isPlayable,
  keyboardTarget,
  monthBounds,
  monthGrid,
  monthKey,
  monthOf,
  playableDays,
  type CalendarCell,
  type MonthRef,
} from './calendarModel';
import './ArchiveCalendar.css';

export interface ArchiveCalendarProps {
  /** Mois affiché. */
  readonly month: MonthRef;
  /** Demande d'affichage d'un autre mois (boutons, balayage, clavier) : toujours entre l'epoch et aujourd'hui. */
  readonly onMonthChange: (month: MonthRef) => void;
  /** Jour courant : dernier jour jouable. */
  readonly today: ISODate;
  /** Premier jour jouable (epoch). */
  readonly first: ISODate;
  /** État d'un jour jouable. */
  readonly status: (date: ISODate) => DayStatus;
  /**
   * Jour verrouillé (vidéo ou Premium requis pour l'ouvrir) : cadenas sur la case, état « verrouillé » et entrée
   * de légende (si le mois affiché en compte). Un jour verrouillé reste sélectionnable : à l'appelant de réagir.
   */
  readonly locked?: (date: ISODate) => boolean;
  /** Nom (traduit) du puzzle servi ce jour-là, ajouté au nom accessible du jour (les types alternent). */
  readonly puzzleName?: (date: ISODate) => string;
  readonly onSelect: (date: ISODate) => void;
}

/** État affiché d'un jour : celui de la partie, ou « verrouillé » (le cadenas prend le pas sur l'état de la partie). */
type DayState = DayStatus | 'locked';

/** Un lundi quelconque : donne le nom des jours de la semaine. */
const MONDAY = '2024-01-01';
/** Pastille de coin de chaque état (la couleur seule ne suffit pas à le distinguer). */
const BADGES: Partial<Record<DayState, IconName>> = { solved: 'crown', late: 'check', frozen: 'ac_unit', locked: 'lock' };
const LEGEND: readonly DayState[] = ['solved', 'late', 'frozen', 'progress'];
/** Distance horizontale (px) d'un balayage de mois. */
const SWIPE_DISTANCE = 56;

/** Formats Intl d'une langue : dates construites à midi UTC et affichées en UTC (aucun décalage de fuseau). */
function createFormats(lang: Language) {
  const format = (options: Intl.DateTimeFormatOptions) => {
    const intl = new Intl.DateTimeFormat(BCP47[lang], { ...options, timeZone: 'UTC' });
    return (date: ISODate) => intl.format(new Date(`${date}T12:00:00Z`));
  };
  const title = format({ month: 'long', year: 'numeric' });
  const narrow = format({ weekday: 'narrow' });
  const long = format({ weekday: 'long' });
  return {
    month: (month: MonthRef) => title(firstDayOf(month)),
    day: format({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    weekdays: Array.from({ length: 7 }, (_, i) => addDays(MONDAY, i)).map((date) => ({ narrow: narrow(date), long: long(date) })),
  };
}

export function ArchiveCalendar({ month, onMonthChange, today, first, status, locked, puzzleName, onSelect }: ArchiveCalendarProps) {
  const { t, i18n } = useTranslation();
  const { spatial, effects } = useMotionTokens();
  const titleId = useId();
  const unlockHintId = useId();
  const gridRef = useRef<HTMLDivElement>(null);
  const formats = useMemo(() => createFormats(i18n.language as Language), [i18n.language]);
  const weeks = useMemo(() => monthGrid(month), [month.year, month.month]);
  const { min, max } = monthBounds(first, today);

  // Jour « tabulable » (tabindex 0) : le dernier visité, sinon aujourd'hui, sinon le premier du mois.
  const [visited, setVisited] = useState<ISODate | null>(null);
  const tabStop = focusableDay(month, visited, first, today);
  const buttonOf = (date: ISODate) => gridRef.current?.querySelector<HTMLElement>(`[data-date="${date}"]`);

  // Le focus suit le clavier jusque dans un autre mois : il est posé une fois ce mois affiché.
  const pendingFocus = useRef<ISODate | null>(null);
  const focusDay = (date: ISODate) => {
    setVisited(date);
    if (diffMonths(month, monthOf(date)) === 0) {
      buttonOf(date)?.focus();
    } else {
      pendingFocus.current = date;
      onMonthChange(monthOf(date));
    }
  };
  useEffect(() => {
    const date = pendingFocus.current;
    pendingFocus.current = null;
    if (date !== null) buttonOf(date)?.focus();
  }, [month.year, month.month]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const from = (e.target as HTMLElement).closest<HTMLElement>('[data-date]')?.dataset.date;
    const target = from ? keyboardTarget(from, e.key, first, today) : null;
    if (target === null) return;
    e.preventDefault();
    focusDay(target);
  };
  const onFocus = (e: FocusEvent<HTMLDivElement>) => {
    const date = (e.target as HTMLElement).dataset.date;
    if (date) setVisited(date);
  };

  // Balayage horizontal au doigt ou au stylet : mois suivant (vers la gauche) ou précédent.
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    swipe.current = e.isPrimary && e.pointerType !== 'mouse' ? { x: e.clientX, y: e.clientY } : null;
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const start = swipe.current;
    swipe.current = null;
    if (!start) return;
    const dx = e.clientX - start.x;
    if (Math.abs(dx) < SWIPE_DISTANCE || Math.abs(dx) < 2 * Math.abs(e.clientY - start.y)) return;
    const target = clampMonth(addMonths(month, dx < 0 ? 1 : -1), first, today);
    if (diffMonths(month, target) !== 0) onMonthChange(target);
  };

  // Glissement du mois entrant dans le sens de la navigation (fondu seul si les animations sont réduites).
  const [shown, setShown] = useState({ month, direction: 0 });
  if (diffMonths(shown.month, month) !== 0) setShown({ month, direction: Math.sign(diffMonths(shown.month, month)) });

  const stateOf = (date: ISODate): DayState => (locked?.(date) ? 'locked' : status(date));
  const dayLabel = (date: ISODate, playable: boolean) => {
    const text = formats.day(date);
    if (!playable) return text;
    const state = t(`archive.status.${stateOf(date)}`);
    const puzzle = puzzleName?.(date);
    if (puzzle) return t(date === today ? 'archive.dayTodayPuzzle' : 'archive.dayPuzzle', { date: text, puzzle, status: state });
    return t(date === today ? 'archive.dayToday' : 'archive.day', { date: text, status: state });
  };
  // « Verrouillé » n'apparaît dans la légende que si le mois affiché compte au moins un jour verrouillé.
  const legend = locked && playableDays(month, first, today).some(locked) ? [...LEGEND, 'locked' as const] : LEGEND;

  return (
    <div className="archive-cal">
      <div className="archive-cal__header">
        <IconButton
          icon="chevron_left"
          label={t('archive.previousMonth')}
          disabled={diffMonths(min, month) <= 0}
          onClick={() => onMonthChange(addMonths(month, -1))}
        />
        <h2 id={titleId} className="md-typescale-title-medium archive-cal__title" aria-live="polite">
          {formats.month(month)}
        </h2>
        <IconButton
          icon="chevron_right"
          label={t('archive.nextMonth')}
          disabled={diffMonths(month, max) <= 0}
          onClick={() => onMonthChange(addMonths(month, 1))}
        />
      </div>

      <div
        ref={gridRef}
        role="grid"
        aria-labelledby={titleId}
        className="archive-cal__grid"
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          swipe.current = null;
        }}
      >
        <div role="row" className="archive-cal__row archive-cal__weekdays">
          {formats.weekdays.map((weekday) => (
            <span key={weekday.long} role="columnheader" aria-label={weekday.long} className="md-typescale-label-large archive-cal__weekday">
              {weekday.narrow}
            </span>
          ))}
        </div>
        <motion.div
          key={monthKey(month)}
          role="rowgroup"
          initial={shown.direction === 0 ? false : { opacity: 0, x: shown.direction * 32 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ x: spatial.default, opacity: effects.default }}
        >
          {weeks.map((week) => (
            <div key={week[0]!.date} role="row" className="archive-cal__row">
              {week.map((cell) => {
                const playable = !cell.outside && isPlayable(cell.date, first, today);
                return (
                  <div key={cell.date} role="gridcell" className="archive-cal__cell">
                    {cell.outside ? null : (
                      <Day
                        cell={cell}
                        status={playable ? stateOf(cell.date) : null}
                        label={dayLabel(cell.date, playable)}
                        unlockHintId={unlockHintId}
                        current={cell.date === today}
                        tabbable={cell.date === tabStop}
                        onSelect={onSelect}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </motion.div>
      </div>

      {/* Lue avec chaque jour verrouillé (aria-describedby) : ce que fait un toucher sur un cadenas. */}
      {legend.includes('locked') && (
        <span id={unlockHintId} className="md-sr-only">
          {t('archive.unlockAction')}
        </span>
      )}

      <ul className="archive-cal__legend" role="list" aria-label={t('archive.legend')}>
        {legend.map((state) => {
          const badge = BADGES[state];
          return (
            <li key={state} className="md-typescale-label-medium archive-cal__key" data-status={state}>
              <span className="archive-cal__swatch" aria-hidden="true">
                {badge ? <Icon name={badge} size={14} filled /> : <span className="archive-day__dot" />}
              </span>
              <span className="archive-cal__label">{t(`archive.status.${state}`)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

interface DayProps {
  readonly cell: CalendarCell;
  /** État du jour ; `null` hors de l'intervalle jouable (bouton désactivé). */
  readonly status: DayState | null;
  readonly label: string;
  /** Description d'un jour verrouillé (l'action de déblocage). */
  readonly unlockHintId: string;
  readonly current: boolean;
  readonly tabbable: boolean;
  readonly onSelect: (date: ISODate) => void;
}

/** Disque d'un jour : chiffre, pastille de coin (couronne, coche, flocon, cadenas) ou point (partie entamée). */
function Day({ cell, status, label, unlockHintId, current, tabbable, onSelect }: DayProps) {
  const badge = status ? BADGES[status] : undefined;
  return (
    <button
      type="button"
      className="archive-day"
      data-date={cell.date}
      data-status={status ?? undefined}
      data-today={current ? '' : undefined}
      disabled={status === null}
      tabIndex={tabbable ? 0 : -1}
      aria-label={label}
      aria-describedby={status === 'locked' ? unlockHintId : undefined}
      aria-current={current ? 'date' : undefined}
      onClick={() => onSelect(cell.date)}
    >
      <span className="archive-day__disc">
        <span className="md-typescale-body-large">{cell.day}</span>
        {badge ? (
          <span className="archive-day__badge">
            <Icon name={badge} size={14} filled />
          </span>
        ) : status === 'progress' ? (
          <span className="archive-day__dot" />
        ) : null}
      </span>
    </button>
  );
}
