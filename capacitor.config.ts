import type { CapacitorConfig } from '@capacitor/cli';
import { readFileSync } from 'node:fs';

/**
 * APK personnel sans publicité (`VITE_ADS=false npx cap sync`) : les plugins de monétisation ne sont
 * pas intégrés au projet Android (ni SDK publicitaire, ni facturation Google Play).
 */
const MONETIZATION_PLUGINS = ['@capacitor-community/admob', 'cordova-plugin-purchase'];
const adsEnabled = process.env.VITE_ADS !== 'false';
// (Lu depuis la racine du projet, d'où se lancent les commandes `cap`.)
const dependencies = (JSON.parse(readFileSync('package.json', 'utf8')) as { dependencies: Record<string, string> }).dependencies;

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
