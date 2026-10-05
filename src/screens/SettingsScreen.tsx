/** Réglages : langue, thème, couleurs dynamiques, vibrations, croix automatiques, version. */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { LanguagePreference } from '../i18n';
import { getAppVersion } from '../platform';
import { useSettings } from '../settings/SettingsContext';
import type { ThemeMode } from '../settings/types';
import { Icon, List, ListItem, SegmentedButton, Switch } from '../ui';
import './screens.css';

export function SettingsScreen({ visible, dynamicSupported }: { visible: boolean; dynamicSupported: boolean }) {
  const { t } = useTranslation();
  const { settings, update } = useSettings();
  const [version, setVersion] = useState('');
  useEffect(() => {
    void getAppVersion().then(setVersion);
  }, []);

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
          leading={<Icon name="close" />}
          headline={t('settings.autoCross.title')}
          supporting={t('settings.autoCross.description')}
          control
          trailing={<Switch checked={settings.autoCross} onChange={(autoCross) => update({ autoCross })} aria-label={t('settings.autoCross.title')} />}
        />
      </List>

      <h2 className="md-typescale-title-small settings__section">{t('settings.about.title')}</h2>
      <List variant="segmented">
        <ListItem leading={<Icon name="info" />} headline={t('app.name')} supporting={version ? t('settings.about.version', { version }) : t('app.tagline')} />
      </List>
    </section>
  );
}
