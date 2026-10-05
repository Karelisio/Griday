/** Page Premium : avantages, achat (prix localisé de Google Play), restauration des achats et code promo. */
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { useMonetization } from '../monetization/MonetizationContext';
import { PLAY_REDEEM_URL } from '../monetization/config';
import { Button, Card, Icon, List, ListItem, type IconName } from '../ui';
import { usePremiumActions } from './usePremiumActions';
import './screens.css';
import './PremiumPage.css';

const BENEFITS: readonly { readonly key: 'noAds' | 'hints' | 'archives' | 'freeze'; readonly icon: IconName }[] = [
  { key: 'noAds', icon: 'ad_off' },
  { key: 'hints', icon: 'lightbulb' },
  { key: 'archives', icon: 'lock_open' },
  { key: 'freeze', icon: 'ac_unit' },
];

export function PremiumPage({ visible }: { visible: boolean }) {
  const { t } = useTranslation();
  const { premium, price, purchaseAvailable } = useMonetization();
  const { busy, buy, restore } = usePremiumActions();
  const unavailableId = useId();

  return (
    <section className="screen premium" aria-labelledby="premium-title" hidden={!visible}>
      <header className="screen__header premium__hero">
        <span className="premium__emblem" aria-hidden="true">
          <Icon name="workspace_premium" size={44} filled />
        </span>
        <h1 id="premium-title" className="md-typescale-headline-medium screen__title">
          {t('premium.title')}
        </h1>
        <p className="md-typescale-body-large screen__subtitle">{t('premium.subtitle')}</p>
      </header>

      {premium && (
        <Card variant="filled" className="premium__status" role="status">
          <Icon name="verified" size={32} filled />
          <div>
            <p className="md-typescale-title-medium">{t('premium.active')}</p>
            <p className="md-typescale-body-medium">{t('premium.thanks')}</p>
          </div>
        </Card>
      )}

      <List variant="segmented" className="premium__benefits">
        {BENEFITS.map(({ key, icon }) => (
          <ListItem key={key} leading={<Icon name={icon} />} headline={t(`premium.benefits.${key}`)} />
        ))}
      </List>

      {!premium && (
        <div className="premium__buy">
          <Button
            variant="filled"
            size="m"
            icon="workspace_premium"
            iconFilled
            fullWidth
            disabled={!purchaseAvailable || busy}
            aria-describedby={purchaseAvailable ? undefined : unavailableId}
            onClick={() => void buy()}
          >
            {price ? t('premium.buy', { price }) : t('premium.buyNoPrice')}
          </Button>
          {!purchaseAvailable && (
            <p id={unavailableId} className="md-typescale-body-small premium__note">
              <Icon name="cloud_off" size={18} />
              <span>{t('premium.unavailable')}</span>
            </p>
          )}
        </div>
      )}

      <div className="premium__more">
        <Button variant="outlined" icon="restore" fullWidth disabled={busy} onClick={() => void restore()}>
          {t('premium.restore')}
        </Button>
        <Button variant="outlined" icon="redeem" fullWidth onClick={() => void window.open(PLAY_REDEEM_URL, '_blank')}>
          {t('premium.promo')}
        </Button>
        <p className="md-typescale-body-small premium__note">{t('premium.promoHint')}</p>
      </div>
    </section>
  );
}
