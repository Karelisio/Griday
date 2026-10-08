/**
 * Règles d'un type de puzzle côté jeu (indépendantes de l'affichage) : ce que la session de jeu
 * générique doit savoir pour sauvegarder, réagir aux gestes, signaler les conflits et la victoire.
 */

/** Marque d'une case : 0 = vide ; 1 et 2 selon le type (Queens : croix, reine ; Binairo : symboles A, B). */
export type Mark = 0 | 1 | 2;

export interface GameRules<P> {
  /** Identité de la grille (sauvegardes) : deux grilles différentes n'ont jamais la même clé. */
  key(p: P): string;
  /** Nombre de cases (n²). */
  cells(p: P): number;
  /** Marques de départ (cases données comprises). */
  initial(p: P): Mark[];
  /** Marques de la solution (partie gagnée reconstituée sans sauvegarde). */
  solution(p: P): Mark[];
  /** Case donnée, jamais modifiable. */
  locked(p: P, cell: number): boolean;
  /** Cases en conflit à signaler, et victoire. */
  check(p: P, marks: readonly Mark[]): { readonly conflicts: readonly number[]; readonly solved: boolean };
  /** Marque après un toucher sur une case qui porte `mark`. */
  tap(mark: Mark): Mark;
  /**
   * Second toucher rapide : marque qui remplace l'effet du premier, d'après la marque d'avant
   * (`before`). Absent : un double toucher vaut deux touchers.
   */
  doubleTap?(before: Mark): Mark;
  /**
   * Après un toucher sur une case qui portait `before` : durée (ms) pendant laquelle une nouvelle
   * alerte attend un éventuel toucher suivant sur la même case (0 : signalée aussitôt).
   */
  conflictHoldAfterTap(before: Mark): number;
  /** Grille remplie (toutes les réponses posées), juste ou non. */
  filled(p: P, marks: readonly Mark[]): boolean;
}

/** Marques compactes : un chiffre par case. */
export const encodeMarks = (marks: readonly Mark[]): string => marks.join('');

export function decodeMarks(code: string, cells: number): Mark[] | null {
  if (code.length !== cells || !/^[012]*$/.test(code)) return null;
  return Array.from(code, (ch) => Number(ch) as Mark);
}

/** Règles neutres tant qu'aucune grille n'est chargée (la session reste vide). */
export const NO_RULES: GameRules<unknown> = {
  key: () => '',
  cells: () => 0,
  initial: () => [],
  solution: () => [],
  locked: () => false,
  check: () => ({ conflicts: [], solved: false }),
  tap: (m) => m,
  conflictHoldAfterTap: () => 0,
  filled: () => false,
};
