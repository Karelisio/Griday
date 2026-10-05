/**
 * Plateau de démonstration pour la galerie : n×n cases, n régions connexes, étiquetées dans l'ordre
 * de lecture (comme les régions du jeu), et une reine par ligne et par colonne. Déterministe.
 */
export interface DemoBoard {
  readonly size: number;
  /** Région de chaque case (ligne par ligne), numérotée dans l'ordre de première apparition. */
  readonly regions: readonly number[];
  /** Colonne de la reine de chaque ligne. */
  readonly queens: readonly number[];
}

function lcg(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

export function demoBoard(size: number, seed = 7): DemoBoard {
  const rand = lcg(seed * 2654435761 + size);
  // Reines : permutation sans voisinage diagonal (essais successifs, déterministes).
  let queens: number[] = [];
  for (let attempt = 0; attempt < 500; attempt++) {
    const cols = Array.from({ length: size }, (_, i) => i);
    for (let i = size - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [cols[i], cols[j]] = [cols[j] as number, cols[i] as number];
    }
    if (cols.every((c, r) => r === 0 || Math.abs(c - (cols[r - 1] as number)) > 1)) {
      queens = cols;
      break;
    }
  }
  if (queens.length === 0) queens = Array.from({ length: size }, (_, r) => (r * 2 + Math.floor((r * 2) / size)) % size);

  // Croissance des régions depuis chaque reine, case voisine au hasard.
  const cells = size * size;
  const owner = new Array<number>(cells).fill(-1);
  const frontier: number[][] = queens.map((c, r) => [r * size + c]);
  queens.forEach((c, r) => {
    owner[r * size + c] = r;
  });
  let filled = size;
  while (filled < cells) {
    const region = Math.floor(rand() * size);
    const list = frontier[region] as number[];
    if (list.length === 0) continue;
    const pick = Math.floor(rand() * list.length);
    const cell = list[pick] as number;
    const r = Math.floor(cell / size);
    const c = cell % size;
    const free = [
      [r - 1, c],
      [r + 1, c],
      [r, c - 1],
      [r, c + 1],
    ].filter(([rr, cc]) => (rr as number) >= 0 && (rr as number) < size && (cc as number) >= 0 && (cc as number) < size && owner[(rr as number) * size + (cc as number)] === -1);
    if (free.length === 0) {
      list.splice(pick, 1);
      continue;
    }
    const [nr, nc] = free[Math.floor(rand() * free.length)] as [number, number];
    owner[nr * size + nc] = region;
    list.push(nr * size + nc);
    filled++;
  }

  // Étiquettes dans l'ordre de lecture.
  const labels = new Map<number, number>();
  const regions = owner.map((o) => {
    if (!labels.has(o)) labels.set(o, labels.size);
    return labels.get(o) as number;
  });
  return { size, regions, queens };
}
