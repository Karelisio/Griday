/** Coquille de l'app : thème Material You, progression, monétisation, navigation (onglets + pages), retour Android, auto-vérification du moteur. */
import { AnimatePresence, motion, useIsPresent } from 'motion/react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { engine } from './engine-client/client';
import { resolveLanguage, setLanguage } from './i18n';
import { MonetizationProvider, useMonetization } from './monetization/MonetizationContext';
import { applySystemBarsStyle, getAppVersion, onSystemPalettesChanged, pushBackHandler, setHapticsEnabled, type SystemPalettes } from './platform';
import { dailyProgressKey, dailyPuzzleKey, dailyStartedKey, pruneStorage, selfCheckKey, UNLIMITED_CURRENT_KEY } from './persistence';
import { loadJSON, removeKey, saveJSON } from './platform/storage';
import { ScreenBoundary } from './ScreenBoundary';
import { ArchiveGamePage } from './screens/ArchiveGamePage';
import { ArchiveScreen } from './screens/ArchiveScreen';
import { PremiumPage } from './screens/PremiumPage';
import { SettingsScreen } from './screens/SettingsScreen';
import { StatsScreen } from './screens/StatsScreen';
import { TodayScreen } from './screens/TodayScreen';
import { UnlimitedScreen } from './screens/UnlimitedScreen';
import { SettingsProvider, useSettings } from './settings/SettingsContext';
import type { Settings } from './settings/types';
import { ProgressProvider, useProgress } from './progress/ProgressContext';
import { useReminderOpened, useReminderRevoked, useReminderSync } from './reminders';
import type { ProgressData } from './progress/store';
import { springs, ThemeProvider } from './theme';
import { IconButton, NavigationBar, SnackbarHost, useSnackbar } from './ui';
import { localISODate, type ISODate } from '../engine/core/date';
import { useToday } from './useToday';
import './App.css';

type Tab = 'today' | 'archive' | 'unlimited' | 'stats';
type Page = { readonly kind: 'settings' } | { readonly kind: 'premium' } | { readonly kind: 'archive'; readonly date: ISODate };
const pageKey = (p: Page) => (p.kind === 'archive' ? `archive-${p.date}` : p.kind);
/** Préfixe des clés « premier coup » d'un puzzle du jour (voir persistence.ts). */
const STARTED_PREFIX = dailyStartedKey('');

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
        <MonetizationProvider>
          <Shell dynamicSupported={palettes !== null} />
        </MonetizationProvider>
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
  // Pages secondaires empilées (ex. partie d'archive → Premium) : le retour revient à la précédente.
  const [pages, setPages] = useState<readonly Page[]>([]);
  const page = pages.at(-1) ?? null;
  const snackbar = useSnackbar();
  useReminderSync();
  useReminderRevoked(() => snackbar.show({ message: t('reminder.revoked'), duration: 8000 }));

  // Page secondaire : le retour (geste, bouton, flèche) referme celle du dessus et rend le focus à son déclencheur.
  const openers = useRef<(HTMLElement | null)[]>([]);
  const pushPage = useCallback((next: Page) => {
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setPages((stack) => {
      const top = stack.at(-1);
      if (top && pageKey(top) === pageKey(next)) return stack;
      // (Idempotent : un double appel de l'updater donne le même résultat.)
      openers.current = [...openers.current.slice(0, stack.length), trigger];
      return [...stack, next];
    });
  }, []);
  const closePage = useCallback(() => {
    setPages((stack) => stack.slice(0, -1));
    const opener = openers.current.pop() ?? null;
    requestAnimationFrame(() => opener?.isConnected && opener.focus());
  }, []);
  const closeAllPages = useCallback(() => {
    setPages([]);
    openers.current = [];
  }, []);
  useEffect(() => (pages.length > 0 ? pushBackHandler(closePage) : undefined), [pages.length, closePage]);
  // Interstitiel dû (partie résolue) : montré à une transition voulue par le joueur — changement d'onglet,
  // réglages ou partie d'archive ouverts — jamais en ouvrant Premium.
  const { setPremiumOpener, showPendingInterstitial, unlockArchive } = useMonetization();
  const openPage = useCallback(
    (next: Page) => {
      pushPage(next);
      if (next.kind !== 'premium') void showPendingInterstitial();
    },
    [pushPage, showPendingInterstitial],
  );
  const changeTab = useCallback(
    (next: Tab) => {
      setTab(next);
      void showPendingInterstitial();
    },
    [showPendingInterstitial],
  );
  // Le dialogue des vidéos (monétisation) propose Premium : il ouvre cette page.
  useEffect(() => {
    setPremiumOpener(() => pushPage({ kind: 'premium' }));
    return () => setPremiumOpener(null);
  }, [setPremiumOpener, pushPage]);
  // Retour Android : depuis un autre onglet, revient à « Aujourd'hui » ; sinon le système gère (retour prédictif).
  useEffect(() => (!page && tab !== 'today' ? pushBackHandler(() => setTab('today')) : undefined), [tab, page]);

  // Grille d'« Aujourd'hui » : un jour d'archive identique (partie de la veille en cours) s'ouvre
  // dans l'onglet, jamais dans une seconde page (deux parties sur la même sauvegarde).
  const [playingDate, setPlayingDate] = useState(today);
  const goToday = useCallback(() => {
    setTab('today');
    requestAnimationFrame(() => document.getElementById('today-title')?.focus());
  }, []);
  // Toucher un rappel : retour au puzzle du jour, par-dessus toute page ouverte.
  useReminderOpened(() => {
    closeAllPages();
    goToday();
  });
  const openDay = useCallback(
    (date: ISODate) => (date === today || date === playingDate ? goToday() : openPage({ kind: 'archive', date })),
    [today, playingDate, goToday, openPage],
  );

  // Au démarrage (une seule fois, pas à chaque changement de langue) : auto-vérification du moteur
  // dans ce WebView (une fois par version de l'app), puis ménage du stockage.
  const tRef = useRef(t);
  tRef.current = t;
  const { history } = useProgress();
  const historyRef = useRef(history);
  historyRef.current = history;
  const unlockArchiveRef = useRef(unlockArchive);
  unlockArchiveRef.current = unlockArchive;
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
          const removed = await pruneStorage(localISODate(new Date()), version, new Set(historyRef.current.keys()));
          // Partie entamée mais trop ancienne pour être gardée : le jour reste ouvert (jamais reverrouillé).
          for (const key of removed) {
            const date = key.startsWith(STARTED_PREFIX) ? key.slice(STARTED_PREFIX.length) : null;
            if (date && !historyRef.current.has(date)) unlockArchiveRef.current(date);
          }
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
          <TodayScreen visible={shown('today')} playingDate={playingDate} onPlayingDateChange={setPlayingDate} />
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
          onChange={(id) => changeTab(id as Tab)}
          destinations={[
            { id: 'today', label: t('nav.today'), icon: 'today' },
            { id: 'archive', label: t('nav.archive'), icon: 'calendar_month' },
            { id: 'unlimited', label: t('nav.unlimited'), icon: 'all_inclusive' },
            { id: 'stats', label: t('nav.stats'), icon: 'bar_chart' },
          ]}
        />
      </div>
      <AnimatePresence>
        {pages.map((p, i) => {
          // Seule la page du dessus est active ; celles du dessous restent montées (partie en pause).
          const active = i === pages.length - 1;
          return (
            <SecondaryPage key={pageKey(p)} onBack={closePage} active={active}>
              <ScreenBoundary visible={active}>
                {p.kind === 'settings' ? (
                  <SettingsScreen visible={active} dynamicSupported={dynamicSupported} onOpenPremium={() => pushPage({ kind: 'premium' })} />
                ) : p.kind === 'premium' ? (
                  <PremiumPage visible={active} />
                ) : (
                  <ArchiveGamePage date={p.date} visible={active} />
                )}
              </ScreenBoundary>
            </SecondaryPage>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

/** Page secondaire plein écran (axe partagé horizontal M3) avec flèche de retour. */
function SecondaryPage({ onBack, active, children }: { onBack: () => void; active: boolean; children: ReactNode }) {
  const { t } = useTranslation();
  const backRef = useRef<HTMLButtonElement>(null);
  const present = useIsPresent();
  useEffect(() => backRef.current?.focus(), []);
  return (
    <motion.div
      // Pendant l'animation de sortie, la page ne capte plus les touchers ; une page recouverte non plus.
      style={{ pointerEvents: present && active ? 'auto' : 'none' }}
      inert={!active}
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
