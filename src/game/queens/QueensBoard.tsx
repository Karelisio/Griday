/**
 * Grille Queens : régions colorées (tons de la palette), bordures de régions en SVG,
 * reines et croix animées (ressorts), surlignage des indices, gestes tactiles et clavier,
 * étiquettes complètes pour les lecteurs d'écran (ligne, colonne, région, état).
 */
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { memo, useMemo, useRef, useState, type CSSProperties, type FocusEvent, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import type { QueensMark, QueensPuzzle } from '../../../engine/queens/types';
import type { HintHighlight } from './explain';
import { GestureTracker, type GestureEvent } from './gestures';
import { MARK_CROSS, MARK_EMPTY, MARK_QUEEN } from './marks';
import './QueensBoard.css';

export interface RegionStyle {
  readonly fill: string;
  readonly on: string;
  readonly pattern: number;
}

export interface QueensBoardProps {
  readonly puzzle: QueensPuzzle;
  readonly marks: readonly QueensMark[];
  readonly regionColors: readonly RegionStyle[];
  readonly conflicts?: readonly number[];
  /** Cases interdites par une reine, marquées d'une petite croix (réglage « croix automatiques »). */
  readonly attacked?: ReadonlySet<number>;
  readonly highlight?: HintHighlight | null;
  /** Motifs de régions (accessibilité daltonisme). */
  readonly patterns?: boolean;
  readonly disabled?: boolean;
  /** Victoire : animation de célébration. */
  readonly celebrate?: boolean;
  readonly onGesture: (e: GestureEvent) => void;
}

/**
 * Opacité (sur le fond de la région) des marqueurs tracés avec la couleur `on` de la région.
 * `on` contraste ≥ 4,5:1 sur tous les fonds de la palette ; à ces opacités, chaque marqueur
 * garde un contraste ≥ 3:1 (WCAG 1.4.11) en clair comme en sombre (voir QueensBoard.test.tsx).
 * Appliquées en ligne par la cellule : source unique pour le rendu et les tests.
 */
export const MARKER_ALPHA = {
  /** Croix posée par le joueur. */
  cross: 0.8,
  /** Reine et croix « fantômes » de l'indice. */
  ghost: 0.7,
  /** Petite croix des cases interdites par une reine. */
  attacked: 0.7,
} as const;

/** Grilles à partir de cette taille : anneaux d'état plus fins (cases de ~30 px). */
const DENSE_FROM = 10;

const GHOST_STYLE: CSSProperties = { opacity: MARKER_ALPHA.ghost };
const ATTACKED_STYLE: CSSProperties = { opacity: MARKER_ALPHA.attacked };

// Couronne (24×24), dessinée pour rester lisible de 24 à 64 px : corps (longueur ≈ 65) et socle (≈ 34).
const CROWN_BODY = 'M4.2 18.2h15.6l1.7-10.1a1 1 0 0 0-1.6-.95l-4.1 3.1-3-5.4a.9.9 0 0 0-1.6 0l-3 5.4-4.1-3.1a1 1 0 0 0-1.6.95z';
const CROWN_BAR = 'M5 20a1 1 0 0 0 0 2h14a1 1 0 0 0 0-2z';
const CROWN = CROWN_BODY + CROWN_BAR;
const CROSS = 'M6 6l12 12M18 6L6 18';

/** Côtés d'une case (masque de bits) dont la voisine n'appartient pas à l'unité surlignée. */
const EDGE_TOP = 1;
const EDGE_RIGHT = 2;
const EDGE_BOTTOM = 4;
const EDGE_LEFT = 8;
const EDGE_ALL = EDGE_TOP | EDGE_RIGHT | EDGE_BOTTOM | EDGE_LEFT;

/** Côtés de `cell` (appartenant à l'unité `focus`) dont la voisine est hors de l'unité ou de la grille ; 0 hors unité. */
function outerEdges(focus: ReadonlySet<number>, cell: number, n: number): number {
  if (!focus.has(cell)) return 0;
  const r = Math.floor(cell / n);
  const c = cell % n;
  const outside = (rr: number, cc: number) => rr < 0 || cc < 0 || rr >= n || cc >= n || !focus.has(rr * n + cc);
  return (outside(r - 1, c) ? EDGE_TOP : 0) | (outside(r, c + 1) ? EDGE_RIGHT : 0) | (outside(r + 1, c) ? EDGE_BOTTOM : 0) | (outside(r, c - 1) ? EDGE_LEFT : 0);
}

/** Ombres intérieures de 2 px (couleur `--qb-fe-c`) pour chacun des côtés d'un masque. */
function edgeShadow(edges: number): string | undefined {
  if (edges === 0 || edges === EDGE_ALL) return undefined; // anneau complet : valeur par défaut du CSS
  const parts: string[] = [];
  if (edges & EDGE_TOP) parts.push('inset 0 2px 0 0 var(--qb-fe-c)');
  if (edges & EDGE_RIGHT) parts.push('inset -2px 0 0 0 var(--qb-fe-c)');
  if (edges & EDGE_BOTTOM) parts.push('inset 0 -2px 0 0 var(--qb-fe-c)');
  if (edges & EDGE_LEFT) parts.push('inset 2px 0 0 0 var(--qb-fe-c)');
  return parts.join(', ');
}

const SPRING_POP = { type: 'spring', stiffness: 800, damping: 2 * 0.6 * Math.sqrt(800) } as const;
const SPRING_SOFT = { type: 'spring', stiffness: 380, damping: 2 * 0.8 * Math.sqrt(380) } as const;

/** Lettre de région annoncée (région canonique 0 → « A »), numéro au-delà de Z. */
export function regionLetter(region: number): string {
  return region >= 0 && region < 26 ? String.fromCharCode(65 + region) : String(region + 1);
}

/** Éléments décrivant l'état d'une case pour son étiquette. */
export interface CellStateInput {
  readonly mark: QueensMark;
  readonly conflict: boolean;
  readonly mistake: boolean;
  /** Dans une unité ou une cible surlignée par l'indice. */
  readonly highlighted: boolean;
  readonly eliminate: boolean;
  readonly attacked: boolean;
  /** Case jouée par l'indice. */
  readonly hinted: boolean;
}

/**
 * Clés `game.cell.*` de l'état d'une case, dans l'ordre de lecture : la marque (reine, reine en
 * conflit, croix, vide), puis erreur, surlignage, exclusions (cases vides seulement) et case de l'indice.
 */
export function cellStateKeys(c: CellStateInput): string[] {
  const empty = c.mark === MARK_EMPTY;
  const keys = [c.mark === MARK_QUEEN ? (c.conflict ? 'conflict' : 'queen') : c.mark === MARK_CROSS ? 'cross' : 'empty'];
  if (c.mistake) keys.push('mistake');
  if (c.highlighted) keys.push('highlighted');
  if (empty && c.eliminate) keys.push('ruledOut');
  if (empty && c.attacked) keys.push('attacked');
  if (c.hinted) keys.push('hinted');
  return keys;
}

export const QueensBoard = memo(function QueensBoard(props: QueensBoardProps) {
  const { puzzle, marks, regionColors, conflicts = [], attacked, highlight, patterns = false, disabled = false, celebrate = false, onGesture } = props;
  const n = puzzle.size;
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  const gridRef = useRef<HTMLDivElement>(null);
  const [tracker] = useState(() => new GestureTracker());
  /** Seul pointeur suivi pendant un geste (identifiant), null hors geste. */
  const activePointer = useRef<number | null>(null);
  const [focusCell, setFocusCell] = useState(0);
  // Case tabulable (index « roving ») ; ramenée dans la grille si la taille change (nouvelle grille).
  const roving = focusCell < n * n ? focusCell : 0;

  const conflictSet = useMemo(() => new Set(conflicts), [conflicts]);
  const sets = useMemo(
    () => ({
      focus: new Set(highlight?.focus ?? []),
      targets: new Set(highlight?.targets ?? []),
      eliminate: new Set(highlight?.eliminate ?? []),
      mistakes: new Set(highlight?.mistakes ?? []),
    }),
    [highlight],
  );
  const borders = useMemo(() => regionBorderPath(puzzle), [puzzle]);
  const thin = useMemo(() => thinGridPath(puzzle), [puzzle]);
  const rootStyle = useMemo(() => ({ ['--qb-n' as string]: n }), [n]);

  /** Case sous le point (x, y) ; null hors grille. */
  const cellAt = (x: number, y: number): number | null => {
    const r = gridRef.current?.getBoundingClientRect();
    if (!r || r.width <= 0 || r.height <= 0) return null;
    const col = Math.floor(((x - r.left) / r.width) * n);
    const row = Math.floor(((y - r.top) / r.height) * n);
    return row >= 0 && row < n && col >= 0 && col < n ? row * n + col : null;
  };

  /** Case (indice) portant l'élément ciblé par un événement, null s'il n'est pas dans une case. */
  const cellOf = (target: EventTarget | null): number | null => {
    if (!(target instanceof Element)) return null;
    const el = target.closest('[data-cell]');
    if (!el || !gridRef.current?.contains(el)) return null;
    const cell = Number(el.getAttribute('data-cell'));
    return Number.isInteger(cell) && cell >= 0 && cell < n * n ? cell : null;
  };

  const emit = (e: GestureEvent | null) => {
    if (e && !disabled) onGesture(e);
  };
  const markAt = (cell: number): QueensMark => marks[cell] ?? MARK_EMPTY;

  // --- Pointeur : un seul pointeur primaire suivi (un 2e doigt ne peint jamais) ---
  const ownsEvent = (e: PointerEvent<HTMLDivElement>) => e.isPrimary && e.pointerId === activePointer.current;

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (disabled || !e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
    activePointer.current = e.pointerId;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Pointeur déjà levé : le geste s'achèvera avec l'événement suivant.
    }
    const size = (gridRef.current?.getBoundingClientRect().width ?? 0) / n;
    const cell = cellAt(e.clientX, e.clientY);
    tracker.down(cell, { x: e.clientX, y: e.clientY }, size);
    if (cell !== null) setFocusCell(cell);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (disabled || !ownsEvent(e)) return;
    emit(tracker.move(cellAt(e.clientX, e.clientY), { x: e.clientX, y: e.clientY }, markAt));
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (!ownsEvent(e)) return;
    activePointer.current = null;
    if (disabled) return tracker.cancel();
    // Dernière position (le relâchement peut précéder tout déplacement), puis toucher ou fin de glisser.
    emit(tracker.move(cellAt(e.clientX, e.clientY), { x: e.clientX, y: e.clientY }, markAt));
    emit(tracker.up(e.timeStamp));
  };
  // Annulation système ou capture perdue : le geste en cours est abandonné.
  const onPointerCancel = (e: PointerEvent<HTMLDivElement>) => {
    if (!ownsEvent(e)) return;
    activePointer.current = null;
    tracker.cancel();
  };

  // Activation sans événements pointeur (clavier, lecteur d'écran : clic synthétique de détail 0).
  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    if (e.detail !== 0) return;
    const cell = cellOf(e.target);
    if (cell !== null) emit({ type: 'tap', cell });
  };

  // Le focus déplacé par un lecteur d'écran ou par programme met à jour la case « tabulable ».
  const onFocus = (e: FocusEvent<HTMLDivElement>) => {
    const cell = cellOf(e.target);
    if (cell !== null) setFocusCell(cell);
  };

  const focusTo = (cell: number) => {
    setFocusCell(cell);
    gridRef.current?.querySelector<HTMLElement>(`[data-cell="${cell}"]`)?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.altKey) return;
    const cell = cellOf(e.target) ?? roving;
    const r = Math.floor(cell / n);
    const c = cell % n;
    const clamp = (v: number) => Math.min(n - 1, Math.max(0, v));
    const go = (nr: number, nc: number) => focusTo(clamp(nr) * n + clamp(nc));
    const mod = e.ctrlKey || e.metaKey;
    switch (e.key) {
      case 'ArrowUp':
        go(r - 1, c);
        break;
      case 'ArrowDown':
        go(r + 1, c);
        break;
      case 'ArrowLeft':
        go(r, c - 1);
        break;
      case 'ArrowRight':
        go(r, c + 1);
        break;
      case 'Home':
        if (mod) focusTo(0);
        else go(r, 0);
        break;
      case 'End':
        if (mod) focusTo(n * n - 1);
        else go(r, n - 1);
        break;
      case 'Enter':
      case ' ':
        if (mod) return;
        if (!e.repeat) emit({ type: 'tap', cell });
        break;
      case 'x':
      case 'X':
        if (mod) return;
        if (!e.repeat) emit({ type: 'paint', cells: [cell], mode: marks[cell] === MARK_CROSS ? 'erase' : 'cross', stroke: tracker.nextStroke() });
        break;
      case 'Backspace':
      case 'Delete':
        if (mod) return;
        if (e.repeat) break;
        if (marks[cell] === MARK_QUEEN) emit({ type: 'tap', cell });
        else if (marks[cell] === MARK_CROSS) emit({ type: 'paint', cells: [cell], mode: 'erase', stroke: tracker.nextStroke() });
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  return (
    <div
      className={`qb${celebrate ? ' qb--celebrate' : ''}${disabled ? ' qb--disabled' : ''}`}
      data-dense={n >= DENSE_FROM ? '' : undefined}
      style={rootStyle}
    >
      <div
        ref={gridRef}
        className="qb__grid"
        role="grid"
        aria-label={t('game.board', { n })}
        aria-disabled={disabled || undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onLostPointerCapture={onPointerCancel}
        onClick={onClick}
        onFocus={onFocus}
        onKeyDown={onKeyDown}
      >
        {Array.from({ length: n }, (_, r) => (
          <div key={r} role="row" className="qb__row">
            {Array.from({ length: n }, (_, c) => {
              const cell = r * n + c;
              const regionId = puzzle.regions[cell] ?? 0;
              const region = regionColors[regionId % Math.max(1, regionColors.length)];
              const isReveal = highlight?.reveal === cell;
              return (
                <Cell
                  key={cell}
                  cell={cell}
                  row={r}
                  col={c}
                  region={regionLetter(regionId)}
                  mark={marks[cell] ?? MARK_EMPTY}
                  fill={region?.fill ?? 'var(--md-sys-color-surface-container-high)'}
                  on={region?.on ?? 'var(--md-sys-color-on-surface)'}
                  pattern={patterns ? (region?.pattern ?? 0) : 0}
                  conflict={conflictSet.has(cell)}
                  attacked={attacked?.has(cell) ?? false}
                  focus={sets.focus.has(cell)}
                  focusEdges={outerEdges(sets.focus, cell, n)}
                  target={sets.targets.has(cell)}
                  eliminate={sets.eliminate.has(cell)}
                  mistake={sets.mistakes.has(cell)}
                  hinted={isReveal}
                  reveal={isReveal ? (highlight?.revealMark ?? null) : null}
                  tabIndex={cell === roving ? 0 : -1}
                  celebrate={celebrate}
                  reduce={!!reduce}
                  t={t}
                />
              );
            })}
          </div>
        ))}
      </div>
      <svg className="qb__lines" viewBox={`0 0 ${n} ${n}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <path className="qb__thin" d={thin} vectorEffect="non-scaling-stroke" />
        <path className="qb__thick" d={borders} vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
});

// Props de `Cell` : uniquement des valeurs primitives (et `t`, stable tant que la langue ne change pas),
// pour que la mémoïsation limite un rendu aux seules cases modifiées.
interface CellProps {
  readonly cell: number;
  readonly row: number;
  readonly col: number;
  /** Lettre de la région (annoncée par les lecteurs d'écran). */
  readonly region: string;
  readonly mark: QueensMark;
  readonly fill: string;
  readonly on: string;
  readonly pattern: number;
  readonly conflict: boolean;
  readonly attacked: boolean;
  readonly focus: boolean;
  /** Côtés de la case qui bordent l'extérieur de l'unité surlignée (masque EDGE_*), 0 hors unité. */
  readonly focusEdges: number;
  readonly target: boolean;
  readonly eliminate: boolean;
  readonly mistake: boolean;
  /** Case jouée par l'indice. */
  readonly hinted: boolean;
  /** Marque que l'indice propose de poser sur cette case. */
  readonly reveal: 'queen' | 'cross' | null;
  readonly tabIndex: number;
  readonly celebrate: boolean;
  readonly reduce: boolean;
  readonly t: TFunction;
}

const Cell = memo(function Cell(p: CellProps) {
  const { t } = p;
  const state = cellStateKeys({
    mark: p.mark,
    conflict: p.conflict,
    mistake: p.mistake,
    highlighted: p.focus || p.target,
    eliminate: p.eliminate,
    attacked: p.attacked,
    hinted: p.hinted,
  })
    .map((key) => t(`game.cell.${key}`))
    .join(', ');
  const label = t('game.cell.label', { row: p.row + 1, col: p.col + 1, region: p.region, state });
  const cls = [
    'qb__cell',
    p.focus && 'qb__cell--focus',
    p.target && !p.focus && 'qb__cell--target',
    p.mistake && 'qb__cell--mistake',
    p.conflict && 'qb__cell--conflict',
    p.hinted && 'qb__cell--reveal',
    p.pattern > 0 && `qb__cell--pattern-${p.pattern}`,
  ]
    .filter(Boolean)
    .join(' ');
  const pop = p.reduce ? { duration: 0 } : SPRING_POP;
  const empty = p.mark === MARK_EMPTY;
  return (
    <div
      role="gridcell"
      data-cell={p.cell}
      className={cls}
      tabIndex={p.tabIndex}
      aria-label={label}
      style={{ backgroundColor: p.fill, color: p.on, ['--qb-fe' as string]: edgeShadow(p.focusEdges) }}
    >
      <AnimatePresence initial={false}>
        {p.mark === MARK_QUEEN && (
          <motion.svg
            key="q"
            className="qb__queen"
            viewBox="0 0 24 24"
            aria-hidden="true"
            focusable="false"
            initial={{ scale: 0.3, opacity: 0, rotate: -12 }}
            animate={
              p.celebrate && !p.reduce
                ? { scale: [1, 1.28, 1], opacity: 1, rotate: [0, -8, 0], transition: { delay: p.row * 0.07, duration: 0.55 } }
                : p.conflict && !p.reduce
                  ? { scale: 1, opacity: 1, rotate: 0, x: [0, -3, 3, -2, 2, 0], transition: { duration: 0.35 } }
                  : { scale: 1, opacity: 1, rotate: 0, x: 0 }
            }
            exit={{ scale: 0.3, opacity: 0, transition: { duration: 0.12 } }}
            transition={pop}
          >
            <path d={CROWN} />
          </motion.svg>
        )}
        {p.mark === MARK_CROSS && (
          <motion.svg
            key="x"
            className="qb__cross"
            viewBox="0 0 24 24"
            aria-hidden="true"
            focusable="false"
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: MARKER_ALPHA.cross }}
            exit={{ scale: 0.4, opacity: 0, transition: { duration: 0.1 } }}
            transition={p.reduce ? { duration: 0 } : SPRING_SOFT}
          >
            <path d={CROSS} />
          </motion.svg>
        )}
      </AnimatePresence>
      {empty && p.attacked && (
        <svg className="qb__cross qb__cross--attacked" viewBox="0 0 24 24" aria-hidden="true" focusable="false" style={ATTACKED_STYLE}>
          <path d={CROSS} />
        </svg>
      )}
      {empty && (p.eliminate || p.reveal === 'cross') && (
        <svg className="qb__cross qb__cross--ghost" viewBox="0 0 24 24" aria-hidden="true" focusable="false" style={GHOST_STYLE}>
          <path d={CROSS} />
        </svg>
      )}
      {p.reveal === 'queen' && p.mark !== MARK_QUEEN && (
        <svg className="qb__queen qb__queen--ghost" viewBox="0 0 24 24" aria-hidden="true" focusable="false" style={GHOST_STYLE}>
          {/* pathLength multiple de la période des tirets (5) : le pointillé se referme proprement. */}
          <path d={CROWN_BODY} pathLength={65} />
          <path d={CROWN_BAR} className="qb__ghost-bar" />
        </svg>
      )}
    </div>
  );
});

/** Segments (unités de case) des frontières de régions et du contour. */
export function regionBorderPath(p: QueensPuzzle): string {
  const n = p.size;
  const reg = (r: number, c: number) => (r < 0 || c < 0 || r >= n || c >= n ? -1 : p.regions[r * n + c]!);
  const parts: string[] = [`M0 0H${n}V${n}H0Z`];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (c + 1 < n && reg(r, c) !== reg(r, c + 1)) parts.push(`M${c + 1} ${r}V${r + 1}`);
      if (r + 1 < n && reg(r, c) !== reg(r + 1, c)) parts.push(`M${c} ${r + 1}H${c + 1}`);
    }
  }
  return parts.join('');
}

/** Fines lignes entre cases d'une même région. */
export function thinGridPath(p: QueensPuzzle): string {
  const n = p.size;
  const parts: string[] = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const g = p.regions[r * n + c];
      if (c + 1 < n && g === p.regions[r * n + c + 1]) parts.push(`M${c + 1} ${r}V${r + 1}`);
      if (r + 1 < n && g === p.regions[(r + 1) * n + c]) parts.push(`M${c} ${r + 1}H${c + 1}`);
    }
  }
  return parts.join('');
}
