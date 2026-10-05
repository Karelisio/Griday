/** Statistiques : série et gels, puzzles du jour (chiffres clés, temps par difficulté, évolution), mode illimité. */
import { useId, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { Language } from '../i18n';
import { formatNumber } from '../i18n/format';
import { useProgress } from '../progress/ProgressContext';
import { formatPercent } from '../stats/format';
import { RecentChart } from '../stats/RecentChart';
import { SizeTable } from '../stats/SizeTable';
import { StatTile } from '../stats/StatTile';
import { StreakCard } from '../stats/StreakCard';
import { TierChart } from '../stats/TierChart';
import { TimeValue } from '../stats/TimeValue';
import { Card, Icon } from '../ui';
import './screens.css';
import './StatsScreen.css';

/** Section titrée de l'écran (le titre nomme la région pour les lecteurs d'écran). */
function Group({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section className="stats__group" aria-labelledby={id}>
      <h2 id={id} className="md-typescale-title-small stats__section">
        {title}
      </h2>
      {children}
    </section>
  );
}

function EmptyState() {
  const { t } = useTranslation();
  return (
    <Card className="stats-empty">
      <span className="stats-empty__icon" aria-hidden="true">
        <Icon name="bar_chart" size={36} />
      </span>
      <h2 className="md-typescale-title-large">{t('stats.empty.title')}</h2>
      <p className="md-typescale-body-large">{t('stats.empty.body')}</p>
    </Card>
  );
}

export function StatsScreen({ visible }: { visible: boolean }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language as Language;
  const { ready, summary, dailyStats: daily, unlimitedStats: unlimited } = useProgress();
  const count = (n: number) => formatNumber(n, lang);
  // Part des puzzles du jour résolus : pourcentage et jauge.
  const part = (n: number) => ({ detail: formatPercent(n / daily.solved, lang), meter: n / daily.solved });
  const lastRecent = daily.recent.at(-1);

  return (
    <section className="screen" aria-labelledby="stats-title" hidden={!visible}>
      <header className="screen__header">
        <h1 id="stats-title" className="md-typescale-headline-medium screen__title">
          {t('stats.title')}
        </h1>
      </header>

      {!ready ? null : daily.solved === 0 && unlimited.solved === 0 ? (
        <EmptyState />
      ) : (
        <>
          <StreakCard summary={summary} />

          <Group title={t('stats.daily.title')}>
            {daily.averageMs === null || daily.bestMs === null ? (
              <p className="md-typescale-body-medium stats__note">{t('stats.daily.empty')}</p>
            ) : (
              <>
                <dl className="stat-tiles stat-tiles--3">
                  <StatTile label={t('stats.solved')} value={count(daily.solved)} />
                  <StatTile label={t('stats.average')} value={<TimeValue ms={daily.averageMs} lang={lang} />} />
                  <StatTile label={t('stats.best')} value={<TimeValue ms={daily.bestMs} lang={lang} />} />
                </dl>
                <dl className="stat-tiles stat-tiles--2">
                  <StatTile label={t('stats.daily.onTime')} value={count(daily.onTime)} {...part(daily.onTime)} />
                  <StatTile label={t('stats.daily.noHint')} value={count(daily.noHint)} {...part(daily.noHint)} />
                </dl>
                <TierChart tiers={daily.byTier} />
                {lastRecent && daily.recent.length >= 2 ? (
                  <RecentChart key={`${lastRecent.date}:${daily.recent.length}`} results={daily.recent} />
                ) : (
                  <p className="md-typescale-body-medium stats__note">{t('stats.recent.needMore')}</p>
                )}
              </>
            )}
          </Group>

          <Group title={t('unlimited.title')}>
            {unlimited.averageMs === null ? (
              <p className="md-typescale-body-medium stats__note">{t('stats.unlimited.empty')}</p>
            ) : (
              <>
                <dl className="stat-tiles stat-tiles--2">
                  <StatTile label={t('stats.solved')} value={count(unlimited.solved)} />
                  <StatTile label={t('stats.average')} value={<TimeValue ms={unlimited.averageMs} lang={lang} />} />
                </dl>
                <SizeTable sizes={unlimited.bySize} />
              </>
            )}
          </Group>
        </>
      )}
    </section>
  );
}
