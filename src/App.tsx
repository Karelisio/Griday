/** Coquille de l'app : thème Material You, navigation, retour Android, auto-vérification du moteur. */
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { engine } from './engine-client/client';
import { resolveLanguage, setLanguage } from './i18n';
import { applySystemBarsStyle, getAppVersion, onSystemPalettesChanged, pushBackHandler, setHapticsEnabled, type SystemPalettes } from './platform';
import { loadJSON, saveJSON } from './platform/storage';
import { SettingsScreen } from './screens/SettingsScreen';
import { TodayScreen } from './screens/TodayScreen';
import { UnlimitedScreen } from './screens/UnlimitedScreen';
import { SettingsProvider, useSettings } from './settings/SettingsContext';
import type { Settings } from './settings/types';
import { ThemeProvider } from './theme';
import { NavigationBar, SnackbarHost, useSnackbar } from './ui';
import './App.css';

type Tab = 'today' | 'unlimited' | 'settings';

export interface AppProps {
  readonly initialSettings: Settings;
  readonly systemLanguages: readonly string[];
  readonly initialPalettes: SystemPalettes | null;
}

export function App({ initialSettings, systemLanguages, initialPalettes }: AppProps) {
  return (
    <SettingsProvider initial={initialSettings}>
      <Themed systemLanguages={systemLanguages} initialPalettes={initialPalettes} />
    </SettingsProvider>
  );
}

function Themed({ systemLanguages, initialPalettes }: Omit<AppProps, 'initialSettings'>) {
  const { settings } = useSettings();
  const { t } = useTranslation();
  const [palettes, setPalettes] = useState(initialPalettes);

  useEffect(() => onSystemPalettesChanged(setPalettes), []);
  useEffect(() => setHapticsEnabled(settings.haptics), [settings.haptics]);
  useEffect(() => {
    void setLanguage(resolveLanguage(settings.language, systemLanguages));
  }, [settings.language, systemLanguages]);
  const onThemeApplied = useCallback((dark: boolean) => void applySystemBarsStyle(dark), []);

  return (
    <ThemeProvider mode={settings.theme} dynamic={settings.dynamicColor && palettes !== null} systemPalettes={palettes} onThemeApplied={onThemeApplied}>
      <SnackbarHost closeLabel={t('common.close')}>
        <Shell dynamicSupported={palettes !== null} />
      </SnackbarHost>
    </ThemeProvider>
  );
}

function Shell({ dynamicSupported }: { dynamicSupported: boolean }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('today');
  const snackbar = useSnackbar();

  // Retour Android : depuis un autre onglet, revient à « Aujourd'hui » ; sinon le système gère (retour prédictif).
  useEffect(() => (tab !== 'today' ? pushBackHandler(() => setTab('today')) : undefined), [tab]);

  // Auto-vérification du moteur dans ce WebView, une fois par version de l'app.
  useEffect(() => {
    const timer = setTimeout(() => {
      void (async () => {
        const version = await getAppVersion();
        const key = `selfcheck.${version}`;
        const done = await loadJSON<string[]>(key);
        const failures = done ?? (await engine.selfCheck());
        if (!done) await saveJSON(key, failures);
        if (failures.length > 0) snackbar.show({ message: t('errors.engineCheck'), duration: 10_000 });
      })();
    }, 1500);
    return () => clearTimeout(timer);
  }, [snackbar, t]);

  return (
    <div className="app">
      <main className="app__content">
        <TodayScreen visible={tab === 'today'} />
        <UnlimitedScreen visible={tab === 'unlimited'} />
        <SettingsScreen visible={tab === 'settings'} dynamicSupported={dynamicSupported} />
      </main>
      <NavigationBar
        aria-label={t('app.name')}
        value={tab}
        onChange={(id) => setTab(id as Tab)}
        destinations={[
          { id: 'today', label: t('nav.today'), icon: 'today' },
          { id: 'unlimited', label: t('nav.unlimited'), icon: 'all_inclusive' },
          { id: 'settings', label: t('nav.settings'), icon: 'settings' },
        ]}
      />
    </div>
  );
}
