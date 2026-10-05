/** Coquille de l'app : thème Material You, navigation, retour Android, auto-vérification du moteur. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { engine } from './engine-client/client';
import { resolveLanguage, setLanguage } from './i18n';
import { applySystemBarsStyle, getAppVersion, onSystemPalettesChanged, pushBackHandler, setHapticsEnabled, type SystemPalettes } from './platform';
import { dailyProgressKey, dailyPuzzleKey, pruneStorage, selfCheckKey, UNLIMITED_CURRENT_KEY } from './persistence';
import { loadJSON, removeKey, saveJSON } from './platform/storage';
import { ScreenBoundary } from './ScreenBoundary';
import { SettingsScreen } from './screens/SettingsScreen';
import { TodayScreen } from './screens/TodayScreen';
import { UnlimitedScreen } from './screens/UnlimitedScreen';
import { SettingsProvider, useSettings } from './settings/SettingsContext';
import type { Settings } from './settings/types';
import { ThemeProvider } from './theme';
import { NavigationBar, SnackbarHost, useSnackbar } from './ui';
import { localISODate } from '../engine/core/date';
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

/** Réinitialisation après une erreur d'écran : grille du jour (cache et partie) ou partie illimitée. */
async function resetToday(): Promise<void> {
  const today = localISODate(new Date());
  await Promise.all([removeKey(dailyPuzzleKey(today)), removeKey(dailyProgressKey(today))]);
}

async function resetUnlimited(): Promise<void> {
  await removeKey(UNLIMITED_CURRENT_KEY);
}

function Shell({ dynamicSupported }: { dynamicSupported: boolean }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('today');
  const snackbar = useSnackbar();

  // Retour Android : depuis un autre onglet, revient à « Aujourd'hui » ; sinon le système gère (retour prédictif).
  useEffect(() => (tab !== 'today' ? pushBackHandler(() => setTab('today')) : undefined), [tab]);

  // Au démarrage (une seule fois, pas à chaque changement de langue) : auto-vérification du moteur
  // dans ce WebView (une fois par version de l'app), puis ménage du stockage.
  const tRef = useRef(t);
  tRef.current = t;
  useEffect(() => {
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const version = await getAppVersion();
          const key = selfCheckKey(version);
          const done = await loadJSON<unknown>(key);
          const known = Array.isArray(done) && done.every((x) => typeof x === 'string') ? (done as string[]) : null;
          const failures = known ?? (await engine.selfCheck());
          if (!known) await saveJSON(key, failures);
          if (failures.length > 0) snackbar.show({ message: tRef.current('errors.engineCheck'), duration: 10_000 });
          await pruneStorage(localISODate(new Date()), version);
        } catch (error) {
          console.error('Vérifications de démarrage', error);
        }
      })();
    }, 1500);
    return () => clearTimeout(timer);
  }, [snackbar]);

  return (
    <div className="app">
      <main className="app__content">
        <ScreenBoundary visible={tab === 'today'} onReset={resetToday}>
          <TodayScreen visible={tab === 'today'} />
        </ScreenBoundary>
        <ScreenBoundary visible={tab === 'unlimited'} onReset={resetUnlimited}>
          <UnlimitedScreen visible={tab === 'unlimited'} />
        </ScreenBoundary>
        <ScreenBoundary visible={tab === 'settings'}>
          <SettingsScreen visible={tab === 'settings'} dynamicSupported={dynamicSupported} />
        </ScreenBoundary>
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
