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
    SystemBars: {
      // Edge-to-edge : variables CSS --safe-area-inset-* injectées dans le WebView.
      insetsHandling: 'css',
      initialViewportFitValueHint: 'cover',
    },
  },
};

export default config;
