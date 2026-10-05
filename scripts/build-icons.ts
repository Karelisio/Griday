/**
 * Génère `src/ui/icons.generated.ts` : tracés SVG (Material Symbols « rounded », graisse 400)
 * des seules icônes listées ci-dessous, avec leur variante pleine quand elle diffère.
 *
 * Usage :
 *   npx tsx scripts/build-icons.ts           # écrit le fichier
 *   npx tsx scripts/build-icons.ts --check   # échoue si le fichier généré n'est pas à jour
 *
 * Ajouter une icône = ajouter une ligne dans ICONS puis relancer le script.
 * Le jeu de symboles évolue : certains noms historiques (`vibration`, `emoji_events`,
 * `auto_awesome`) ont été renommés ; on garde le nom d'usage et on indique la source.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** [nom d'usage, nom du fichier source si différent]. */
const ICONS: readonly (readonly [name: string, source?: string])[] = [
  // Navigation et en-têtes
  ['today'],
  ['calendar_month'],
  ['all_inclusive'],
  ['settings'],
  ['home'],
  ['menu'],
  ['more_vert'],
  ['arrow_back'],
  ['arrow_forward'],
  ['chevron_left'],
  ['chevron_right'],
  ['keyboard_arrow_down'],
  ['keyboard_arrow_up'],
  ['open_in_new'],
  // Actions de jeu
  ['undo'],
  ['redo'],
  ['lightbulb'],
  ['restart_alt'],
  ['pause'],
  ['play_arrow'],
  ['refresh'],
  ['timer'],
  ['share'],
  ['backspace'],
  // Génériques
  ['add'],
  ['remove'],
  ['close'],
  ['check'],
  ['check_circle'],
  ['cancel'],
  ['search'],
  ['edit'],
  ['delete'],
  ['content_copy'],
  ['download'],
  ['history'],
  ['schedule'],
  ['person'],
  ['notifications'],
  ['favorite'],
  ['star'],
  ['flag'],
  ['lock'],
  ['visibility'],
  ['tune'],
  ['apps'],
  // Statistiques, récompenses
  ['bar_chart'],
  ['emoji_events', 'trophy'],
  ['local_fire_department'],
  ['celebration'],
  ['auto_awesome', 'stars_2'],
  ['bolt'],
  // Pièces et grille
  ['crown'],
  ['chess_queen'],
  ['chess'],
  ['grid_view'],
  ['extension'],
  // Réglages
  ['palette'],
  ['translate'],
  ['language'],
  ['vibration', 'mobile_vibrate'],
  ['volume_up'],
  ['dark_mode'],
  ['light_mode'],
  ['contrast'],
  ['brightness_auto'],
  ['settings_brightness'],
  // États
  ['info'],
  ['help'],
  ['error'],
  ['warning'],
  ['cloud_off'],
];

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SVG_DIR = `${ROOT}node_modules/@material-symbols/svg-400/rounded`;
const OUT_FILE = `${ROOT}src/ui/icons.generated.ts`;

/** Extrait l'attribut `d` du unique `<path>` d'un fichier SVG. */
function readPath(file: string): string {
  if (!existsSync(file)) throw new Error(`Icône introuvable : ${file}`);
  const svg = readFileSync(file, 'utf8');
  const paths = [...svg.matchAll(/<path\b[^>]*\sd="([^"]+)"/g)];
  if (paths.length !== 1 || !paths[0]?.[1]) {
    throw new Error(`${file} : un seul <path> attendu (trouvé ${paths.length})`);
  }
  return paths[0][1];
}

export function buildIconsSource(): string {
  const names = new Set<string>();
  const entries: string[] = [];
  const sorted = [...ICONS].sort((a, b) => a[0].localeCompare(b[0]));
  for (const [name, source = name] of sorted) {
    if (names.has(name)) throw new Error(`Icône en double : ${name}`);
    names.add(name);
    const outline = readPath(`${SVG_DIR}/${source}.svg`);
    const filled = readPath(`${SVG_DIR}/${source}-fill.svg`);
    const fields = [`outline: '${outline}'`];
    if (filled !== outline) fields.push(`filled: '${filled}'`);
    entries.push(`  ${name}: { ${fields.join(', ')} },`);
  }
  return [
    '// GÉNÉRÉ par scripts/build-icons.ts : ne pas modifier à la main (npx tsx scripts/build-icons.ts).',
    '// Source : @material-symbols/svg-400, style « rounded », graisse 400.',
    '',
    '/** Boîte de dessin commune à toutes les icônes Material Symbols. */',
    "export const ICON_VIEW_BOX = '0 -960 960 960';",
    '',
    "/** Tracés d'une icône : contour, et variante pleine quand elle diffère du contour. */",
    'export interface IconPaths {',
    '  readonly outline: string;',
    '  readonly filled?: string;',
    '}',
    '',
    'export const ICON_PATHS = {',
    ...entries,
    '} as const satisfies Record<string, IconPaths>;',
    '',
    'export type IconName = keyof typeof ICON_PATHS;',
    '',
  ].join('\n');
}

function main(): void {
  const source = buildIconsSource();
  if (process.argv.includes('--check')) {
    const current = existsSync(OUT_FILE) ? readFileSync(OUT_FILE, 'utf8') : '';
    if (current !== source) {
      console.error('src/ui/icons.generated.ts n’est pas à jour : lancer npx tsx scripts/build-icons.ts');
      process.exit(1);
    }
    console.log('Icônes à jour.');
    return;
  }
  writeFileSync(OUT_FILE, source);
  console.log(`${ICONS.length} icônes écrites dans src/ui/icons.generated.ts (${(source.length / 1024).toFixed(1)} Ko)`);
}

// Exécuté directement (tsx) mais importable sans effet de bord pour les tests.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
