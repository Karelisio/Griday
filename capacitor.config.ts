import type { CapacitorConfig } from '@capacitor/cli';
import { existsSync, readFileSync } from 'node:fs';

/**
 * APK personnel sans publicité (`VITE_ADS=false npx cap sync`) : les plugins de monétisation ne sont
 * pas intégrés au projet Android (ni SDK publicitaire, ni facturation Google Play).
 */
const MONETIZATION_PLUGINS = ['@capacitor-community/admob', 'cordova-plugin-purchase'];

/**
 * VITE_ADS comme Vite le voit en production : environnement d'abord, puis `.env.production.local`,
 * `.env.local`, `.env.production`, `.env` (lus depuis la racine du projet, d'où se lancent les commandes `cap`).
 */
function viteAds(): string | undefined {
  if (process.env.VITE_ADS !== undefined) return process.env.VITE_ADS;
  for (const file of ['.env.production.local', '.env.local', '.env.production', '.env']) {
    if (!existsSync(file)) continue;
    const line = readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .find((l) => /^\s*VITE_ADS\s*=/.test(l));
    if (line) return line.slice(line.indexOf('=') + 1).trim().replace(/^(['"])(.*)\1$/, '$2');
  }
  return undefined;
}

const adsEnabled = viteAds() !== 'false';
const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
const dependencies = { ...pkg.devDependencies, ...pkg.dependencies };

const config: CapacitorConfig = {
  // Identifiant Play Store DÉFINITIF une fois publié.
  appId: 'io.github.karelisio.griday',
  appName: 'Griday',
  webDir: 'dist',
  android: {
    // Pas de contenu mixte ni de débogage WebView en production.
    allowMixedContent: false,
    ...(adsEnabled ? {} : { includePlugins: Object.keys(dependencies).filter((name) => !MONETIZATION_PLUGINS.includes(name)) }),
  },
  plugins: {
    App: {
      // Retour système rendu à Android tant qu'aucun écran secondaire n'est ouvert (animation prédictive
      // « retour à l'accueil ») ; src/platform/back.ts réactive le gestionnaire quand la pile n'est pas vide.
      disableBackButtonHandler: true,
    },
    SystemBars: {
      // Edge-to-edge : variables CSS --safe-area-inset-* injectées dans le WebView.
      insetsHandling: 'css',
      initialViewportFitValueHint: 'cover',
    },
    LocalNotifications: {
      // Rappel quotidien : petite icône monochrome (res/drawable/ic_stat_griday.xml) et couleur d'accent de la marque.
      smallIcon: 'ic_stat_griday',
      iconColor: '#5B4FC4',
    },
  },
};

export default config;
