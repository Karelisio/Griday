/**
 * Progression côté React : historique des résultats, série (réglée à chaque nouveau jour),
 * statistiques dérivées. Source unique en mémoire, chaque changement est écrit aussitôt.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { diffDays, localISODate, type ISODate } from '../../engine/core/date';
import { useToday } from '../useToday';
import { dailyStats, unlimitedStats } from './stats';
import { loadProgressData, saveDailyHistory, saveStreak, saveUnlimitedHistory, type ProgressData, MAX_UNLIMITED_RESULTS } from './store';
import { EMPTY_STREAK, MAX_FREEZES, applyDailySolve, settleStreak, summarizeStreak } from './streak';
import type { DailyMode, DailyResult, DailyStats, StreakState, StreakSummary, UnlimitedResult, UnlimitedStats } from './types';

export interface ProgressValue {
  /** Données chargées (sinon valeurs vides). */
  readonly ready: boolean;
  readonly today: ISODate;
  readonly history: ReadonlyMap<ISODate, DailyResult>;
  readonly unlimited: readonly UnlimitedResult[];
  readonly streak: StreakState;
  readonly summary: StreakSummary;
  readonly dailyStats: DailyStats;
  readonly unlimitedStats: UnlimitedStats;
  /**
   * Enregistre un puzzle du jour résolu (ignoré s'il l'est déjà). Indique si un gel a été gagné et le mode
   * retenu (« daily » seulement s'il compte pour la série) ; `null` : rien n'a été enregistré.
   */
  readonly recordDaily: (result: DailyResult) => { readonly earnedFreeze: boolean; readonly mode: DailyMode | null };
  readonly recordUnlimited: (result: UnlimitedResult) => void;
  /** Ajoute un gel (récompense, étape publicité) ; faux si la réserve est pleine. */
  readonly addFreeze: () => boolean;
  /** Puzzle de la veille encore en cours après minuit (la série l'attend), ou null. */
  readonly setPendingDay: (date: ISODate | null) => void;
}

const EMPTY: ProgressData = { history: new Map(), unlimited: [], unlimitedTotal: 0, streak: EMPTY_STREAK };
const totalOf = (d: ProgressData) => Math.max(d.unlimitedTotal ?? 0, d.unlimited.length);
/** Résolu au plus tard le lendemain (minuit passé en cours de partie) : compte comme puzzle du jour. */
const MAX_DAILY_DELAY = 1;

const solvedDays = (history: ReadonlyMap<ISODate, DailyResult>) =>
  new Set([...history.values()].filter((r) => r.mode === 'daily').map((r) => r.date));

const Ctx = createContext<ProgressValue | null>(null);

export function ProgressProvider({ initial, children }: { initial?: ProgressData; children: ReactNode }) {
  const today = useToday();
  const [data, setData] = useState<ProgressData | null>(initial ?? null);
  const [pendingDay, setPendingDay] = useState<ISODate | null>(null);
  const dataRef = useRef(data);
  const commit = useCallback((next: ProgressData) => {
    dataRef.current = next;
    setData(next);
  }, []);

  useEffect(() => {
    if (dataRef.current) return;
    let cancelled = false;
    void loadProgressData()
      .catch(() => EMPTY)
      .then((loaded) => {
        if (!cancelled && !dataRef.current) commit(loaded);
      });
    return () => {
      cancelled = true;
    };
  }, [commit]);

  // Nouveau jour (ou premier chargement) : sort des jours passés réglé (gels consommés).
  const ready = data !== null;
  useEffect(() => {
    const current = dataRef.current;
    if (!current) return;
    const streak = settleStreak(current.streak, solvedDays(current.history), today);
    if (streak === current.streak) return;
    commit({ ...current, streak });
    void saveStreak(streak);
  }, [today, ready, commit]);

  const recordDaily = useCallback(
    (result: DailyResult) => {
      const current = dataRef.current;
      if (!current || current.history.has(result.date)) return { earnedFreeze: false, mode: null };
      const now = localISODate(new Date());
      const mode: DailyMode = result.mode === 'daily' && diffDays(result.date, result.solvedOn) <= MAX_DAILY_DELAY ? 'daily' : 'archive';
      const history = new Map(current.history).set(result.date, { ...result, mode });
      const applied = mode === 'daily' ? applyDailySolve(current.streak, solvedDays(history), result.date, now) : null;
      const streak = applied ? applied.state : current.streak;
      commit({ ...current, history, streak });
      void saveDailyHistory(history);
      if (streak !== current.streak) void saveStreak(streak);
      return { earnedFreeze: applied?.earned ?? false, mode };
    },
    [commit],
  );

  const recordUnlimited = useCallback(
    (result: UnlimitedResult) => {
      const current = dataRef.current;
      if (!current) return;
      const unlimited = [...current.unlimited, result].slice(-MAX_UNLIMITED_RESULTS);
      const unlimitedTotal = totalOf(current) + 1;
      commit({ ...current, unlimited, unlimitedTotal });
      void saveUnlimitedHistory(unlimited, unlimitedTotal);
    },
    [commit],
  );

  const addFreeze = useCallback(() => {
    const current = dataRef.current;
    if (!current || current.streak.freezes >= MAX_FREEZES) return false;
    const streak = { ...current.streak, freezes: current.streak.freezes + 1 };
    commit({ ...current, streak });
    void saveStreak(streak);
    return true;
  }, [commit]);

  const value = useMemo<ProgressValue>(() => {
    const d = data ?? EMPTY;
    return {
      ready: data !== null,
      today,
      history: d.history,
      unlimited: d.unlimited,
      streak: d.streak,
      summary: summarizeStreak(d.streak, solvedDays(d.history), today, pendingDay),
      dailyStats: dailyStats(d.history.values()),
      unlimitedStats: unlimitedStats(d.unlimited, totalOf(d)),
      recordDaily,
      recordUnlimited,
      addFreeze,
      setPendingDay,
    };
  }, [data, today, pendingDay, recordDaily, recordUnlimited, addFreeze]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useProgress(): ProgressValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useProgress hors de ProgressProvider');
  return v;
}
