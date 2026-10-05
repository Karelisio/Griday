/** Chronomètre affiché (seul composant rafraîchi chaque seconde). */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Language } from '../i18n';
import { formatClock } from '../i18n/format';

export function Timer({ elapsed, running }: { elapsed: () => number; running: boolean }) {
  const { t, i18n } = useTranslation();
  const [, tick] = useState(0);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => tick((x) => x + 1), 250);
    return () => clearInterval(id);
  }, [running]);
  return (
    <span className="game-timer md-typescale-title-medium" role="timer">
      <span className="md-sr-only">{t('game.timer')} </span>
      {formatClock(elapsed(), i18n.language as Language)}
    </span>
  );
}
