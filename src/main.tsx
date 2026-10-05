/** Amorçage : réglages, langue (système ou choix), palettes Material You, puis rendu. */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { initI18n, resolveLanguage } from './i18n';
import { getSystemLanguages, getSystemPalettes, initBackHandling, setHapticsEnabled } from './platform';
import { loadSettings } from './settings/SettingsContext';
import './theme/tokens.css';
import './theme/regions.css';

async function bootstrap(): Promise<void> {
  const [settings, systemLanguages, palettes] = await Promise.all([
    loadSettings(),
    getSystemLanguages().catch(() => [] as string[]),
    getSystemPalettes().catch(() => null),
  ]);
  await initI18n(resolveLanguage(settings.language, systemLanguages));
  setHapticsEnabled(settings.haptics);
  void initBackHandling();
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App initialSettings={settings} systemLanguages={systemLanguages} initialPalettes={palettes} />
    </StrictMode>,
  );
}

void bootstrap();
