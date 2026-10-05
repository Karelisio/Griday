import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  // Chemins relatifs : l'app est servie depuis le système de fichiers du WebView Capacitor.
  base: './',
  build: {
    outDir: 'dist',
    // WebView Android récents (mis à jour par le Play Store) ; ES2020 reste prudent.
    target: 'es2020',
    sourcemap: false,
  },
  worker: { format: 'es' },
  test: {
    testTimeout: 30_000,
    // @material/material-color-utilities importe sans extension (« ./dynamic_color ») : Node ESM natif échoue,
    // Vite sait le résoudre, donc on le fait transformer par Vitest plutôt qu'externaliser.
    server: { deps: { inline: ['@material/material-color-utilities'] } },
    projects: [
      {
        extends: true,
        test: { name: 'engine', include: ['engine/**/*.test.ts', 'scripts/**/*.test.ts', 'store/**/*.test.ts'], environment: 'node' },
      },
      {
        extends: true,
        test: { name: 'app', include: ['src/**/*.test.{ts,tsx}', 'locales/**/*.test.ts'], environment: 'jsdom' },
      },
    ],
  },
});
