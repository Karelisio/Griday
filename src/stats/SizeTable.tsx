/** Mode illimité : tableau compact par taille de grille (parties résolues, temps moyen, meilleur temps). */
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { Language } from '../i18n';
import { formatNumber } from '../i18n/format';
import type { SizeStats } from '../progress/types';
import { Card } from '../ui';
import { DASH } from './format';
import { TimeValue } from './TimeValue';
import './stats.css';

export function SizeTable({ sizes }: { sizes: readonly SizeStats[] }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language as Language;
  const titleId = useId();
  const time = (ms: number | null) => (ms === null ? DASH : <TimeValue ms={ms} lang={lang} />);

  return (
    <Card as="section" aria-labelledby={titleId} className="stats-card">
      <h3 id={titleId} className="md-typescale-title-medium stats-card__title">
        {t('stats.bySize.title')}
      </h3>
      <table className="size-table">
        <thead>
          <tr className="md-typescale-label-medium">
            <th scope="col">{t('unlimited.size')}</th>
            <th scope="col">{t('stats.solved')}</th>
            <th scope="col">{t('stats.average')}</th>
            <th scope="col">{t('stats.best')}</th>
          </tr>
        </thead>
        <tbody className="md-typescale-body-large">
          {sizes.map(({ type, size, count, averageMs, bestMs }) => (
            <tr key={`${type ?? ''}${size}`}>
              <th scope="row">
                {type && <span className="size-table__type">{t(`puzzle.${type}.name`)} </span>}
                {t('unlimited.sizeValue', { n: size })}
              </th>
              <td>{formatNumber(count, lang)}</td>
              <td>{time(averageMs)}</td>
              <td>{time(bestMs)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
