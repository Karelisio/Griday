import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // Identifiant Play Store DÉFINITIF une fois publié.
  appId: 'io.github.karelisio.griday',
  appName: 'Griday',
  webDir: 'dist',
  android: {
    // Pas de contenu mixte ni de débogage WebView en production.
    allowMixedContent: false,
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
