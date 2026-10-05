/** Coquille de l'app : thème Material You, progression, navigation (onglets + pages), retour Android, auto-vérification du moteur. */
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { engine } from './engine-client/client';
import { resolveLanguage, setLanguage } from './i18n';
import { applySystemBarsStyle, getAppVersion, onSystemPalettesChanged, pushBackHandler, setHapticsEnabled, type SystemPalettes } from './platform';
import { dailyProgressKey, dailyPuzzleKey, pruneStorage, selfCheckKey, UNLIMITED_CURRENT_KEY } from './persistence';
import { loadJSON, removeKey, saveJSON } from './platform/storage';
import { ScreenBoundary } from './ScreenBoundary';
import { ArchiveGamePage } from './screens/ArchiveGamePage';
import { ArchiveScreen } from './screens/ArchiveScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { StatsScreen } from './screens/StatsScreen';
import { TodayScreen } from './screens/TodayScreen';
import { UnlimitedScreen } from './screens/UnlimitedScreen';
import { SettingsProvider, useSettings } from './settings/SettingsContext';
import type { Settings } from './settings/types';
import { ProgressProvider, useProgress } from './progress/ProgressContext';
import { useReminderSync } from './reminders';
import type { ProgressData } from './progress/store';
import { springs, ThemeProvider } from './theme';
import { IconButton, NavigationBar, SnackbarHost, useSnackbar } from './ui';
import { localISODate, type ISODate } from '../engine/core/date';
import { useToday } from './useToday';
import './App.css';

type Tab = 'today' | 'archive' | 'unlimited' | 'stats';
type Page = { readonly kind: 'settings' } | { readonly kind: 'archive'; readonly date: ISODate };

export interface AppProps {
  readonly initialSettings: Settings;
  readonly systemLanguages: readonly string[];
  readonly initialPalettes: SystemPalettes | null;
  /** Progression préchargée (sinon chargée au montage). */
  readonly initialProgress?: ProgressData;
}

export function App({ initialSettings, systemLanguages, initialPalettes, initialProgress }: AppProps) {
  return (
    <SettingsProvider initial={initialSettings}>
      <ProgressProvider initial={initialProgress}>
        <Themed systemLanguages={systemLanguages} initialPalettes={initialPalettes} />
      </ProgressProvider>
    </SettingsProvider>
  );
}

function Themed({ systemLanguages, initialPalettes }: Omit<AppProps, 'initialSettings' | 'initialProgress'>) {
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
  const today = useToday();
  const [tab, setTab] = useState<Tab>('today');
  const [page, setPage] = useState<Page | null>(null);
  const snackbar = useSnackbar();
  useReminderSync();

  // Page secondaire : le retour (geste, bouton, flèche) la referme et rend le focus à son déclencheur.
  const opener = useRef<HTMLElement | null>(null);
  const openPage = useCallback((next: Page) => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setPage(next);
  }, []);
  const closePage = useCallback(() => {
    setPage(null);
    requestAnimationFrame(() => opener.current?.isConnected && opener.current.focus());
  }, []);
  useEffect(() => (page ? pushBackHandler(closePage) : undefined), [page, closePage]);
  // Retour Android : depuis un autre onglet, revient à « Aujourd'hui » ; sinon le système gère (retour prédictif).
  useEffect(() => (!page && tab !== 'today' ? pushBackHandler(() => setTab('today')) : undefined), [tab, page]);

  const openDay = useCallback((date: ISODate) => (date === today ? setTab('today') : openPage({ kind: 'archive', date })), [today, openPage]);

  // Au démarrage (une seule fois, pas à chaque changement de langue) : auto-vérification du moteur
  // dans ce WebView (une fois par version de l'app), puis ménage du stockage.
  const tRef = useRef(t);
  tRef.current = t;
  const { history } = useProgress();
  const historyRef = useRef(history);
  historyRef.current = history;
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
          await pruneStorage(localISODate(new Date()), version, new Set(historyRef.current.keys()));
        } catch (error) {
          console.error('Vérifications de démarrage', error);
        }
      })();
    }, 1500);
    return () => clearTimeout(timer);
  }, [snackbar]);

  const shown = (id: Tab) => tab === id && page === null;

  return (
    <div className="app">
      <main className="app__content" inert={page !== null}>
        <div className="app__actions">
          <IconButton icon="settings" label={t('nav.settings')} onClick={() => openPage({ kind: 'settings' })} />
        </div>
        <ScreenBoundary visible={shown('today')} onReset={resetToday}>
          <TodayScreen visible={shown('today')} />
        </ScreenBoundary>
        <ScreenBoundary visible={shown('archive')}>
          <ArchiveScreen visible={shown('archive')} onOpen={openDay} />
        </ScreenBoundary>
        <ScreenBoundary visible={shown('unlimited')} onReset={resetUnlimited}>
          <UnlimitedScreen visible={shown('unlimited')} />
        </ScreenBoundary>
        <ScreenBoundary visible={shown('stats')}>
          <StatsScreen visible={shown('stats')} />
        </ScreenBoundary>
      </main>
      <div className="app__nav" inert={page !== null}>
        <NavigationBar
          aria-label={t('app.name')}
          value={tab}
          onChange={(id) => setTab(id as Tab)}
          destinations={[
            { id: 'today', label: t('nav.today'), icon: 'today' },
            { id: 'archive', label: t('nav.archive'), icon: 'calendar_month' },
            { id: 'unlimited', label: t('nav.unlimited'), icon: 'all_inclusive' },
            { id: 'stats', label: t('nav.stats'), icon: 'bar_chart' },
          ]}
        />
      </div>
      <AnimatePresence>
        {page && (
          <SecondaryPage key={page.kind === 'archive' ? `archive-${page.date}` : page.kind} onBack={closePage}>
            {page.kind === 'settings' ? (
              <ScreenBoundary visible>
                <SettingsScreen visible dynamicSupported={dynamicSupported} />
              </ScreenBoundary>
            ) : (
              <ScreenBoundary visible>
                <ArchiveGamePage date={page.date} visible />
              </ScreenBoundary>
            )}
          </SecondaryPage>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Page secondaire plein écran (axe partagé horizontal M3) avec flèche de retour. */
function SecondaryPage({ onBack, children }: { onBack: () => void; children: ReactNode }) {
  const { t } = useTranslation();
  const backRef = useRef<HTMLButtonElement>(null);
  useEffect(() => backRef.current?.focus(), []);
  return (
    <motion.div
      className="app-page"
      initial={{ opacity: 0, x: 48 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 48 }}
      transition={springs.spatial.default}
    >
      <div className="app-page__bar">
        <IconButton icon="arrow_back" label={t('common.back')} onClick={onBack} ref={backRef} />
      </div>
      <div className="app-page__content">{children}</div>
    </motion.div>
  );
}
