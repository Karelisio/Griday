/** Marques du joueur : encodage compact (persistance) et cases interdites par les reines posées. */
import { MARK_CROSS, MARK_EMPTY, MARK_QUEEN, type QueensMark, type QueensPuzzle } from '../../../engine/queens/types';

export function emptyMarks(p: QueensPuzzle): QueensMark[] {
  return new Array<QueensMark>(p.size * p.size).fill(MARK_EMPTY);
}

/** « 0 », « 1 », « 2 » par case. */
export function encodeMarks(marks: readonly QueensMark[]): string {
  return marks.join('');
}

export function decodeMarks(code: string, p: QueensPuzzle): QueensMark[] | null {
  if (code.length !== p.size * p.size || !/^[012]*$/.test(code)) return null;
  return Array.from(code, (ch) => Number(ch) as QueensMark);
}

/** Cases interdites par au moins une reine (même ligne, colonne, région, ou voisine), hors reines. */
export function attackedCells(p: QueensPuzzle, marks: readonly QueensMark[]): Set<number> {
  const n = p.size;
  const out = new Set<number>();
  marks.forEach((m, q) => {
    if (m !== MARK_QUEEN) return;
    const qr = Math.floor(q / n);
    const qc = q % n;
    for (let cell = 0; cell < n * n; cell++) {
      if (cell === q || marks[cell] === MARK_QUEEN) continue;
      const r = Math.floor(cell / n);
      const c = cell % n;
      if (r === qr || c === qc || p.regions[cell] === p.regions[q] || (Math.abs(r - qr) <= 1 && Math.abs(c - qc) <= 1)) {
        out.add(cell);
      }
    }
  });
  return out;
}

export { MARK_CROSS, MARK_EMPTY, MARK_QUEEN };
