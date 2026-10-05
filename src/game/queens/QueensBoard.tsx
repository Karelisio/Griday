/**
 * Grille Queens : régions colorées (tons de la palette), bordures de régions en SVG,
 * reines et croix animées (ressorts), surlignage des indices, gestes tactiles et clavier.
 */
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { memo, useCallback, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
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
  /** Cases interdites affichées en pointillé (réglage « croix automatiques »). */
  readonly attacked?: ReadonlySet<number>;
  readonly highlight?: HintHighlight | null;
  /** Motifs de régions (accessibilité daltonisme). */
  readonly patterns?: boolean;
  readonly disabled?: boolean;
  /** Victoire : animation de célébration. */
  readonly celebrate?: boolean;
  readonly onGesture: (e: GestureEvent) => void;
}

// Couronne (24×24), dessinée pour rester lisible de 24 à 64 px.
const CROWN =
  'M4.2 18.2h15.6l1.7-10.1a1 1 0 0 0-1.6-.95l-4.1 3.1-3-5.4a.9.9 0 0 0-1.6 0l-3 5.4-4.1-3.1a1 1 0 0 0-1.6.95zM5 20a1 1 0 0 0 0 2h14a1 1 0 0 0 0-2z';

const SPRING_POP = { type: 'spring', stiffness: 800, damping: 2 * 0.6 * Math.sqrt(800) } as const;
const SPRING_SOFT = { type: 'spring', stiffness: 380, damping: 2 * 0.8 * Math.sqrt(380) } as const;

export const QueensBoard = memo(function QueensBoard(props: QueensBoardProps) {
  const { puzzle, marks, regionColors, conflicts = [], attacked, highlight, patterns = false, disabled = false, celebrate = false, onGesture } = props;
  const n = puzzle.size;
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  const gridRef = useRef<HTMLDivElement>(null);
  const tracker = useRef(new GestureTracker());
  const [focusCell, setFocusCell] = useState(0);

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

  const cellAt = useCallback(
    (x: number, y: number): number | null => {
      const el = gridRef.current;
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const col = Math.floor(((x - r.left) / r.width) * n);
      const row = Math.floor(((y - r.top) / r.height) * n);
      return row >= 0 && row < n && col >= 0 && col < n ? row * n + col : null;
    },
    [n],
  );

  const emit = (e: GestureEvent | null) => {
    if (e && !disabled) onGesture(e);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (disabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const cell = cellAt(e.clientX, e.clientY);
    tracker.current.down(cell);
    if (cell !== null) setFocusCell(cell);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    emit(tracker.current.move(cellAt(e.clientX, e.clientY), (c) => marks[c] ?? MARK_EMPTY));
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    emit(tracker.current.up(cellAt(e.clientX, e.clientY), e.timeStamp));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const r = Math.floor(focusCell / n);
    const c = focusCell % n;
    const move = (nr: number, nc: number) => {
      const next = Math.min(n - 1, Math.max(0, nr)) * n + Math.min(n - 1, Math.max(0, nc));
      setFocusCell(next);
      (gridRef.current?.querySelector(`[data-cell="${next}"]`) as HTMLElement | null)?.focus();
    };
    switch (e.key) {
      case 'ArrowUp':
        move(r - 1, c);
        break;
      case 'ArrowDown':
        move(r + 1, c);
        break;
      case 'ArrowLeft':
        move(r, c - 1);
        break;
      case 'ArrowRight':
        move(r, c + 1);
        break;
      case 'Enter':
      case ' ':
        emit({ type: 'tap', cell: focusCell });
        break;
      case 'x':
      case 'X':
        emit({ type: 'paint', cells: [focusCell], mode: marks[focusCell] === MARK_CROSS ? 'erase' : 'cross' });
        break;
      case 'Backspace':
      case 'Delete':
        if (marks[focusCell] === MARK_QUEEN) emit({ type: 'tap', cell: focusCell });
        else if (marks[focusCell] === MARK_CROSS) emit({ type: 'paint', cells: [focusCell], mode: 'erase' });
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  const stateLabel = (cell: number) => {
    const m = marks[cell];
    const base = m === MARK_QUEEN ? (conflictSet.has(cell) ? t('game.cell.conflict') : t('game.cell.queen')) : m === MARK_CROSS ? t('game.cell.cross') : t('game.cell.empty');
    return highlight?.reveal === cell ? `${base}, ${t('game.cell.hinted')}` : base;
  };

  return (
    <div className={`qb${celebrate ? ' qb--celebrate' : ''}${disabled ? ' qb--disabled' : ''}`} style={{ ['--qb-n' as string]: n }}>
      <div
        ref={gridRef}
        className="qb__grid"
        role="grid"
        aria-label={t('game.board', { n })}
        aria-disabled={disabled || undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => tracker.current.cancel()}
        onKeyDown={onKeyDown}
      >
        {Array.from({ length: n }, (_, r) => (
          <div key={r} role="row" className="qb__row">
            {Array.from({ length: n }, (_, c) => {
              const cell = r * n + c;
              const region = regionColors[puzzle.regions[cell]! % Math.max(1, regionColors.length)];
              return (
                <Cell
                  key={cell}
                  cell={cell}
                  row={r}
                  mark={marks[cell] ?? MARK_EMPTY}
                  fill={region?.fill ?? 'var(--md-sys-color-surface-container-high)'}
                  on={region?.on ?? 'var(--md-sys-color-on-surface)'}
                  pattern={patterns ? (region?.pattern ?? 0) : 0}
                  conflict={conflictSet.has(cell)}
                  attacked={attacked?.has(cell) ?? false}
                  focus={sets.focus.has(cell)}
                  target={sets.targets.has(cell)}
                  eliminate={sets.eliminate.has(cell)}
                  mistake={sets.mistakes.has(cell)}
                  reveal={highlight?.reveal === cell ? highlight.revealMark : null}
                  tabIndex={cell === focusCell ? 0 : -1}
                  label={t('game.cell.label', { row: r + 1, col: c + 1, state: stateLabel(cell) })}
                  celebrate={celebrate}
                  reduce={!!reduce}
                />
              );
            })}
          </div>
        ))}
      </div>
      <svg className="qb__lines" viewBox={`0 0 ${n} ${n}`} preserveAspectRatio="none" aria-hidden="true">
        <path className="qb__thin" d={thin} vectorEffect="non-scaling-stroke" />
        <path className="qb__thick" d={borders} vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
});

interface CellProps {
  readonly cell: number;
  readonly row: number;
  readonly mark: QueensMark;
  readonly fill: string;
  readonly on: string;
  readonly pattern: number;
  readonly conflict: boolean;
  readonly attacked: boolean;
  readonly focus: boolean;
  readonly target: boolean;
  readonly eliminate: boolean;
  readonly mistake: boolean;
  readonly reveal: 'queen' | 'cross' | null;
  readonly tabIndex: number;
  readonly label: string;
  readonly celebrate: boolean;
  readonly reduce: boolean;
}

const Cell = memo(function Cell(p: CellProps) {
  const cls = [
    'qb__cell',
    p.focus && 'qb__cell--focus',
    p.target && !p.focus && 'qb__cell--target',
    p.mistake && 'qb__cell--mistake',
    p.conflict && 'qb__cell--conflict',
    p.reveal && 'qb__cell--reveal',
    p.pattern > 0 && `qb__cell--pattern-${p.pattern}`,
  ]
    .filter(Boolean)
    .join(' ');
  const pop = p.reduce ? { duration: 0 } : SPRING_POP;
  return (
    <div
      role="gridcell"
      data-cell={p.cell}
      className={cls}
      tabIndex={p.tabIndex}
      aria-label={p.label}
      style={{ background: p.fill, color: p.on }}
    >
      <AnimatePresence initial={false}>
        {p.mark === MARK_QUEEN && (
          <motion.svg
            key="q"
            className="qb__queen"
            viewBox="0 0 24 24"
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
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.4, opacity: 0, transition: { duration: 0.1 } }}
            transition={p.reduce ? { duration: 0 } : SPRING_SOFT}
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </motion.svg>
        )}
      </AnimatePresence>
      {p.mark === MARK_EMPTY && p.attacked && <span className="qb__dot" aria-hidden="true" />}
      {p.mark === MARK_EMPTY && p.eliminate && (
        <svg className="qb__cross qb__cross--ghost" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      )}
      {p.reveal === 'queen' && p.mark !== MARK_QUEEN && (
        <svg className="qb__queen qb__queen--ghost" viewBox="0 0 24 24" aria-hidden="true">
          <path d={CROWN} />
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
