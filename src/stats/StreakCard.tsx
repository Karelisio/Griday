/** Carte héros de la série : jours consécutifs, record, gels disponibles et rappel du jour. */
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { Language } from '../i18n';
import { formatNumber } from '../i18n/format';
import { FREEZE_EVERY, MAX_FREEZES } from '../progress/streak';
import type { StreakSummary } from '../progress/types';
import { Card, Icon, InfoChip } from '../ui';
import './stats.css';

export function StreakCard({ summary }: { summary: StreakSummary }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language as Language;
  const titleId = useId();
  const { current, best, freezes, todaySolved, atRisk } = summary;
  // Une seule phrase d'état : jour résolu, série menacée, ou aucune série à prolonger.
  const status = todaySolved
    ? { key: 'done', icon: 'check_circle' as const }
    : atRisk
      ? { key: 'atRisk', icon: 'schedule' as const }
      : { key: 'start', icon: 'play_arrow' as const };

  return (
    <Card as="section" aria-labelledby={titleId} className="streak-card">
      <div className="streak-card__head">
        <h2 id={titleId} className="md-typescale-label-large streak-card__title">
          {t('stats.streak.title')}
        </h2>
        <div className="streak-card__row">
          <span className="streak-card__flame" aria-hidden="true">
            <Icon name="local_fire_department" filled size={40} />
          </span>
          <p className="streak-card__count">
            <span className="md-typescale-display-large-emphasized">{formatNumber(current, lang)}</span>
            <span className="md-typescale-title-large">{t('stats.streak.days', { count: current })}</span>
          </p>
        </div>
        {best > 0 ? <InfoChip icon="emoji_events">{t('stats.streak.best', { count: best })}</InfoChip> : null}
      </div>

      <p className="streak-card__status md-typescale-label-large" data-status={status.key}>
        <Icon name={status.icon} size={20} />
        {t(`stats.streak.${status.key}`)}
      </p>

      <div className="streak-card__freezes">
        <div className="streak-card__freezes-head">
          <h3 className="md-typescale-title-small">{t('stats.freezes.title')}</h3>
          <span className="streak-card__slots" role="img" aria-label={t('stats.freezes.count', { n: freezes, max: MAX_FREEZES })}>
            {Array.from({ length: MAX_FREEZES }, (_, i) => (
              <span key={i} className="streak-card__slot" data-filled={i < freezes || undefined}>
                <Icon name="ac_unit" size={22} />
              </span>
            ))}
          </span>
        </div>
        <p className="md-typescale-body-small streak-card__explain">{t('stats.freezes.explain', { every: FREEZE_EVERY, max: MAX_FREEZES })}</p>
      </div>
    </Card>
  );
}
