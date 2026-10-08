/**
 * Réglages : langue, thème, couleurs dynamiques, vibrations, signalement des erreurs, croix automatiques, rappel quotidien, Premium
 * (seulement dans un build avec publicités) et version.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { LanguagePreference } from '../i18n';
import { useMonetization } from '../monetization/MonetizationContext';
import { getAppVersion } from '../platform';
import { notificationsAvailable } from '../platform/notifications';
import { useEnableReminder } from '../reminders';
import { useSettings } from '../settings/SettingsContext';
import { isReminderTime, type ThemeMode } from '../settings/types';
import { Icon, List, ListItem, SegmentedButton, Switch, useSnackbar } from '../ui';
import { usePremiumActions } from './usePremiumActions';
import './screens.css';
import './SettingsScreen.reminder.css';

export interface SettingsScreenProps {
  readonly visible: boolean;
  readonly dynamicSupported: boolean;
  /** Ouvre la page Premium (statut et achat). */
  readonly onOpenPremium?: () => void;
}

export function SettingsScreen({ visible, dynamicSupported, onOpenPremium }: SettingsScreenProps) {
  const { t } = useTranslation();
  const { settings, update } = useSettings();
  const snackbar = useSnackbar();
  const { adsEnabled, premium, privacyOptionsRequired, showPrivacyOptions } = useMonetization();
  const { busy: premiumBusy, restore } = usePremiumActions();
  const enableReminder = useEnableReminder();
  const reminderAvailable = notificationsAvailable();
  const [version, setVersion] = useState('');
  useEffect(() => {
    void getAppVersion().then(setVersion);
  }, []);

  const toggleReminder = async (on: boolean) => {
    if (!on) {
      update({ reminder: false });
      return;
    }
    // Refus : Android ne reposera pas la question, l'utilisateur doit autoriser les notifications dans ses réglages.
    if ((await enableReminder()) === 'denied') snackbar.show({ message: t('reminder.denied'), duration: 8000 });
  };

  return (
    <section className="screen" aria-labelledby="settings-title" hidden={!visible}>
      <header className="screen__header">
        <h1 id="settings-title" className="md-typescale-headline-medium screen__title">
          {t('settings.title')}
        </h1>
      </header>

      <h2 className="md-typescale-title-small settings__section">{t('settings.appearance')}</h2>
      <div className="settings__group">
        <p className="md-typescale-body-large settings__label" id="set-lang">
          <Icon name="translate" size={20} /> {t('settings.language.title')}
        </p>
        <SegmentedButton<LanguagePreference>
          aria-labelledby="set-lang"
          value={settings.language}
          onChange={(language) => update({ language })}
          options={[
            { value: 'system', label: t('settings.language.system') },
            { value: 'fr', label: t('settings.language.fr') },
            { value: 'en', label: t('settings.language.en') },
          ]}
        />
        <p className="md-typescale-body-large settings__label" id="set-theme">
          <Icon name="contrast" size={20} /> {t('settings.theme.title')}
        </p>
        <SegmentedButton<ThemeMode>
          aria-labelledby="set-theme"
          value={settings.theme}
          onChange={(theme) => update({ theme })}
          options={[
            { value: 'system', icon: 'brightness_auto', label: t('settings.theme.system') },
            { value: 'light', icon: 'light_mode', label: t('settings.theme.light') },
            { value: 'dark', icon: 'dark_mode', label: t('settings.theme.dark') },
          ]}
          showCheck={false}
        />
      </div>

      <List variant="segmented">
        <ListItem
          leading={<Icon name="palette" />}
          headline={t('settings.dynamicColor.title')}
          supporting={dynamicSupported ? t('settings.dynamicColor.description') : t('settings.dynamicColor.unavailable')}
          disabled={!dynamicSupported}
          control
          trailing={
            <Switch
              checked={dynamicSupported && settings.dynamicColor}
              disabled={!dynamicSupported}
              onChange={(dynamicColor) => update({ dynamicColor })}
              aria-label={t('settings.dynamicColor.title')}
            />
          }
        />
        <ListItem
          leading={<Icon name="grid_view" />}
          headline={t('settings.patterns.title')}
          supporting={t('settings.patterns.description')}
          control
          trailing={
            <Switch checked={settings.regionPatterns} onChange={(regionPatterns) => update({ regionPatterns })} aria-label={t('settings.patterns.title')} />
          }
        />
      </List>

      <h2 className="md-typescale-title-small settings__section">{t('settings.game')}</h2>
      <List variant="segmented">
        <ListItem
          leading={<Icon name="vibration" />}
          headline={t('settings.haptics.title')}
          supporting={t('settings.haptics.description')}
          control
          trailing={<Switch checked={settings.haptics} onChange={(haptics) => update({ haptics })} aria-label={t('settings.haptics.title')} />}
        />
        <ListItem
          leading={<Icon name="warning" />}
          headline={t('settings.showConflicts.title')}
          supporting={t('settings.showConflicts.description')}
          control
          trailing={
            <Switch checked={settings.showConflicts} onChange={(showConflicts) => update({ showConflicts })} aria-label={t('settings.showConflicts.title')} />
          }
        />
        <ListItem
          leading={<Icon name="close" />}
          headline={t('settings.autoCross.title')}
          supporting={t('settings.autoCross.description')}
          control
          trailing={<Switch checked={settings.autoCross} onChange={(autoCross) => update({ autoCross })} aria-label={t('settings.autoCross.title')} />}
        />
      </List>

      <h2 className="md-typescale-title-small settings__section">{t('reminder.title')}</h2>
      <List variant="segmented">
        <ListItem
          leading={<Icon name={settings.reminder ? 'notifications_active' : 'notifications'} />}
          headline={t('reminder.enable')}
          supporting={reminderAvailable ? t('reminder.description') : t('reminder.unavailable')}
          disabled={!reminderAvailable}
          control
          trailing={
            <Switch
              checked={reminderAvailable && settings.reminder}
              disabled={!reminderAvailable}
              onChange={(on) => void toggleReminder(on)}
              aria-label={t('reminder.enable')}
            />
          }
        />
        <ListItem
          leading={<Icon name="schedule" />}
          headline={t('reminder.time')}
          disabled={!settings.reminder}
          control
          trailing={
            <input
              type="time"
              className="reminder__time md-typescale-title-medium"
              value={settings.reminderTime}
              disabled={!settings.reminder}
              aria-label={t('reminder.time')}
              onChange={(event) => {
                if (isReminderTime(event.target.value)) update({ reminderTime: event.target.value });
              }}
            />
          }
        />
      </List>

      {adsEnabled && (
        <>
          <h2 className="md-typescale-title-small settings__section">{t('settings.premium.title')}</h2>
          <List variant="segmented">
            <ListItem
              leading={<Icon name={premium ? 'verified' : 'workspace_premium'} />}
              headline={premium ? t('premium.active') : t('settings.premium.upgrade')}
              supporting={premium ? t('premium.thanks') : t('settings.premium.upgradeDescription')}
              trailing={<Icon name="chevron_right" />}
              onClick={onOpenPremium}
            />
            <ListItem
              leading={<Icon name="restore" />}
              headline={t('premium.restore')}
              supporting={t('settings.premium.restoreDescription')}
              disabled={premiumBusy}
              onClick={() => void restore()}
            />
            {privacyOptionsRequired && (
              <ListItem
                leading={<Icon name="privacy_tip" />}
                headline={t('settings.privacy.title')}
                supporting={t('settings.privacy.description')}
                onClick={() => void showPrivacyOptions()}
              />
            )}
          </List>
        </>
      )}

      <h2 className="md-typescale-title-small settings__section">{t('settings.about.title')}</h2>
      <List variant="segmented">
        <ListItem leading={<Icon name="info" />} headline={t('app.name')} supporting={version ? t('settings.about.version', { version }) : t('app.tagline')} />
      </List>
    </section>
  );
}
