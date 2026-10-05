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
    projects: [
      {
        extends: true,
        test: { name: 'engine', include: ['engine/**/*.test.ts', 'scripts/**/*.test.ts'], environment: 'node' },
      },
      {
        extends: true,
        test: { name: 'app', include: ['src/**/*.test.{ts,tsx}', 'locales/**/*.test.ts'], environment: 'jsdom' },
      },
    ],
  },
});
