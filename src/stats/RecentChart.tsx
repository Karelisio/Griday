/**
 * Graphique 2 : temps des derniers puzzles du jour, du plus ancien au plus récent (une colonne par puzzle).
 * Couleur = difficulté (rampe ordinale), hachures = puzzle d'archive. Un curseur invisible superposé au tracé
 * donne le détail d'un puzzle (toucher, glisser ou flèches du clavier) ; la liste masquée en est la version texte.
 */
import { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Language } from '../i18n';
import { formatClock, formatDuration } from '../i18n/format';
import type { DailyResult } from '../progress/types';
import { Card } from '../ui';
import { cssVars, outlierLimit, share, timeScale } from './chart';
import { formatShortDate } from './format';
import './stats.css';

const TIERS = [1, 2, 3, 4] as const;

export function RecentChart({ results }: { results: readonly DailyResult[] }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language as Language;
  const titleId = useId();
  const [picked, setPicked] = useState<number | null>(null);
  const n = results.length;
  const index = Math.min(picked ?? n - 1, n - 1);
  const shown = results[index]!;
  // L'axe suit le plus grand temps « normal » : une valeur aberrante est tronquée (rupture dessinée) plutôt que d'aplatir le reste.
  const scale = useMemo(() => {
    const times = results.map((r) => r.timeMs);
    const limit = outlierLimit(times);
    return timeScale(Math.max(...times.filter((x) => x <= limit)));
  }, [results]);

  const details = (r: DailyResult) => [
    t(`difficulty.${r.tier}`),
    t('unlimited.sizeValue', { n: r.size }),
    t('victory.hints', { count: r.hintsUsed }).toLocaleLowerCase(lang),
    t(r.mode === 'daily' ? 'stats.daily.onTime' : 'stats.recent.archive').toLocaleLowerCase(lang),
  ];
  const spoken = (r: DailyResult) => [formatShortDate(r.date, lang, true), formatDuration(r.timeMs, lang), ...details(r)].join(', ');
  const times = results.map((r) => r.timeMs);
  const summary = t('stats.recent.label', {
    n,
    from: formatShortDate(results[0]!.date, lang),
    to: formatShortDate(results[n - 1]!.date, lang),
    min: formatDuration(Math.min(...times), lang),
    max: formatDuration(Math.max(...times), lang),
    last: formatDuration(results[n - 1]!.timeMs, lang),
  });

  return (
    <Card as="section" aria-labelledby={titleId} className="stats-card">
      <h3 id={titleId} className="md-typescale-title-medium stats-card__title">
        {t('stats.recent.title', { count: n })}
      </h3>

      <ul className="recent-chart__legend md-typescale-label-small" aria-hidden="true">
        {TIERS.map((tier) => (
          <li key={tier} data-tier={tier}>
            <span className="recent-chart__swatch" />
            {t(`difficulty.${tier}`)}
          </li>
        ))}
        <li data-archive>
          <span className="recent-chart__swatch" />
          {t('stats.recent.archive')}
        </li>
      </ul>

      <p className="recent-chart__readout" aria-hidden="true">
        <span className="md-typescale-title-medium" data-tier={shown.tier}>
          <span className="recent-chart__swatch" />
          {formatShortDate(shown.date, lang, true)} · {formatClock(shown.timeMs, lang)}
        </span>
        <span className="md-typescale-body-small">{details(shown).join(' · ')}</span>
      </p>

      <div className="recent-chart" style={cssVars({ '--n': n, '--k': scale.ticks.length - 1 })}>
        <div className="recent-chart__ticks md-typescale-label-small" aria-hidden="true">
          {scale.ticks.map((ms) => (
            <span key={ms}>{formatClock(ms, lang)}</span>
          ))}
        </div>
        <div className="recent-chart__plot">
          <div className="recent-chart__bars" role="img" aria-label={summary}>
            {results.map((r, i) => (
              <span key={r.date} className="recent-chart__slot" data-selected={i === index || undefined}>
                <span
                  className="recent-chart__bar"
                  data-tier={r.tier}
                  data-archive={r.mode === 'archive' || undefined}
                  data-clipped={r.timeMs > scale.topMs || undefined}
                  style={cssVars({ '--h': share(r.timeMs, scale.topMs), '--i': i })}
                />
              </span>
            ))}
          </div>
          <input
            type="range"
            className="recent-chart__scrub"
            min={0}
            max={n - 1}
            step={1}
            value={index}
            onChange={(e) => setPicked(Number(e.target.value))}
            aria-label={t('stats.recent.pick')}
            aria-valuetext={spoken(shown)}
          />
        </div>
        <div className="recent-chart__axis md-typescale-label-small" aria-hidden="true">
          <span>{formatShortDate(results[0]!.date, lang)}</span>
          <span>{formatShortDate(results[n - 1]!.date, lang)}</span>
        </div>
      </div>

      <ol className="md-sr-only">
        {results.map((r) => (
          <li key={r.date}>{spoken(r)}</li>
        ))}
      </ol>
    </Card>
  );
}
