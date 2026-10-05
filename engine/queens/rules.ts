import { MARK_QUEEN, type QueensMark, type QueensPuzzle } from './types';

export interface QueensBoardCheck {
  /** Cases de reines en conflit (même ligne, colonne, région, ou contact), triées. */
  readonly conflicts: readonly number[];
  readonly queenCount: number;
  /** n reines, aucun conflit : grille résolue (la solution étant unique, c'est LA solution). */
  readonly solved: boolean;
}

function attacks(p: QueensPuzzle, a: number, b: number): boolean {
  const n = p.size;
  const ra = Math.floor(a / n);
  const ca = a % n;
  const rb = Math.floor(b / n);
  const cb = b % n;
  return (
    ra === rb ||
    ca === cb ||
    p.regions[a] === p.regions[b] ||
    (Math.abs(ra - rb) <= 1 && Math.abs(ca - cb) <= 1)
  );
}

/** Analyse l'état du joueur (détection de victoire et surlignage des conflits). */
export function checkQueensBoard(p: QueensPuzzle, marks: readonly QueensMark[]): QueensBoardCheck {
  const queens: number[] = [];
  marks.forEach((m, i) => {
    if (m === MARK_QUEEN) queens.push(i);
  });
  const conflict = new Set<number>();
  for (let i = 0; i < queens.length; i++) {
    for (let j = i + 1; j < queens.length; j++) {
      if (attacks(p, queens[i]!, queens[j]!)) {
        conflict.add(queens[i]!);
        conflict.add(queens[j]!);
      }
    }
  }
  const conflicts = [...conflict].sort((a, b) => a - b);
  return { conflicts, queenCount: queens.length, solved: queens.length === p.size && conflicts.length === 0 };
}

/** Vrai si `solution` (colonne par ligne) respecte toutes les règles. */
export function isQueensSolution(p: QueensPuzzle, solution: readonly number[]): boolean {
  const n = p.size;
  if (solution.length !== n) return false;
  const cells = solution.map((c, r) => r * n + c);
  if (solution.some((c) => !Number.isInteger(c) || c < 0 || c >= n)) return false;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (attacks(p, cells[i]!, cells[j]!)) return false;
    }
  }
  return true;
}
