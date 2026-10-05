/**
 * Galerie de composants (développement uniquement) : servie par Vite à /gallery.html.
 * Paramètres d'URL utiles aux captures : ?theme=light|dark  ?seed=brand|blue|green|orange|dynamic
 * ?only=buttons,fab (sections à afficher)  ?open=dialog|sheet|snackbar (superposition ouverte au chargement).
 */
import { StrictMode, useEffect, useMemo, useState, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { GRIDAY_SEED, ThemeProvider } from '../../theme';
import { fakeSystemPalettes } from '../../theme/fakePalettes';
import { Chip, SegmentedButton, SnackbarHost, useSnackbar } from '..';
import {
  AppBarSection,
  ButtonSection,
  CardSection,
  ChipSection,
  ColorSection,
  FabSection,
  IconButtonSection,
  ListSection,
  NavSection,
  OverlaySection,
  ProgressSection,
  RegionSection,
  SegmentedSection,
  ShapeSection,
  SwitchSection,
  TypeSection,
} from './sections';
import './gallery.css';

const SEEDS = {
  brand: { label: 'Brand violet', seed: GRIDAY_SEED },
  blue: { label: 'Blue', seed: 0xff0061a4 },
  green: { label: 'Green', seed: 0xff386a20 },
  orange: { label: 'Orange', seed: 0xffa94a00 },
  dynamic: { label: 'Wallpaper (fake)', seed: GRIDAY_SEED },
} as const;
type SeedKey = keyof typeof SEEDS;
type Mode = 'light' | 'dark';

const params = new URLSearchParams(window.location.search);
const initialSeed = (params.get('seed') ?? 'brand') as SeedKey;
const initialMode: Mode = params.get('theme') === 'dark' ? 'dark' : 'light';
const only = params.get('only')?.split(',').filter(Boolean) ?? null;
const initialOpen = params.get('open');

const SECTIONS: readonly (readonly [string, (open: string | null) => ReactElement])[] = [
  ['colors', () => <ColorSection />],
  ['type', () => <TypeSection />],
  ['shape', () => <ShapeSection />],
  ['buttons', () => <ButtonSection />],
  ['icon-buttons', () => <IconButtonSection />],
  ['fab', () => <FabSection />],
  ['cards', () => <CardSection />],
  ['chips', () => <ChipSection />],
  ['segmented', () => <SegmentedSection />],
  ['switch', () => <SwitchSection />],
  ['lists', () => <ListSection />],
  ['nav', () => <NavSection />],
  ['appbar', () => <AppBarSection />],
  ['progress', () => <ProgressSection />],
  ['overlays', (open) => <OverlaySection initial={open} />],
  ['regions', () => <RegionSection />],
];

function AutoSnackbar({ enabled }: { enabled: boolean }) {
  const snackbar = useSnackbar();
  useEffect(() => {
    if (enabled) snackbar.show({ message: 'Grid solved in 03:12', actionLabel: 'Share', duration: Infinity });
  }, [enabled, snackbar]);
  return null;
}

function Gallery() {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [seedKey, setSeedKey] = useState<SeedKey>(SEEDS[initialSeed] ? initialSeed : 'brand');
  const palettes = useMemo(() => (seedKey === 'dynamic' ? fakeSystemPalettes(345) : null), [seedKey]);

  return (
    <ThemeProvider mode={mode} dynamic={seedKey === 'dynamic'} systemPalettes={palettes} seed={SEEDS[seedKey].seed}>
      <SnackbarHost closeLabel="Close">
        <AutoSnackbar enabled={initialOpen === 'snackbar'} />
        <div className="g-page">
          <header className="g-header">
            <h1 className="md-typescale-headline-medium">Griday design system</h1>
            <p className="md-typescale-body-medium">Material 3 Expressive · components</p>
          </header>
          <div className="g-controls">
            <SegmentedButton
              aria-label="Theme mode"
              value={mode}
              onChange={setMode}
              options={[
                { value: 'light', label: 'Light', icon: 'light_mode' },
                { value: 'dark', label: 'Dark', icon: 'dark_mode' },
              ]}
            />
            <div className="g-chips" role="group" aria-label="Color source">
              {(Object.keys(SEEDS) as SeedKey[]).map((key) => (
                <Chip key={key} variant="filter" selected={seedKey === key} onClick={() => setSeedKey(key)}>
                  {SEEDS[key].label}
                </Chip>
              ))}
            </div>
          </div>
          {SECTIONS.filter(([id]) => !only || only.includes(id)).map(([id, render]) => (
            <div key={id}>{render(initialOpen)}</div>
          ))}
        </div>
      </SnackbarHost>
    </ThemeProvider>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <Gallery />
  </StrictMode>,
);
