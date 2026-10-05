/**
 * Grille Binairo : tuiles arrondies (une par case) portant un soleil ou une lune (forme ET couleur),
 * cases données plus marquées et inertes, conflits cerclés, indices (ligne cadrée, pivots cerclés, symboles
 * à poser en filigrane), toucher unique (vide → soleil → lune → vide), clavier et lecteurs d'écran.
 */
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { memo, useMemo, useRef, useState, type CSSProperties, type FocusEvent, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { CELL_A, CELL_B, CELL_EMPTY, type BinairoCell, type BinairoSolvedPuzzle, type BinairoSymbol } from '../../../engine/binairo/types';
import type { BoardProps } from '../core/kind';
import { isBinairoHighlight, type BinairoHighlight } from './explain';
import { TapTracker, nextStroke } from './gestures';
import { binairoPalette } from './palette';
import './BinairoBoard.css';

export interface BinairoBoardProps extends BoardProps<BinairoSolvedPuzzle> {
  /** Thème sombre : palette des symboles (défaut : clair). */
  readonly dark?: boolean;
}

/** Opacité du symbole « fantôme » de l'indice (encre du symbole sur une tuile vide) : contraste ≥ 3:1, voir le test. */
export const GHOST_ALPHA = 0.85;

/** Opacité du liseré d'une case vide (rôle `outline` sur la tuile vide) : contraste ≥ 3:1, voir le test (miroir du CSS). */
export const EDGE_ALPHA = 0.85;

/** Grilles à partir de cette taille : espacements plus fins et symboles plus grands (cases de ~25 px). */
const DENSE_FROM = 10;

// Soleil (24×24) : disque + 8 rayons (traits arrondis). Lune : croissant plein, ouverture vers le haut à droite.
const SUN_RAYS = 'M12 2.4v2.8M12 18.8v2.8M2.4 12h2.8M18.8 12h2.8M5.2 5.2l2 2M16.8 16.8l2 2M5.2 18.8l2-2M16.8 7.2l2-2';
const MOON = 'M10.2 2.77A9.4 9.4 0 1 0 21.23 13.8A7.8 7.8 0 0 1 10.2 2.77Z';

const SPRING_POP = { type: 'spring', stiffness: 800, damping: 2 * 0.6 * Math.sqrt(800) } as const;

/** Éléments décrivant l'état d'une case pour son étiquette. */
export interface CellStateInput {
  readonly mark: BinairoCell;
  readonly given: boolean;
  readonly conflict: boolean;
  readonly mistake: boolean;
  /** Dans la ligne, la seconde ligne ou les pivots d'un indice. */
  readonly highlighted: boolean;
  /** Symbole que l'indice propose de poser sur cette case (0 : aucun). */
  readonly proposed: BinairoCell;
}

/**
 * Clés `game.cell.*` de l'état d'une case, dans l'ordre de lecture : le contenu (vide, soleil, lune), case
 * donnée, conflit, erreur, surlignage, puis le symbole proposé par l'indice (cases vides seulement).
 */
export function cellStateKeys(c: CellStateInput): string[] {
  const keys = [c.mark === CELL_A ? 'sun' : c.mark === CELL_B ? 'moon' : 'empty'];
  if (c.given) keys.push('given');
  if (c.conflict) keys.push('inConflict');
  if (c.mistake) keys.push('mistake');
  if (c.highlighted) keys.push('highlighted');
  if (c.mark === CELL_EMPTY && c.proposed !== CELL_EMPTY) keys.push(c.proposed === CELL_A ? 'proposedSun' : 'proposedMoon');
  return keys;
}

interface Frame {
  readonly tone: 'line' | 'other';
  readonly r0: number;
  readonly r1: number;
  readonly c0: number;
  readonly c1: number;
}

/** Rectangle (lignes et colonnes extrêmes) qui enveloppe des cases ; null si aucune. */
function bounds(cells: readonly number[], n: number, tone: Frame['tone']): Frame | null {
  if (cells.length === 0) return null;
  const rows = cells.map((c) => Math.floor(c / n));
  const cols = cells.map((c) => c % n);
  return { tone, r0: Math.min(...rows), r1: Math.max(...rows), c0: Math.min(...cols), c1: Math.max(...cols) };
}

const NO_CELLS: readonly number[] = [];

export const BinairoBoard = memo(function BinairoBoard(props: BinairoBoardProps) {
  const { puzzle, marks, conflicts, highlight, disabled, celebrate, onGesture, dark = false } = props;
  const n = puzzle.size;
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  const gridRef = useRef<HTMLDivElement>(null);
  const [tracker] = useState(() => new TapTracker());
  /** Seul pointeur suivi pendant un geste (identifiant), null hors geste. */
  const activePointer = useRef<number | null>(null);
  const [focusCell, setFocusCell] = useState(0);
  // Case tabulable (index « roving ») ; ramenée dans la grille si la taille change (nouvelle grille).
  const roving = focusCell < n * n ? focusCell : 0;

  const hl: BinairoHighlight | null = isBinairoHighlight(highlight) ? highlight : null;
  const conflictSet = useMemo(() => new Set(conflicts), [conflicts]);
  const sets = useMemo(
    () => ({
      line: new Set(hl?.line ?? NO_CELLS),
      other: new Set(hl?.other ?? NO_CELLS),
      pivots: new Set(hl?.pivots ?? NO_CELLS),
      mistakes: new Set(hl?.mistakes ?? NO_CELLS),
      places: new Map((hl?.places ?? []).map((p) => [p.cell, p.value] as const)),
    }),
    [hl],
  );
  const frames = useMemo(() => [bounds(hl?.line ?? NO_CELLS, n, 'line'), bounds(hl?.other ?? NO_CELLS, n, 'other')].filter((f): f is Frame => f !== null), [hl, n]);
  const palette = useMemo(() => binairoPalette(dark), [dark]);
  const rootStyle = useMemo(
    () =>
      ({
        '--bb-n': n,
        '--bb-sun-tile': palette.sun.tile,
        '--bb-sun-ink': palette.sun.ink,
        '--bb-sun-given-tile': palette.sun.givenTile,
        '--bb-sun-given-ink': palette.sun.givenInk,
        '--bb-moon-tile': palette.moon.tile,
        '--bb-moon-ink': palette.moon.ink,
        '--bb-moon-given-tile': palette.moon.givenTile,
        '--bb-moon-given-ink': palette.moon.givenInk,
      }) as CSSProperties,
    [n, palette],
  );

  const isGiven = (cell: number) => (puzzle.givens[cell] ?? CELL_EMPTY) !== CELL_EMPTY;
  // Une case donnée montre toujours sa donnée, quelle que soit la marque reçue.
  const markAt = (cell: number): BinairoCell => puzzle.givens[cell] || (marks[cell] ?? CELL_EMPTY);

  /** Case sous le point (x, y) : les interstices reviennent à la case la plus proche ; null hors grille. */
  const cellAt = (x: number, y: number): number | null => {
    const grid = gridRef.current;
    const r = grid?.getBoundingClientRect();
    if (!grid || !r || r.width <= 0 || r.height <= 0) return null;
    const gap = Number.parseFloat(getComputedStyle(grid).rowGap) || 0;
    const col = Math.floor(((x - r.left + gap / 2) * n) / (r.width + gap));
    const row = Math.floor(((y - r.top + gap / 2) * n) / (r.height + gap));
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

  /** Toucher d'une case libre : une case donnée ne réagit jamais. */
  const tap = (cell: number) => {
    if (!disabled && !isGiven(cell)) onGesture({ type: 'tap', cell });
  };

  /** Saisie directe (clavier) : la case prend `to` en une seule entrée d'historique (même mécanisme que le glisser). */
  const setTo = (cell: number, to: BinairoCell) => {
    const from = markAt(cell);
    if (disabled || isGiven(cell) || from === to) return;
    onGesture({ type: 'paint', cells: [cell], from, to, stroke: nextStroke() });
  };

  // --- Pointeur : un seul pointeur primaire suivi (un 2e doigt ne fait jamais rien) ---
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
    tracker.move({ x: e.clientX, y: e.clientY });
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (!ownsEvent(e)) return;
    activePointer.current = null;
    if (disabled) return tracker.cancel();
    // Dernière position (le relâchement peut précéder tout déplacement), puis toucher ou abandon.
    tracker.move({ x: e.clientX, y: e.clientY });
    const cell = tracker.up();
    if (cell !== null) tap(cell);
  };
  // Annulation système (défilement de la page, geste) ou capture perdue : le toucher en cours est abandonné.
  const onPointerCancel = (e: PointerEvent<HTMLDivElement>) => {
    if (!ownsEvent(e)) return;
    activePointer.current = null;
    tracker.cancel();
  };

  // Activation sans événements pointeur (lecteur d'écran : clic synthétique de détail 0).
  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    if (e.detail !== 0) return;
    const cell = cellOf(e.target);
    if (cell !== null) tap(cell);
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
        if (!e.repeat) tap(cell);
        break;
      // Saisie directe : 1 = soleil, 2 = lune, 0 / Retour arrière / Suppr = case vidée.
      case '1':
      case '2':
      case '0':
      case 'Backspace':
      case 'Delete':
        if (mod) return;
        if (!e.repeat) setTo(cell, e.key === '1' ? CELL_A : e.key === '2' ? CELL_B : CELL_EMPTY);
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  return (
    <div
      className={`bb${celebrate ? ' bb--celebrate' : ''}${disabled ? ' bb--disabled' : ''}`}
      data-dense={n >= DENSE_FROM ? '' : undefined}
      data-dark={dark ? '' : undefined}
      style={rootStyle}
    >
      <div className="bb__field">
        <div
          ref={gridRef}
          className="bb__grid"
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
            <div key={r} role="row" className="bb__row">
              {Array.from({ length: n }, (_, c) => {
                const cell = r * n + c;
                return (
                  <Cell
                    key={cell}
                    cell={cell}
                    row={r}
                    col={c}
                    mark={markAt(cell)}
                    given={isGiven(cell)}
                    conflict={conflictSet.has(cell)}
                    line={sets.line.has(cell) ? 1 : sets.other.has(cell) ? 2 : 0}
                    pivot={sets.pivots.has(cell)}
                    ghost={(sets.places.get(cell) ?? CELL_EMPTY) as BinairoCell}
                    mistake={sets.mistakes.has(cell)}
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
        {frames.map((f) => (
          <div
            key={f.tone}
            className={`bb__frame bb__frame--${f.tone}`}
            style={{ '--r0': f.r0, '--r1': f.r1, '--c0': f.c0, '--c1': f.c1 } as CSSProperties}
            aria-hidden="true"
          />
        ))}
      </div>
    </div>
  );
});

// Props de `Cell` : uniquement des valeurs primitives (et `t`, stable tant que la langue ne change pas),
// pour que la mémoïsation limite un rendu aux seules cases modifiées.
interface CellProps {
  readonly cell: number;
  readonly row: number;
  readonly col: number;
  readonly mark: BinairoCell;
  /** Case donnée par la grille : jamais modifiable. */
  readonly given: boolean;
  readonly conflict: boolean;
  /** 0 : hors indice ; 1 : ligne du raisonnement ; 2 : seconde ligne. */
  readonly line: 0 | 1 | 2;
  /** Pivot du raisonnement. */
  readonly pivot: boolean;
  /** Symbole que l'indice propose de poser (0 : aucun). */
  readonly ghost: BinairoCell;
  readonly mistake: boolean;
  readonly tabIndex: number;
  readonly celebrate: boolean;
  readonly reduce: boolean;
  readonly t: TFunction;
}

/** Soleil ou lune, dessiné dans une boîte 24×24 (couleur = `currentColor`). */
function Glyph({ symbol, ghost = false }: { readonly symbol: BinairoSymbol; readonly ghost?: boolean }) {
  return symbol === CELL_A ? (
    <>
      {/* pathLength multiple de la période des tirets (5) : le pointillé du disque se referme proprement. */}
      <circle className="bb__disc" cx="12" cy="12" r="4.9" {...(ghost ? { pathLength: 30 } : null)} />
      <path className="bb__rays" d={SUN_RAYS} />
    </>
  ) : (
    <path className="bb__crescent" d={MOON} {...(ghost ? { pathLength: 60 } : null)} />
  );
}

const Cell = memo(function Cell(p: CellProps) {
  const { t } = p;
  const state = cellStateKeys({
    mark: p.mark,
    given: p.given,
    conflict: p.conflict,
    mistake: p.mistake,
    highlighted: p.line !== 0 || p.pivot,
    proposed: p.ghost,
  })
    .map((key) => t(`game.cell.${key}`))
    .join(', ');
  const label = t('game.cell.labelPlain', { row: p.row + 1, col: p.col + 1, state });
  const ghost = p.mark === CELL_EMPTY && p.ghost !== CELL_EMPTY ? p.ghost : CELL_EMPTY;
  const cls = [
    'bb__cell',
    p.mark === CELL_A && 'bb__cell--sun',
    p.mark === CELL_B && 'bb__cell--moon',
    p.given && 'bb__cell--given',
    p.line === 1 && 'bb__cell--line',
    p.line === 2 && 'bb__cell--other',
    p.pivot && 'bb__cell--pivot',
    ghost !== CELL_EMPTY && `bb__cell--hinted bb__cell--ghost-${ghost === CELL_A ? 'sun' : 'moon'}`,
    p.mistake && 'bb__cell--mistake',
    p.conflict && 'bb__cell--conflict',
  ]
    .filter(Boolean)
    .join(' ');
  const pop = p.reduce ? { duration: 0 } : SPRING_POP;
  // Vague de célébration en diagonale ; secousse brève d'un symbole en conflit.
  const celebrating = p.celebrate && !p.reduce;
  const animate = celebrating
    ? { scale: [1, 1.25, 1], opacity: 1, rotate: [0, -8, 0], transition: { delay: (p.row + p.col) * 0.04, duration: 0.5 } }
    : p.conflict && !p.reduce
      ? { scale: 1, opacity: 1, rotate: 0, x: [0, -2.5, 2.5, -1.5, 1.5, 0], transition: { duration: 0.35 } }
      : { scale: 1, opacity: 1, rotate: 0, x: 0 };
  return (
    <div
      role="gridcell"
      data-cell={p.cell}
      className={cls}
      tabIndex={p.tabIndex}
      aria-label={label}
      aria-disabled={p.given || undefined}
    >
      <AnimatePresence initial={false}>
        {p.mark !== CELL_EMPTY && (
          <motion.svg
            key={p.mark}
            className={`bb__sym bb__sym--${p.mark === CELL_A ? 'sun' : 'moon'}`}
            viewBox="0 0 24 24"
            aria-hidden="true"
            focusable="false"
            initial={{ scale: 0.3, opacity: 0, rotate: -12 }}
            animate={animate}
            exit={{ scale: 0.3, opacity: 0, transition: { duration: 0.1 } }}
            transition={pop}
          >
            <Glyph symbol={p.mark} />
          </motion.svg>
        )}
      </AnimatePresence>
      {ghost !== CELL_EMPTY && (
        <svg
          className={`bb__sym bb__sym--${ghost === CELL_A ? 'sun' : 'moon'} bb__sym--ghost`}
          viewBox="0 0 24 24"
          aria-hidden="true"
          focusable="false"
          style={{ opacity: GHOST_ALPHA }}
        >
          <Glyph symbol={ghost as BinairoSymbol} ghost />
        </svg>
      )}
    </div>
  );
});
