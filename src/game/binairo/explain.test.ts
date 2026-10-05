import i18next from 'i18next';
import { beforeAll, describe, expect, it } from 'vitest';
import { BINAIRO_DEFINITION } from '../../../engine/binairo';
import { getBinairoHint, type BinairoHint, type BinairoStep, type BinairoTechnique } from '../../../engine/binairo/hint';
import { CELL_A, CELL_B, type BinairoCell, type BinairoSolvedPuzzle } from '../../../engine/binairo/types';
import { rngFromString } from '../../../engine/core/prng';
import type { DifficultyTier } from '../../../engine/core/types';
import en from '../../../locales/en.json';
import fr from '../../../locales/fr.json';
import { ICON_PATHS } from '../../ui/icons.generated';
import {
  NO_HIGHLIGHT,
  explainHint,
  highlightFocus,
  hintApplyIcon,
  hintKey,
  hintMoves,
  isBinairoHighlight,
  lineCells,
  type BinairoHighlight,
  type Translate,
} from './explain';
import { BINAIRO_RULES } from './rules';

const i18n = i18next.createInstance();
beforeAll(async () => {
  await i18n.init({ resources: { fr: { translation: fr }, en: { translation: en } }, lng: 'fr', interpolation: { escapeValue: false } });
});

const translator = (lng: 'fr' | 'en'): Translate => {
  const t = i18n.getFixedT(lng);
  return (key, params) => String(t(key, params as never));
};

/** Grille générée par le moteur V1 (déterministe) pour une taille et un palier. */
function puzzleFor(size: number, tier: DifficultyTier, seed: string): BinairoSolvedPuzzle {
  const gen = BINAIRO_DEFINITION.versions[1]!;
  for (let k = 0; k < 400; k++) {
    const r = gen.attempt(rngFromString(`${seed}#${size}#${tier}#${k}`), { size, tier });
    if (r) return r.puzzle;
  }
  throw new Error(`aucune grille ${size}/${tier}`);
}

/** Joue les indices en boucle jusqu'à la victoire (au plus 2 n² tours) ; chaque indice est transmis à `visit`. */
function solveByHints(p: BinairoSolvedPuzzle, visit: (hint: BinairoHint, marks: BinairoCell[]) => void): BinairoCell[] {
  let marks: BinairoCell[] = [...p.givens];
  for (let guard = 0; guard < 2 * p.size * p.size; guard++) {
    const hint = getBinairoHint(p, marks);
    visit(hint, marks);
    if (hint.kind === 'solved') return marks;
    marks = [...marks];
    for (const m of hintMoves(hint)) marks[m.cell] = m.mark as BinairoCell;
  }
  throw new Error('la grille n’est pas résolue par les indices');
}

const step = (technique: BinairoTechnique, over: Partial<BinairoStep> = {}): BinairoStep => ({
  technique,
  level: 1,
  place: [{ cell: 4, value: CELL_B }],
  cells: [2, 3],
  line: { kind: 'row', index: 2 },
  other: null,
  ...over,
});
const asHint = (s: BinairoStep): BinairoHint => ({ kind: 'step', step: s, reveal: s.place[0]! });
const P6 = puzzleFor(6, 1, 'explain-p6');
const text = (lng: 'fr' | 'en', hint: BinairoHint, p = P6) => {
  const ex = explainHint(hint, p, translator(lng));
  return String(i18n.getFixedT(lng)(ex.textKey, ex.params as never));
};

describe('explications des indices', () => {
  it('toutes les techniques rencontrées ont un titre et un texte complets en FR et EN', () => {
    const seen = new Set<string>();
    const titles = new Set<string>();
    for (const [size, tier] of [
      [6, 1], [6, 2], [6, 3], [6, 4],
      [8, 1], [8, 2], [8, 3], [8, 4],
      [10, 2], [10, 3], [10, 4],
      [12, 4],
    ] as const) {
      for (const seed of ['a', 'b']) {
        const p = puzzleFor(size, tier, `explain-${seed}`);
        solveByHints(p, (hint) => {
          for (const lng of ['fr', 'en'] as const) {
            const t = i18n.getFixedT(lng);
            const ex = explainHint(hint, p, translator(lng));
            seen.add(ex.textKey);
            titles.add(ex.titleKey);
            for (const key of [ex.titleKey, ex.textKey]) {
              expect(i18n.exists(key, { lng, ...ex.params }), `${lng} ${key}`).toBe(true);
            }
            const out = String(t(ex.textKey, ex.params as never));
            expect(out, `${lng} ${ex.textKey}`).not.toMatch(/\{\{|undefined|NaN|\[object/);
            expect(out.length).toBeGreaterThan(20);
            expect(t(ex.titleKey)).not.toBe(ex.titleKey);
          }
        });
      }
    }
    // Couverture : sur ces grilles, toutes les techniques du moteur V1 apparaissent.
    for (const key of [
      'hint.binairo.pair.row',
      'hint.binairo.pair.column',
      'hint.binairo.sandwich',
      'hint.binairo.count',
      'hint.binairo.line',
      'hint.binairo.unique',
      'hint.binairo.contradiction.rule',
      'hint.binairo.solved',
    ]) {
      expect(seen, key).toContain(key);
    }
    for (const key of ['pair', 'sandwich', 'count', 'line', 'unique'].map((t) => `hint.binairo.title.${t}`)) expect(titles, key).toContain(key);
    expect(titles).toContain('hint.technique.contradiction');
  });

  it('les pluriels et les variantes ligne / colonne existent dans les deux langues', () => {
    // Une clé par technique, par genre de ligne et par pluriel : aucune ne manque, aucune n'est vide.
    const keys = [
      ...['row', 'column'].flatMap((k) => ['one', 'other'].map((p) => `hint.binairo.pair.${k}_${p}`)),
      ...['one', 'other'].flatMap((p) => ['count', 'line', 'unique', 'mistake'].map((k) => `hint.binairo.${k}_${p}`)),
      'hint.binairo.sandwich',
      'hint.binairo.contradiction.rule',
      'hint.binairo.contradiction.twins',
      'hint.binairo.reveal',
      'hint.binairo.solved',
      ...['sun', 'moon'].flatMap((s) => ['one', 'other'].map((p) => `puzzle.binairo.symbol.${s}_${p}`)),
      'puzzle.binairo.symbol.aSun',
      'puzzle.binairo.symbol.aMoon',
    ];
    for (const lng of ['fr', 'en'] as const) {
      for (const key of keys) expect(String(i18n.getResource(lng, 'translation', key) ?? ''), `${lng} ${key}`).not.toBe('');
    }
  });

  it('les surbrillances sont cohérentes avec l’étape : lignes, pivots et cases à remplir', () => {
    for (const [size, tier] of [[6, 3], [8, 4], [10, 4]] as const) {
      const p = puzzleFor(size, tier, 'explain-hl');
      const n = p.size;
      solveByHints(p, (hint, marks) => {
        if (hint.kind !== 'step') return;
        const hl = explainHint(hint, p, translator('fr')).highlight;
        const inGrid = (cells: readonly number[]) => cells.every((c) => Number.isInteger(c) && c >= 0 && c < n * n);
        expect(isBinairoHighlight(hl)).toBe(true);
        for (const cells of [hl.line, hl.other, hl.pivots, hl.mistakes, hl.places.map((x) => x.cell)]) expect(inGrid(cells)).toBe(true);
        expect(hl.line).toHaveLength(n);
        // Les cases à remplir sont vides avant l'étape, jamais données, et justes d'après la solution.
        for (const { cell, value } of hl.places) {
          expect(marks[cell], `case ${cell}`).toBe(0);
          expect(value, `case ${cell}`).toBe(p.solution[cell]);
        }
        const tech = hint.step.technique;
        if (tech === 'pair' || tech === 'sandwich' || tech === 'count') {
          expect(hl.pivots.length).toBeGreaterThan(0);
          expect(hl.pivots.every((c) => hl.line.includes(c))).toBe(true);
          expect(hl.places.every((x) => hl.line.includes(x.cell))).toBe(true);
          // Le texte parle des symboles « connus » : ce sont bien ceux des pivots, l'opposé du symbole posé.
          const placed = hl.places[0]!.value;
          const known = placed === CELL_A ? CELL_B : CELL_A;
          expect(hl.places.every((x) => x.value === placed)).toBe(true);
          for (const c of hl.pivots) expect(marks[c], `pivot ${c}`).toBe(known);
          const stride = hint.step.line!.kind === 'row' ? 1 : n;
          if (tech === 'pair') {
            expect(hl.pivots).toHaveLength(2);
            expect(hl.pivots[1]! - hl.pivots[0]!).toBe(stride); // deux cases voisines…
            for (const { cell } of hl.places) expect([hl.pivots[0]! - stride, hl.pivots[1]! + stride]).toContain(cell); // …et les cases qui les bordent
          }
          if (tech === 'sandwich') {
            expect(hl.pivots).toHaveLength(2);
            expect(hl.places).toHaveLength(1);
            expect(hl.places[0]!.cell).toBe(hl.pivots[0]! + stride); // la case du milieu
            expect(hl.pivots[1]! - hl.pivots[0]!).toBe(2 * stride);
          }
          if (tech === 'count') {
            expect(hl.pivots).toHaveLength(n / 2); // « la moitié des cases »
            expect(hl.places.map((x) => x.cell)).toEqual(hl.line.filter((c) => marks[c] === 0)); // toutes les cases vides de la ligne
          }
        } else {
          expect(hl.pivots).toEqual([]);
        }
        if (tech === 'unique') {
          expect(hl.other).toHaveLength(n);
          expect(hl.line.some((c) => hl.other.includes(c))).toBe(false);
        }
        if (tech !== 'unique' && tech !== 'contradiction') expect(hl.other).toEqual([]);
        expect(hl.mistakes).toEqual([]);
        expect(highlightFocus(hl).length).toBeGreaterThan(0);
      });
    }
  });

  it('texte français d’une paire : l’exemple de référence', () => {
    // Deux soleils côte à côte dans la ligne 3 → les cases qui les bordent sont des lunes.
    const hint = asHint(step('pair', { place: [{ cell: 13, value: CELL_B }, { cell: 16, value: CELL_B }], cells: [14, 15], line: { kind: 'row', index: 2 } }));
    expect(text('fr', hint)).toBe(
      'Deux soleils côte à côte dans la ligne 3\u00a0: on ne peut pas en aligner trois. Les cases qui les bordent sont donc forcément des lunes.',
    );
    expect(text('en', hint)).toBe(
      'Two suns side by side in row 3: a third one would make three in a row. The cells on either side of them must be moons.',
    );
  });

  it('paire : singulier ou pluriel, ligne ou colonne, soleil ou lune', () => {
    const one = asHint(step('pair', { place: [{ cell: 4, value: CELL_A }], cells: [2, 3], line: { kind: 'row', index: 0 } }));
    expect(text('fr', one)).toBe(
      'Deux lunes côte à côte dans la ligne 1\u00a0: on ne peut pas en aligner trois. La case qui les borde est donc forcément un soleil.',
    );
    expect(text('en', one)).toBe('Two moons side by side in row 1: a third one would make three in a row. The cell next to them must be a sun.');
    const col = asHint(step('pair', { place: [{ cell: 6, value: CELL_B }, { cell: 24, value: CELL_B }], cells: [12, 18], line: { kind: 'column', index: 0 } }));
    expect(text('fr', col)).toBe(
      'Deux soleils qui se suivent dans la colonne 1\u00a0: on ne peut pas en aligner trois. Les cases qui les bordent sont donc forcément des lunes.',
    );
    expect(text('en', col)).toBe(
      'Two suns stacked in column 1: a third one would make three in a row. The cells above and below them must be moons.',
    );
    const colOne = asHint(step('pair', { place: [{ cell: 6, value: CELL_B }], cells: [12, 18], line: { kind: 'column', index: 4 } }));
    expect(text('fr', colOne)).toContain('La case qui les borde est donc forcément une lune.');
    expect(text('en', colOne)).toContain('The cell next to them must be a moon.');
  });

  it('sandwich, quota, analyse de ligne, lignes différentes et absurde : textes et paramètres', () => {
    const sandwich = asHint(step('sandwich', { place: [{ cell: 15, value: CELL_A }], cells: [14, 16], line: { kind: 'row', index: 2 } }));
    expect(text('fr', sandwich)).toBe(
      'Dans la ligne 3, une case vide est coincée entre deux lunes\u00a0: y mettre une lune ferait trois lunes d’affilée. Elle contient donc un soleil.',
    );
    expect(text('en', sandwich)).toBe(
      'In row 3, an empty cell is squeezed between two moons: putting a moon there would make three moons in a row. It must hold a sun.',
    );

    const many = asHint(step('count', { place: [{ cell: 1, value: CELL_B }, { cell: 2, value: CELL_B }], cells: [0, 3, 4], line: { kind: 'column', index: 5 } }));
    expect(text('fr', many)).toBe(
      'Dans la colonne 6, il y a déjà 3 soleils, la moitié des cases. Comme il faut autant de soleils que de lunes, chaque case vide restante contient une lune.',
    );
    expect(text('en', many)).toBe(
      'In column 6 there are already 3 suns, half of the cells. Since there must be as many suns as moons, every remaining empty cell holds a moon.',
    );
    const last = asHint(step('count', { place: [{ cell: 1, value: CELL_A }], cells: [0, 3, 4], line: { kind: 'row', index: 0 } }));
    expect(text('fr', last)).toBe(
      'Dans la ligne 1, il y a déjà 3 lunes, la moitié des cases. Comme il faut autant de lunes que de soleils, la dernière case vide contient un soleil.',
    );

    const line = asHint(step('line', { place: [{ cell: 1, value: CELL_A }, { cell: 5, value: CELL_B }], cells: [0], line: { kind: 'row', index: 3 } }));
    expect(text('fr', line)).toContain('Dans la ligne 4, essayez toutes les façons');
    expect(text('fr', line)).toContain('Ce sont les cases marquées.');
    expect(text('fr', asHint(step('line', { place: [{ cell: 1, value: CELL_A }] })))).toContain('C’est la case marquée.');

    const unique = asHint(
      step('unique', { place: [{ cell: 1, value: CELL_A }], cells: [6, 7, 8, 9, 10, 11], line: { kind: 'row', index: 0 }, other: { kind: 'row', index: 1 } }),
    );
    expect(text('fr', unique)).toBe(
      'Deux lignes ou deux colonnes ne sont jamais identiques. Dans la ligne 1, les cases vides ne peuvent pas toutes reprendre les symboles de la ligne 2, qui est complète\u00a0: cela impose le symbole de la case marquée.',
    );
    expect(text('en', unique)).toContain('In row 1, the empty cells cannot all copy the symbols of row 2');

    const rule = asHint(step('contradiction', { place: [{ cell: 9, value: CELL_B }], cells: [10, 11], line: { kind: 'column', index: 2 } }));
    expect(text('fr', rule)).toBe(
      'Supposons un soleil dans la case marquée\u00a0: en enchaînant les déductions simples, on enfreindrait une règle dans la colonne 3. C’est impossible, donc cette case contient une lune.',
    );
    expect(text('en', rule)).toBe(
      'Suppose the marked cell held a sun: following the simple deductions, a rule would be broken in column 3. That is impossible, so this cell holds a moon.',
    );
    const twins = asHint(step('contradiction', { place: [{ cell: 9, value: CELL_A }], cells: [], line: { kind: 'row', index: 1 }, other: { kind: 'row', index: 4 } }));
    expect(text('fr', twins)).toContain('la ligne 2 et la ligne 5 deviendraient identiques');
    expect(text('fr', twins)).toContain('Supposons une lune dans la case marquée');
    expect(text('en', twins)).toContain('row 2 and row 5 would end up identical');
    expect(explainHint(twins, P6, translator('fr')).textKey).toBe('hint.binairo.contradiction.twins');
    expect(explainHint(twins, P6, translator('fr')).titleKey).toBe('hint.technique.contradiction');
  });

  it('« Jouer ce coup » applique toute la déduction ; jouer les indices en boucle résout la grille', () => {
    for (const [size, tier] of [[6, 1], [6, 4], [8, 2], [8, 3], [10, 4]] as const) {
      const p = puzzleFor(size, tier, 'explain-loop');
      const keys = new Set<string>();
      let moves = 0;
      const marks = solveByHints(p, (hint, current) => {
        if (hint.kind === 'solved') return;
        const key = hintKey(hint);
        expect(keys.has(key), key).toBe(false); // chaque indice apporte une déduction nouvelle
        keys.add(key);
        const played = hintMoves(hint);
        expect(played.length).toBeGreaterThan(0);
        for (const m of played) {
          expect(current[m.cell], `case ${m.cell} vide avant`).toBe(0);
          expect(m.mark, `case ${m.cell} juste`).toBe(p.solution[m.cell]);
          moves++;
        }
        if (hint.kind === 'step') expect(played.map((m) => m.cell)).toEqual(hint.step.place.map((x) => x.cell));
      });
      expect(moves).toBe(p.givens.filter((g) => g === 0).length);
      expect(BINAIRO_RULES.check(p, marks)).toEqual({ conflicts: [], solved: true });
      expect(marks).toEqual([...p.solution]);
    }
  });

  it('indice sur une grille résolue', () => {
    const hint = getBinairoHint(P6, [...P6.solution]);
    expect(hint).toEqual({ kind: 'solved' });
    const ex = explainHint(hint, P6, translator('fr'));
    expect(ex).toMatchObject({ titleKey: 'hint.technique.solved', textKey: 'hint.binairo.solved', highlight: NO_HIGHLIGHT });
    expect(hintMoves(hint)).toEqual([]);
    expect(hintKey(hint)).toBe('solved');
    expect(text('fr', hint)).toBe('La grille est déjà résolue\u202f!');
  });
});

describe('erreurs et coup de pouce', () => {
  it('une erreur se corrige en vidant les cases fausses ; cases encadrées, texte au singulier puis au pluriel', () => {
    const p = puzzleFor(6, 1, 'explain-mistake');
    const free = p.givens.flatMap((g, i) => (g === 0 ? [i] : []));
    const wrong = (cell: number) => (p.solution[cell] === CELL_A ? CELL_B : CELL_A);
    const marks: BinairoCell[] = [...p.givens];
    marks[free[0]!] = wrong(free[0]!);
    let hint = getBinairoHint(p, marks);
    expect(hint).toEqual({ kind: 'mistake', cells: [free[0]] });
    expect(hintMoves(hint)).toEqual([{ cell: free[0], mark: 0 }]);
    let ex = explainHint(hint, p, translator('fr'));
    expect(ex.highlight.mistakes).toEqual([free[0]]);
    expect(ex.titleKey).toBe('hint.technique.mistake');
    expect(text('fr', hint, p)).toBe('Une case est fausse\u00a0: elle est encadrée sur la grille. Corrigez-la avant de continuer.');
    expect(text('en', hint, p)).toBe('One cell is wrong: it is outlined on the grid. Fix it before going on.');
    expect(hintApplyIcon(hint)).toBe('backspace');
    expect(highlightFocus(ex.highlight)).toEqual([free[0]]);

    marks[free[3]!] = wrong(free[3]!);
    hint = getBinairoHint(p, marks);
    ex = explainHint(hint, p, translator('fr'));
    expect(ex.highlight.mistakes).toEqual([free[0], free[3]]);
    expect(text('fr', hint, p)).toBe('2 cases sont fausses\u00a0: elles sont encadrées sur la grille. Corrigez-les avant de continuer.');
    expect(text('en', hint, p)).toBe('2 cells are wrong: they are outlined on the grid. Fix them before going on.');
    // Appliquer la correction vide les deux cases, et l'indice suivant repart de la déduction.
    const fixed: BinairoCell[] = [...marks];
    for (const m of hintMoves(hint)) fixed[m.cell] = m.mark as BinairoCell;
    expect(fixed).toEqual([...p.givens]);
    expect(getBinairoHint(p, fixed).kind).toBe('step');
  });

  it('une marque posée sur une case donnée est ignorée (jamais une erreur)', () => {
    const given = P6.givens.findIndex((g) => g !== 0);
    const marks: BinairoCell[] = [...P6.givens];
    marks[given] = P6.givens[given] === CELL_A ? CELL_B : CELL_A;
    expect(getBinairoHint(P6, marks).kind).toBe('step');
  });

  it('coup de pouce sans déduction : la case est dévoilée avec son symbole', () => {
    const hint: BinairoHint = { kind: 'reveal', reveal: { cell: 7, value: CELL_B } };
    const ex = explainHint(hint, P6, translator('fr'));
    expect(ex).toMatchObject({ titleKey: 'hint.technique.reveal', textKey: 'hint.binairo.reveal' });
    expect(ex.highlight).toEqual({ ...NO_HIGHLIGHT, places: [{ cell: 7, value: CELL_B }] });
    expect(text('fr', hint)).toBe('Aucune déduction simple ici\u00a0: la case marquée contient une lune dans la solution.');
    expect(text('en', { kind: 'reveal', reveal: { cell: 7, value: CELL_A } })).toBe(
      'No simple deduction here: the marked cell holds a sun in the solution.',
    );
    expect(hintMoves(hint)).toEqual([{ cell: 7, mark: CELL_B }]);
    expect(hintKey(hint)).toBe('reveal:7=2');
    expect(hintApplyIcon(hint)).toBe('dark_mode');
    expect(hintApplyIcon({ kind: 'reveal', reveal: { cell: 7, value: CELL_A } })).toBe('light_mode');
  });
});

describe('identité, surbrillance et icône', () => {
  it('hintKey : même déduction = même clé, déductions différentes = clés différentes', () => {
    const a = asHint(step('pair', { place: [{ cell: 4, value: CELL_B }] }));
    expect(hintKey(a)).toBe('step:pair:4=2');
    expect(hintKey(asHint(step('pair', { place: [{ cell: 4, value: CELL_B }], cells: [1, 2] })))).toBe(hintKey(a));
    expect(hintKey(asHint(step('pair', { place: [{ cell: 4, value: CELL_A }] })))).not.toBe(hintKey(a));
    expect(hintKey(asHint(step('sandwich', { place: [{ cell: 4, value: CELL_B }] })))).not.toBe(hintKey(a));
    expect(hintKey({ kind: 'mistake', cells: [3, 9] })).toBe('mistake:3,9');
  });

  it('hintApplyIcon : le symbole posé, une coche pour deux sortes, une gomme pour une erreur — icônes qui existent', () => {
    const sun = asHint(step('count', { place: [{ cell: 1, value: CELL_A }, { cell: 2, value: CELL_A }] }));
    const moon = asHint(step('count', { place: [{ cell: 1, value: CELL_B }] }));
    const both = asHint(step('line', { place: [{ cell: 1, value: CELL_A }, { cell: 2, value: CELL_B }] }));
    expect(hintApplyIcon(sun)).toBe('light_mode');
    expect(hintApplyIcon(moon)).toBe('dark_mode');
    expect(hintApplyIcon(both)).toBe('check');
    expect(hintApplyIcon({ kind: 'solved' })).toBe('check');
    for (const icon of [hintApplyIcon(sun), hintApplyIcon(moon), hintApplyIcon(both), 'backspace', 'contrast'] as const) expect(ICON_PATHS[icon], icon).toBeDefined();
  });

  it('highlightFocus : cases de l’indice, sans doublon, triées', () => {
    const hl: BinairoHighlight = { line: [8, 9], other: [2, 3], pivots: [9], places: [{ cell: 8, value: CELL_A }], mistakes: [3, 20] };
    expect(highlightFocus(hl)).toEqual([2, 3, 8, 9, 20]);
    expect(highlightFocus(NO_HIGHLIGHT)).toEqual([]);
  });

  it('lineCells : rangée ou colonne, dans l’ordre', () => {
    expect(lineCells(6, { kind: 'row', index: 2 })).toEqual([12, 13, 14, 15, 16, 17]);
    expect(lineCells(6, { kind: 'column', index: 2 })).toEqual([2, 8, 14, 20, 26, 32]);
    expect(lineCells(6, null)).toEqual([]);
  });

  it('isBinairoHighlight : accepte les surbrillances Binairo, refuse le reste', () => {
    expect(isBinairoHighlight(NO_HIGHLIGHT)).toBe(true);
    expect(isBinairoHighlight({ ...NO_HIGHLIGHT, places: [{ cell: 1, value: 2 }] })).toBe(true);
    const bad: unknown[] = [
      null,
      undefined,
      3,
      'x',
      [],
      {},
      { focus: [1], targets: [] },
      { ...NO_HIGHLIGHT, line: 'x' },
      { ...NO_HIGHLIGHT, places: [{ cell: 1, value: 3 }] },
      { ...NO_HIGHLIGHT, places: [1] },
      { ...NO_HIGHLIGHT, pivots: [1.5] },
    ];
    for (const value of bad) expect(isBinairoHighlight(value), JSON.stringify(value)).toBe(false);
  });
});
