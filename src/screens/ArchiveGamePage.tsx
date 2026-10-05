/** Puzzle d'un jour passé, rejoué depuis le calendrier (ne compte pas pour la série). */
import { useTranslation } from 'react-i18next';
import type { ISODate } from '../../engine/core/date';
import { useDailyGame } from '../daily/useDailyGame';
import { GameView } from '../game/GameView';
import type { Language } from '../i18n';
import { formatDate, formatNumber } from '../i18n/format';
import { useProgress } from '../progress/ProgressContext';
import { ShareButton } from '../share/ShareButton';
import { Button, CircularProgress, Icon, InfoChip } from '../ui';
import './screens.css';

export function ArchiveGamePage({ date, visible }: { date: ISODate; visible: boolean }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language as Language;
  const { history } = useProgress();
  const { info, daily, error, retry, api } = useDailyGame({ date, mode: 'archive', visible });
  const onTime = history.get(date)?.mode === 'daily';

  return (
    <section className="screen" aria-labelledby="archive-game-title">
      <header className="screen__header">
        <p className="md-typescale-label-large screen__overline">{t('archive.title')}</p>
        <h1 id="archive-game-title" className="md-typescale-headline-medium screen__title">
          {info ? t('today.archiveTitle', { n: formatNumber(info.dayNumber, lang) }) : ' '}
        </h1>
        <p className="md-typescale-body-large screen__subtitle">{formatDate(date, lang, 'full')}</p>
        {info && (
          <div className="screen__chips">
            <InfoChip icon="crown">{t('puzzle.queens.name')}</InfoChip>
            <InfoChip icon="grid_view">{t('unlimited.sizeValue', { n: info.target.size })}</InfoChip>
            <InfoChip icon="bolt">{t(`difficulty.${info.target.tier}`)}</InfoChip>
          </div>
        )}
      </header>

      {error ? (
        <div className="screen__center">
          <Icon name="error" size={40} />
          <p className="md-typescale-body-large">{t('errors.generation')}</p>
          <Button variant="tonal" icon="refresh" onClick={retry}>
            {t('common.retry')}
          </Button>
        </div>
      ) : !daily || !api.game ? (
        <div className="screen__center" role="status">
          <CircularProgress aria-label={t('today.generating')} />
          <p className="md-typescale-body-large">{t('today.generating')}</p>
        </div>
      ) : (
        <GameView
          key={date}
          puzzle={daily.puzzle}
          api={api}
          visible={visible}
          victoryExtra={
            <>
              {!onTime && (
                <p className="md-typescale-body-medium victory-card__note">
                  <Icon name="info" size={18} />
                  {t('victory.archive')}
                </p>
              )}
              <div className="victory-card__actions">
                <ShareButton
                  result={{
                    kind: onTime ? 'daily' : 'archive',
                    n: daily.dayNumber,
                    size: daily.target.size,
                    tier: daily.target.tier,
                    timeMs: api.game.elapsedMs,
                    hintsUsed: api.game.hintsUsed,
                  }}
                />
              </div>
            </>
          }
        />
      )}
    </section>
  );
}
