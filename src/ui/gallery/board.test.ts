import { describe, expect, it } from 'vitest';
import { demoBoard } from './board';

describe('demoBoard (plateau de la galerie)', () => {
  it.each([6, 7, 8, 9, 10])('n=%i : n régions connexes étiquetées dans l’ordre de lecture, une reine par ligne et colonne', (n) => {
    const board = demoBoard(n);
    expect(board.regions).toHaveLength(n * n);
    // Étiquettes 0..n-1 apparaissant dans l'ordre de première rencontre.
    const seen: number[] = [];
    for (const r of board.regions) if (!seen.includes(r)) seen.push(r);
    expect(seen).toEqual(Array.from({ length: n }, (_, i) => i));
    // Régions connexes.
    for (let region = 0; region < n; region++) {
      const cells = board.regions.flatMap((r, i) => (r === region ? [i] : []));
      const stack = [cells[0] as number];
      const reached = new Set(stack);
      while (stack.length) {
        const cell = stack.pop() as number;
        const r = Math.floor(cell / n);
        const c = cell % n;
        for (const [rr, cc] of [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]] as const) {
          const next = rr * n + cc;
          if (rr >= 0 && rr < n && cc >= 0 && cc < n && board.regions[next] === region && !reached.has(next)) {
            reached.add(next);
            stack.push(next);
          }
        }
      }
      expect(reached.size, `région ${region}`).toBe(cells.length);
    }
    // Reines : une par colonne, deux reines de lignes voisines jamais en contact.
    expect(new Set(board.queens).size).toBe(n);
    board.queens.forEach((c, r) => {
      if (r > 0) expect(Math.abs(c - (board.queens[r - 1] as number))).toBeGreaterThan(1);
    });
  });

  it('est déterministe', () => {
    expect(demoBoard(8, 3)).toEqual(demoBoard(8, 3));
    expect(demoBoard(8, 3)).not.toEqual(demoBoard(8, 4));
  });
});
