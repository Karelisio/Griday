import { CELL_A, CELL_B, CELL_EMPTY, type BinairoCell, type BinairoPuzzle } from './types';

export interface BinairoBoardCheck {
  /**
   * Cases impliquées dans une règle enfreinte (données comprises), triées :
   * suites de 3 symboles identiques ou plus ; symbole en excès (seulement si la ligne en compte plus de n/2 :
   * toutes ses cases de ce symbole) ; lignes (ou colonnes) complètes identiques (toutes leurs cases).
   */
  readonly violations: readonly number[];
  /** Cases remplies, données comprises. */
  readonly filled: number;
  /** Grille pleine, aucune violation, données respectées : la solution étant unique, c'est LA solution. */
  readonly solved: boolean;
}

/**
 * Vérifie un état joueur : n² marques valant 0, 1 ou 2 (et des données de même longueur).
 * Convention de lecture commune (rules, hint) : une case donnée vaut toujours sa donnée ; la marque posée
 * dessus est ignorée (0 ou égale à la donnée attendue ; sinon `solved` est faux).
 */
export function assertBinairoMarks(p: BinairoPuzzle, marks: readonly BinairoCell[]): void {
  const n = p.size;
  if (!Number.isInteger(n) || n < 1) throw new RangeError(`Binairo : taille invalide ${String(n)}`);
  if (p.givens.length !== n * n) throw new RangeError(`Binairo : ${p.givens.length} données pour ${n * n} cases`);
  if (marks.length !== n * n) throw new RangeError(`Binairo : ${marks.length} marques pour ${n * n} cases`);
  for (let i = 0; i < marks.length; i++) {
    const m = marks[i];
    if (m !== CELL_EMPTY && m !== CELL_A && m !== CELL_B) throw new RangeError(`Binairo : marque invalide ${String(m)} (case ${i})`);
  }
}

/** Grille vue par le joueur : donnée si présente, sinon sa marque. */
export function binairoBoard(p: BinairoPuzzle, marks: readonly BinairoCell[]): BinairoCell[] {
  return marks.map((m, i) => (p.givens[i] !== CELL_EMPTY ? p.givens[i]! : m));
}

/** Cases de la ligne `index` (rangée si `column` est faux), dans l'ordre. */
function lineCells(n: number, column: boolean, index: number): number[] {
  return Array.from({ length: n }, (_, k) => (column ? k * n + index : index * n + k));
}

/** Ajoute à `out` les cases des règles 1 et 2 enfreintes dans une ligne. */
function lineViolations(board: readonly number[], cells: readonly number[], out: Set<number>): void {
  const n = cells.length;
  let start = 0;
  for (let k = 1; k <= n; k++) {
    if (k < n && board[cells[k]!] === board[cells[start]!]) continue;
    if (board[cells[start]!] !== CELL_EMPTY && k - start >= 3) {
      for (let j = start; j < k; j++) out.add(cells[j]!);
    }
    start = k;
  }
  for (const symbol of [CELL_A, CELL_B]) {
    const own = cells.filter((x) => board[x] === symbol);
    if (2 * own.length > n) for (const x of own) out.add(x);
  }
}

/** Ajoute les cases des lignes complètes identiques (règle 3), pour les rangées ou les colonnes. */
function duplicateViolations(board: readonly number[], n: number, column: boolean, out: Set<number>): void {
  const keys = new Map<string, number[]>();
  for (let i = 0; i < n; i++) {
    const cells = lineCells(n, column, i);
    if (cells.some((x) => board[x] === CELL_EMPTY)) continue;
    const key = cells.map((x) => board[x]).join('');
    const same = keys.get(key);
    if (same) {
      for (const x of same) out.add(x);
      for (const x of cells) out.add(x);
    } else keys.set(key, cells);
  }
}

/** Analyse l'état du joueur (détection de victoire et surlignage des règles enfreintes). */
export function checkBinairoBoard(p: BinairoPuzzle, marks: readonly BinairoCell[]): BinairoBoardCheck {
  assertBinairoMarks(p, marks);
  const n = p.size;
  const board = binairoBoard(p, marks);
  const bad = new Set<number>();
  for (const column of [false, true]) {
    for (let i = 0; i < n; i++) lineViolations(board, lineCells(n, column, i), bad);
    duplicateViolations(board, n, column, bad);
  }
  const violations = [...bad].sort((a, b) => a - b);
  const filled = board.filter((v) => v !== CELL_EMPTY).length;
  const givensRespected = p.givens.every((g, i) => g === CELL_EMPTY || marks[i] === CELL_EMPTY || marks[i] === g);
  return { violations, filled, solved: filled === n * n && violations.length === 0 && givensRespected };
}

/** Vrai si `solution` (n² valeurs 1 ou 2) respecte les données et les trois règles. */
export function isBinairoSolution(p: BinairoPuzzle, solution: readonly number[]): boolean {
  const n = p.size;
  if (!Number.isInteger(n) || n < 2 || n % 2 !== 0) return false;
  if (solution.length !== n * n || p.givens.length !== n * n) return false;
  for (let i = 0; i < n * n; i++) {
    const v = solution[i];
    if (v !== CELL_A && v !== CELL_B) return false;
    if (p.givens[i] !== CELL_EMPTY && p.givens[i] !== v) return false;
  }
  const bad = new Set<number>();
  for (const column of [false, true]) {
    for (let i = 0; i < n; i++) lineViolations(solution, lineCells(n, column, i), bad);
    duplicateViolations(solution, n, column, bad);
  }
  // Pleine et sans excès : chaque ligne compte exactement n/2 symboles de chaque sorte.
  return bad.size === 0;
}
