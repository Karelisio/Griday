/** Date civile locale du jour, mise à jour à minuit et au retour au premier plan. */
import { useEffect, useState } from 'react';
import { localISODate, type ISODate } from '../engine/core/date';
import { onAppActiveChange } from './platform';

export function useToday(): ISODate {
  const [today, setToday] = useState(() => localISODate(new Date()));
  // Chaque réveil reprogramme le suivant, même si la date n'a pas changé (horloge corrigée, fuseau).
  const [wake, setWake] = useState(0);
  useEffect(() => {
    const refresh = () => {
      setToday(localISODate(new Date()));
      setWake((w) => w + 1);
    };
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
    const timer = setTimeout(refresh, Math.max(1000, midnight.getTime() - now.getTime()));
    const off = onAppActiveChange((active) => active && refresh());
    return () => {
      clearTimeout(timer);
      off();
    };
  }, [today, wake]);
  return today;
}

/** Millisecondes jusqu'au prochain minuit local. */
export function msUntilMidnight(now = new Date()): number {
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return midnight.getTime() - now.getTime();
}
