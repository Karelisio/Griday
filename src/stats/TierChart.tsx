/** Graphique 1 : temps moyen par difficulté (barres horizontales, valeur au bout, paliers vides en tiret). */
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { Language } from '../i18n';
import { formatClock, formatDuration } from '../i18n/format';
import type { TierStats } from '../progress/types';
import { Card } from '../ui';
import { cssVars, share } from './chart';
import { DASH } from './format';
import './stats.css';

export function TierChart({ tiers }: { tiers: readonly TierStats[] }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language as Language;
  const titleId = useId();
  const longest = Math.max(0, ...tiers.map((x) => x.averageMs ?? 0));
  // Le libellé accessible redit le graphique en toutes lettres (les barres ne portent que de la mise en forme).
  const summary = tiers
    .map(({ tier, count, averageMs }) => {
      const name = t(`difficulty.${tier}`);
      return averageMs === null
        ? t('stats.byTier.itemEmpty', { tier: name })
        : t('stats.byTier.item', { tier: name, time: formatDuration(averageMs, lang), puzzles: t('stats.puzzles', { count }) });
    })
    .join('. ');

  return (
    <Card as="section" aria-labelledby={titleId} className="stats-card">
      <h3 id={titleId} className="md-typescale-title-medium stats-card__title">
        {t('stats.byTier.title')}
      </h3>
      <div className="tier-chart" role="img" aria-label={`${t('stats.byTier.title')}. ${summary}.`}>
        {tiers.map(({ tier, count, averageMs }, i) => (
          <div key={tier} className="tier-chart__row" data-tier={tier} data-empty={averageMs === null || undefined} style={cssVars({ '--v': share(averageMs ?? 0, longest), '--i': i })}>
            <span className="tier-chart__name md-typescale-label-large">{t(`difficulty.${tier}`)}</span>
            <span className="tier-chart__count md-typescale-label-small">{t('stats.puzzles', { count })}</span>
            <span className="tier-chart__track">
              <span className="tier-chart__bar" />
              <span className="tier-chart__value md-typescale-label-large">{averageMs === null ? DASH : formatClock(averageMs, lang)}</span>
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}
