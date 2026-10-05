import { useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useTheme } from '../../theme';
import { COLOR_ROLES, colorRoleToCssVar, type ColorRole } from '../../theme/scheme';
import { regionStyle } from '../../theme/regions';
import {
  BottomSheet,
  Button,
  Card,
  Chip,
  CircularProgress,
  Dialog,
  Divider,
  ExtendedFab,
  Fab,
  Icon,
  IconButton,
  LinearProgress,
  List,
  ListItem,
  NavigationBar,
  SegmentedButton,
  Switch,
  TopAppBar,
  useSnackbar,
  type NavigationDestination,
} from '..';
import { demoBoard } from './board';

export function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="g-section" data-section={id}>
      <h2 className="md-typescale-title-large">{title}</h2>
      {children}
    </section>
  );
}

const Row = ({ children }: { children: ReactNode }) => <div className="g-row">{children}</div>;

// --- Couleurs ---------------------------------------------------------------------------------

const SWATCHES: readonly (readonly [ColorRole, ColorRole])[] = [
  ['primary', 'onPrimary'],
  ['primaryContainer', 'onPrimaryContainer'],
  ['secondary', 'onSecondary'],
  ['secondaryContainer', 'onSecondaryContainer'],
  ['tertiary', 'onTertiary'],
  ['tertiaryContainer', 'onTertiaryContainer'],
  ['error', 'onError'],
  ['errorContainer', 'onErrorContainer'],
  ['surface', 'onSurface'],
  ['surfaceContainerLow', 'onSurface'],
  ['surfaceContainer', 'onSurface'],
  ['surfaceContainerHigh', 'onSurface'],
  ['surfaceContainerHighest', 'onSurface'],
  ['inverseSurface', 'inverseOnSurface'],
];

export function ColorSection() {
  const { scheme } = useTheme();
  return (
    <Section id="colors" title="Color roles">
      <div className="g-swatches">
        {SWATCHES.map(([bg, fg]) => (
          <div key={bg} className="g-swatch md-typescale-label-medium" style={{ background: `var(${colorRoleToCssVar(bg)})`, color: `var(${colorRoleToCssVar(fg)})` }}>
            <span>{bg}</span>
            <small>{scheme[bg]}</small>
          </div>
        ))}
      </div>
      <p className="g-note md-typescale-body-small" style={{ marginTop: 8 }}>
        {COLOR_ROLES.length} roles written as --md-sys-color-*
      </p>
    </Section>
  );
}

// --- Typographie ------------------------------------------------------------------------------

const TYPE_STYLES = [
  'display-large',
  'display-medium',
  'display-small',
  'headline-large',
  'headline-medium',
  'headline-small',
  'title-large',
  'title-medium',
  'title-small',
  'body-large',
  'body-medium',
  'body-small',
  'label-large',
  'label-medium',
  'label-small',
];

export function TypeSection() {
  return (
    <Section id="type" title="Type scale">
      <div className="g-stack" style={{ gap: 4 }}>
        {TYPE_STYLES.map((name) => (
          <div key={name} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, color: 'var(--md-sys-color-on-surface)' }}>
            <span className={`md-typescale-${name}`}>{name.split('-')[0]}</span>
            <span className={`md-typescale-${name}-emphasized`} style={{ color: 'var(--md-sys-color-on-surface-variant)' }}>
              {name.split('-')[1]} +
            </span>
          </div>
        ))}
      </div>
    </Section>
  );
}

// --- Formes et élévation ---------------------------------------------------------------------

const SHAPES = ['none', 'extra-small', 'small', 'medium', 'large', 'large-increased', 'extra-large', 'extra-large-increased', 'extra-extra-large', 'full'];

export function ShapeSection() {
  return (
    <Section id="shape" title="Shape & elevation">
      <div className="g-shapes">
        {SHAPES.map((name) => (
          <div key={name} className="g-shape md-typescale-label-small" style={{ borderRadius: `var(--md-sys-shape-corner-${name})` }}>
            {name}
          </div>
        ))}
      </div>
      <div className="g-elevations">
        {[0, 1, 2, 3, 4, 5].map((level) => (
          <div key={level} className="g-elevation md-typescale-label-medium" style={{ boxShadow: `var(--md-sys-elevation-level${level})`, color: 'var(--md-sys-color-on-surface)' }}>
            level {level}
          </div>
        ))}
      </div>
    </Section>
  );
}

// --- Boutons -----------------------------------------------------------------------------------

export function ButtonSection() {
  const [on, setOn] = useState(false);
  return (
    <Section id="buttons" title="Buttons">
      <Row>
        <Button variant="filled">Filled</Button>
        <Button variant="tonal">Tonal</Button>
        <Button variant="outlined">Outlined</Button>
        <Button variant="text">Text</Button>
        <Button variant="elevated">Elevated</Button>
      </Row>
      <Row>
        <Button icon="lightbulb">Hint</Button>
        <Button variant="tonal" icon="play_arrow" iconFilled>Resume</Button>
        <Button variant="outlined" trailingIcon="chevron_right">Next</Button>
        <Button disabled>Disabled</Button>
        <Button variant="outlined" disabled>Disabled</Button>
      </Row>
      <Row>
        <Button size="xs">XS</Button>
        <Button size="s">Small</Button>
        <Button size="m" icon="add">Medium</Button>
      </Row>
      <Row>
        <Button size="l" icon="play_arrow" iconFilled>Large</Button>
      </Row>
      <Row>
        <Button size="xl" variant="tonal">XL</Button>
      </Row>
      <Row>
        <Button shape="square">Square</Button>
        <Button shape="square" variant="tonal" size="m">Square M</Button>
        <Button variant="tonal" selected={on} onClick={() => setOn((v) => !v)} icon={on ? 'check' : undefined}>
          Toggle {on ? 'on' : 'off'}
        </Button>
      </Row>
      <Button fullWidth size="m" icon="calendar_month">Full width</Button>
    </Section>
  );
}

export function IconButtonSection() {
  const [fav, setFav] = useState(true);
  const [mute, setMute] = useState(false);
  return (
    <Section id="icon-buttons" title="Icon buttons">
      <Row>
        <IconButton icon="settings" label="Settings" />
        <IconButton icon="undo" label="Undo" variant="filled" />
        <IconButton icon="redo" label="Redo" variant="tonal" />
        <IconButton icon="share" label="Share" variant="outlined" />
        <IconButton icon="lightbulb" label="Hint" variant="filled" disabled />
      </Row>
      <Row>
        <IconButton icon="favorite" label="Favorite" selected={fav} onClick={() => setFav((v) => !v)} />
        <IconButton icon="favorite" label="Favorite" variant="filled" selected={fav} onClick={() => setFav((v) => !v)} />
        <IconButton icon="vibration" label="Vibration" variant="tonal" selected={!mute} onClick={() => setMute((v) => !v)} />
        <IconButton icon="star" label="Star" variant="outlined" selected={fav} onClick={() => setFav((v) => !v)} />
      </Row>
      <Row>
        <IconButton icon="pause" iconFilled label="Pause" variant="filled" size="xs" />
        <IconButton icon="pause" iconFilled label="Pause" variant="filled" size="s" />
        <IconButton icon="pause" iconFilled label="Pause" variant="filled" size="m" />
        <IconButton icon="pause" iconFilled label="Pause" variant="tonal" size="l" shape="square" />
      </Row>
    </Section>
  );
}

export function FabSection() {
  const [collapsed, setCollapsed] = useState(false);
  const [shown, setShown] = useState(true);
  return (
    <Section id="fab" title="FAB">
      <Row>
        <Fab icon="add" label="Add" size="sm" />
        <Fab icon="play_arrow" iconFilled label="Play" />
        <Fab icon="lightbulb" label="Hint" size="lg" color="tertiary" />
        <Fab icon="edit" label="Edit" color="secondary" />
        <Fab icon="add" label="Add" color="surface" visible={shown} />
      </Row>
      <Row>
        <ExtendedFab icon="play_arrow" iconFilled collapsed={collapsed}>
          Play today
        </ExtendedFab>
        <Button variant="text" onClick={() => setCollapsed((v) => !v)}>
          {collapsed ? 'Expand' : 'Collapse'}
        </Button>
        <Button variant="text" onClick={() => setShown((v) => !v)}>
          {shown ? 'Hide' : 'Show'} FAB
        </Button>
      </Row>
    </Section>
  );
}

// --- Cartes, puces, segments, interrupteurs ----------------------------------------------------

export function CardSection() {
  const [picked, setPicked] = useState(false);
  return (
    <Section id="cards" title="Cards">
      <div className="g-stack">
        <Card variant="filled">
          <div className="md-typescale-title-medium">Filled card</div>
          <div className="md-typescale-body-medium" style={{ color: 'var(--md-sys-color-on-surface-variant)' }}>
            Tonal surface container, very rounded.
          </div>
        </Card>
        <Card variant="elevated">
          <div className="md-typescale-title-medium">Elevated card</div>
          <div className="md-typescale-body-medium" style={{ color: 'var(--md-sys-color-on-surface-variant)' }}>
            Shadow level 1.
          </div>
        </Card>
        <Card variant="outlined">
          <div className="md-typescale-title-medium">Outlined card</div>
          <div className="md-typescale-body-medium" style={{ color: 'var(--md-sys-color-on-surface-variant)' }}>
            1 px outline variant.
          </div>
        </Card>
        <Card variant="filled" onClick={() => setPicked((v) => !v)} selected={picked}>
          <div className="md-typescale-title-medium">Interactive card</div>
          <div className="md-typescale-body-medium" style={{ color: 'var(--md-sys-color-on-surface-variant)' }}>
            Press me: corners tighten (spring). {picked ? 'Selected.' : ''}
          </div>
        </Card>
      </div>
    </Section>
  );
}

export function ChipSection() {
  const [filters, setFilters] = useState<Record<string, boolean>>({ easy: true, medium: false, hard: false });
  return (
    <Section id="chips" title="Chips">
      <Row>
        <Chip icon="lightbulb">Hint</Chip>
        <Chip icon="share" elevated>
          Share
        </Chip>
        <Chip disabled>Disabled</Chip>
      </Row>
      <Row>
        {Object.keys(filters).map((key) => (
          <Chip key={key} variant="filter" selected={filters[key]} onClick={() => setFilters((f) => ({ ...f, [key]: !f[key] }))}>
            {key}
          </Chip>
        ))}
        <Chip variant="filter" selected icon="timer">
          With icon
        </Chip>
      </Row>
    </Section>
  );
}

export function SegmentedSection() {
  const [themeChoice, setThemeChoice] = useState<'system' | 'light' | 'dark'>('system');
  const [lang, setLang] = useState('fr');
  const [size, setSize] = useState('8');
  return (
    <Section id="segmented" title="Segmented buttons">
      <div className="g-stack">
        <SegmentedButton
          aria-label="Theme"
          value={themeChoice}
          onChange={setThemeChoice}
          options={[
            { value: 'system', label: 'System', icon: 'brightness_auto' },
            { value: 'light', label: 'Light', icon: 'light_mode' },
            { value: 'dark', label: 'Dark', icon: 'dark_mode' },
          ]}
        />
        <SegmentedButton
          aria-label="Language"
          value={lang}
          onChange={setLang}
          options={[
            { value: 'system', label: 'Auto' },
            { value: 'fr', label: 'Français' },
            { value: 'en', label: 'English' },
          ]}
        />
        <SegmentedButton
          aria-label="Size"
          value={size}
          onChange={setSize}
          showCheck={false}
          options={['6', '7', '8', '9', '10'].map((n) => ({ value: n, label: n }))}
        />
        <SegmentedButton
          aria-label="Icons only"
          value={themeChoice}
          onChange={setThemeChoice}
          options={[
            { value: 'system', ariaLabel: 'System', icon: 'brightness_auto' },
            { value: 'light', ariaLabel: 'Light', icon: 'light_mode' },
            { value: 'dark', ariaLabel: 'Dark', icon: 'dark_mode' },
          ]}
        />
      </div>
    </Section>
  );
}

export function SwitchSection() {
  const [a, setA] = useState(true);
  const [b, setB] = useState(false);
  const [c, setC] = useState(true);
  return (
    <Section id="switch" title="Switch">
      <Row>
        <Switch checked={a} onChange={setA} aria-label="Switch on" />
        <Switch checked={b} onChange={setB} aria-label="Switch off" />
        <Switch checked={c} onChange={setC} showIcons={false} aria-label="Switch without icon" />
        <Switch checked={!c} onChange={(v) => setC(!v)} showIcons={false} aria-label="Switch without icon, off" />
        <Switch checked onChange={() => {}} disabled aria-label="Disabled on" />
        <Switch checked={false} onChange={() => {}} disabled aria-label="Disabled off" />
      </Row>
    </Section>
  );
}

// --- Listes -----------------------------------------------------------------------------------

export function ListSection() {
  const [haptics, setHaptics] = useState(true);
  const [auto, setAuto] = useState(false);
  const [dynamic, setDynamic] = useState(true);
  return (
    <Section id="lists" title="Lists">
      <p className="g-note md-typescale-label-large">Segmented (Android 16 settings look)</p>
      <List variant="segmented" aria-label="Settings">
        <ListItem leading={<Icon name="palette" />} headline="Dynamic color" supporting="Use your wallpaper colors" control trailing={<Switch checked={dynamic} onChange={setDynamic} />} />
        <ListItem leading={<Icon name="vibration" />} headline="Vibration" supporting="Haptic feedback while playing" control trailing={<Switch checked={haptics} onChange={setHaptics} />} />
        <ListItem leading={<Icon name="grid_view" />} headline="Automatic crosses" control trailing={<Switch checked={auto} onChange={setAuto} />} />
        <ListItem leading={<Icon name="translate" />} headline="Language" supporting="Français" onClick={() => {}} trailing={<Icon name="chevron_right" />} />
        <ListItem leading={<Icon name="info" />} headline="About" supporting="Version 0.1.0" onClick={() => {}} trailing={<Icon name="chevron_right" />} />
      </List>
      <p className="g-note md-typescale-label-large" style={{ marginTop: 20 }}>Plain</p>
      <List aria-label="History">
        <ListItem overline="Today" headline="Queens 8 × 8" supporting="Solved in 03:12" leading={<Icon name="emoji_events" />} onClick={() => {}} />
        <Divider variant="inset" />
        <ListItem headline="Yesterday" supporting="Solved in 05:40, 2 hints" leading={<Icon name="check_circle" />} onClick={() => {}} />
        <Divider variant="inset" />
        <ListItem headline="Two days ago" supporting="Not played" leading={<Icon name="calendar_month" />} disabled />
        <Divider variant="inset" />
        <ListItem headline="Selected row" supporting="Tonal container" leading={<Icon name="star" filled />} selected onClick={() => {}} />
      </List>
    </Section>
  );
}

// --- Navigation --------------------------------------------------------------------------------

const DESTINATIONS: readonly NavigationDestination[] = [
  { id: 'today', label: 'Today', icon: 'today' },
  { id: 'unlimited', label: 'Unlimited', icon: 'all_inclusive' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];

export function NavSection() {
  const [value, setValue] = useState('today');
  const [four, setFour] = useState('stats');
  return (
    <Section id="nav" title="Navigation bar">
      <div className="g-phone" style={{ marginBottom: 12 }}>
        <div style={{ height: 120, display: 'grid', placeItems: 'center', color: 'var(--md-sys-color-on-surface-variant)' }} className="md-typescale-body-medium">
          Screen: {value}
        </div>
        <NavigationBar aria-label="Main navigation" destinations={DESTINATIONS} value={value} onChange={setValue} />
      </div>
      <div className="g-phone">
        <NavigationBar
          aria-label="Four destinations"
          value={four}
          onChange={setFour}
          destinations={[
            { id: 'today', label: 'Today', icon: 'today' },
            { id: 'calendar', label: 'Calendar', icon: 'calendar_month' },
            { id: 'stats', label: 'Stats', icon: 'bar_chart' },
            { id: 'settings', label: 'Settings', icon: 'settings' },
          ]}
        />
      </div>
    </Section>
  );
}

function ScrollDemo({ children }: { children: ReactNode }) {
  return <div className="g-phone g-scroll">{children}</div>;
}

const FILLER = Array.from({ length: 14 }, (_, i) => (
  <p key={i} className="md-typescale-body-medium">
    Scroll this area: line {i + 1}. The app bar tints on scroll{i % 3 === 0 ? ' and large titles collapse into the bar' : ''}.
  </p>
));

export function AppBarSection() {
  return (
    <Section id="appbar" title="Top app bars">
      <div className="g-stack" style={{ gap: 16 }}>
        <ScrollDemo>
          <TopAppBar
            title="Settings"
            leading={<IconButton icon="arrow_back" label="Back" />}
            trailing={
              <>
                <IconButton icon="share" label="Share" />
                <IconButton icon="more_vert" label="More" />
              </>
            }
          />
          {FILLER}
        </ScrollDemo>
        <ScrollDemo>
          <TopAppBar title="Centered title" variant="centered" leading={<IconButton icon="menu" label="Menu" />} trailing={<IconButton icon="search" label="Search" />} />
          {FILLER}
        </ScrollDemo>
        <ScrollDemo>
          <TopAppBar title="Medium app bar" variant="medium" leading={<IconButton icon="arrow_back" label="Back" />} trailing={<IconButton icon="more_vert" label="More" />} />
          {FILLER}
        </ScrollDemo>
        <ScrollDemo>
          <TopAppBar title="Large app bar title" variant="large" leading={<IconButton icon="arrow_back" label="Back" />} trailing={<IconButton icon="more_vert" label="More" />} />
          {FILLER}
        </ScrollDemo>
      </div>
    </Section>
  );
}

// --- Progression -------------------------------------------------------------------------------

export function ProgressSection() {
  const [value, setValue] = useState(0.6);
  return (
    <Section id="progress" title="Progress">
      <div className="g-progress">
        <LinearProgress value={value} aria-label="Wavy 60 %" />
        <LinearProgress value={0.25} aria-label="Wavy 25 %" />
        <LinearProgress aria-label="Wavy indeterminate" />
        <LinearProgress value={1} aria-label="Wavy done" />
        <LinearProgress value={0.4} variant="flat" aria-label="Flat 40 %" />
        <LinearProgress variant="flat" aria-label="Flat indeterminate" />
        <div className="g-progress-row">
          <CircularProgress value={value} aria-label="Circular wavy" />
          <CircularProgress value={0.3} aria-label="Circular 30 %" />
          <CircularProgress aria-label="Circular indeterminate" />
          <CircularProgress variant="flat" value={0.7} aria-label="Circular flat" />
          <CircularProgress variant="flat" aria-label="Circular flat indeterminate" size={32} />
        </div>
        <Row>
          <Button variant="tonal" size="xs" onClick={() => setValue((v) => (v + 0.15 > 1 ? 0 : v + 0.15))}>
            Advance ({Math.round(value * 100)} %)
          </Button>
        </Row>
      </div>
    </Section>
  );
}

// --- Superpositions ----------------------------------------------------------------------------

export function OverlaySection({ initial }: { initial: string | null }) {
  const [dialog, setDialog] = useState(initial === 'dialog');
  const [sheet, setSheet] = useState(initial === 'sheet');
  const snackbar = useSnackbar();
  const countRef = useRef(0);
  return (
    <Section id="overlays" title="Dialog, sheet, snackbar">
      <Row>
        <Button variant="tonal" onClick={() => setDialog(true)} data-testid="open-dialog">
          Dialog
        </Button>
        <Button variant="tonal" onClick={() => setSheet(true)} data-testid="open-sheet">
          Bottom sheet
        </Button>
        <Button
          variant="tonal"
          data-testid="open-snackbar"
          onClick={() => snackbar.show({ message: `Grid solved in 03:12 (${++countRef.current})`, actionLabel: 'Share', onAction: () => {} })}
        >
          Snackbar
        </Button>
      </Row>
      <Dialog
        open={dialog}
        onClose={() => setDialog(false)}
        icon="restart_alt"
        title="Restart the grid?"
        actions={
          <>
            <Button variant="text" onClick={() => setDialog(false)}>
              Cancel
            </Button>
            <Button variant="text" onClick={() => setDialog(false)}>
              Restart
            </Button>
          </>
        }
      >
        This clears the whole grid and resets the timer to zero.
      </Dialog>
      <BottomSheet open={sheet} onClose={() => setSheet(false)} aria-label="Hint" dismissLabel="Close">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="md-typescale-headline-small">Hint</div>
          <div className="md-typescale-body-large" style={{ color: 'var(--md-sys-color-on-surface-variant)' }}>
            The highlighted region has only one possible cell left: its queen must go there.
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button variant="tonal" onClick={() => setSheet(false)}>
              Show cell
            </Button>
            <Button onClick={() => setSheet(false)}>Play this move</Button>
          </div>
        </div>
      </BottomSheet>
    </Section>
  );
}

// --- Régions -----------------------------------------------------------------------------------

export function RegionSection() {
  const { regionColors, dark } = useTheme();
  const [patterns, setPatterns] = useState(false);
  const [size, setSize] = useState('8');
  const board = demoBoard(Number(size));
  const colors = regionColors(board.size);
  return (
    <Section id="regions" title="Region palettes">
      <Row>
        <Switch checked={patterns} onChange={setPatterns} aria-label="Patterns" />
        <span className="md-typescale-body-medium" style={{ color: 'var(--md-sys-color-on-surface-variant)' }}>
          Patterns (accessibility)
        </span>
      </Row>
      <div style={{ marginBottom: 16 }}>
        <SegmentedButton aria-label="Board size" value={size} onChange={setSize} showCheck={false} options={['6', '7', '8', '9', '10'].map((n) => ({ value: n, label: n }))} />
      </div>
      <div className="g-board" style={{ gridTemplateColumns: `repeat(${board.size}, 1fr)`, background: 'var(--md-sys-color-surface-container-highest)' }} data-testid="demo-board">
        {board.regions.map((region, cell) => {
          const color = colors[region];
          const row = Math.floor(cell / board.size);
          const queen = board.queens[row] === cell % board.size;
          return (
            <div key={cell} className="g-board-cell" style={color ? regionStyle(color, patterns) : undefined}>
              {queen ? <Icon name="crown" filled size={20} /> : null}
            </div>
          );
        })}
      </div>
      {[6, 7, 8, 9, 10].map((n) => (
        <div key={n} className="g-region-row">
          <span className="md-typescale-label-medium">{n}</span>
          {regionColors(n).map((c, i) => (
            <div key={i} className="g-region-swatch" style={regionStyle(c, patterns) as CSSProperties}>
              <Icon name="crown" filled size={16} />
            </div>
          ))}
        </div>
      ))}
      <p className="g-note md-typescale-body-small">{dark ? 'dark' : 'light'} palette, regions numbered in reading order</p>
    </Section>
  );
}
