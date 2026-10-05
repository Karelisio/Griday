/** Barres système (état et navigation) : couleur des icônes selon le thème effectif de l'app. */
import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';
import { attempt } from './internal';

/**
 * `dark` : thème sombre de l'app, donc icônes claires. Sinon icônes sombres.
 * Les barres sont transparentes (edge-to-edge) : seul le style des icônes change.
 * Sans `bar`, le plugin applique le style aux deux barres. Sans effet hors natif ; ne lève jamais.
 */
export async function applySystemBarsStyle(dark: boolean): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  await attempt(() => SystemBars.setStyle({ style: dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light }));
}
