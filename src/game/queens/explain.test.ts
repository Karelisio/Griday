import i18next from 'i18next';
import { beforeAll, describe, expect, it } from 'vitest';
import { addDays } from '../../../engine/core/date';
import { getDailyPuzzle } from '../../../engine/index';
import { getQueensHint } from '../../../engine/queens/hint';
import { MARK_QUEEN, type QueensMark } from '../../../engine/queens/types';
import en from '../../../locales/en.json';
import fr from '../../../locales/fr.json';
import { explainHint } from './explain';
import { MARK_CROSS, emptyMarks } from './marks';

const i18n = i18next.createInstance();
beforeAll(async () => {
  await i18n.init({ resources: { fr: { translation: fr }, en: { translation: en } }, lng: 'fr', interpolation: { escapeValue: false } });
});

describe('explications des indices', () => {
  it('toutes les techniques rencontrées ont un titre et un texte complets en FR et EN', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 70; i++) {
      const p = getDailyPuzzle(addDays('2026-10-05', i)).puzzle;
      // Partie suivie indice après indice : chaque étape de la résolution est expliquée.
      let marks: QueensMark[] = emptyMarks(p);
      for (let guard = 0; guard < 4 * p.size * p.size; guard++) {
        const hint = getQueensHint(p, marks);
        for (const lng of ['fr', 'en'] as const) {
          const t = i18n.getFixedT(lng);
          const ex = explainHint(hint, p, lng, (key, n) => t(key, { n }));
          seen.add(ex.textKey);
          for (const key of [ex.titleKey, ex.textKey]) {
            expect(i18n.exists(key, { lng, ...ex.params }), `${lng} ${key}`).toBe(true);
          }
          const text = t(ex.textKey, ex.params);
          expect(text, `${lng} ${ex.textKey}`).not.toMatch(/\{\{|undefined|NaN/);
          expect(text.length).toBeGreaterThan(20);
        }
        if (hint.kind !== 'step' && hint.kind !== 'reveal') break;
        marks = [...marks];
        marks[hint.reveal.cell] = hint.reveal.mark === 'queen' ? MARK_QUEEN : MARK_CROSS;
      }
    }
    // Couverture : les familles principales apparaissent sur dix semaines de puzzles du jour.
    for (const key of ['hint.queens.single.region', 'hint.queens.attack', 'hint.queens.solved']) expect(seen).toContain(key);
    expect([...seen].some((k) => k.startsWith('hint.queens.locked.'))).toBe(true);
    expect([...seen].some((k) => k.startsWith('hint.queens.region-line.') || k.startsWith('hint.queens.line-region.'))).toBe(true);
    expect(seen).toContain('hint.queens.contradiction');
  });

  it('erreurs : cases signalées et texte au pluriel', () => {
    const p = getDailyPuzzle('2026-10-05').puzzle;
    const marks = emptyMarks(p);
    const wrong = [0, 1, 2, 3].find((c) => p.solution[0] !== c)!;
    marks[wrong] = MARK_QUEEN;
    const hint = getQueensHint(p, marks);
    const t = i18n.getFixedT('fr');
    const ex = explainHint(hint, p, 'fr', (key, n) => t(key, { n }));
    expect(ex.highlight.mistakes).toEqual([wrong]);
    expect(t(ex.textKey, ex.params)).toContain('Une case est fausse');
  });
});
