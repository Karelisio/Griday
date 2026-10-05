import { describe, expect, it } from 'vitest';
import en from './en.json';
import fr from './fr.json';

type Tree = { [k: string]: string | Tree };

function flatten(tree: Tree, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const [k, v] of Object.entries(tree)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') out.set(key, v);
    else for (const [kk, vv] of flatten(v, key)) out.set(kk, vv);
  }
  return out;
}

const vars = (s: string) => [...s.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]).sort();

describe('traductions', () => {
  const f = flatten(fr as Tree);
  const e = flatten(en as Tree);

  it('mêmes clés en français et en anglais', () => {
    expect([...f.keys()].sort()).toEqual([...e.keys()].sort());
  });

  it('aucun texte vide', () => {
    for (const [k, v] of [...f, ...e]) expect(v.trim(), k).not.toBe('');
  });

  it('mêmes variables d’interpolation dans les deux langues', () => {
    for (const [k, v] of f) expect(vars(v), k).toEqual(vars(e.get(k) ?? ''));
  });

  it('typographie française : espaces insécables (; ! ? : « » N° ×), apostrophe typographique', () => {
    for (const [k, v] of f) {
      expect(v, k).not.toMatch(/(^|[^\u202f])[;!?]/); // espace fine insécable (U+202F) avant ; ! ?
      expect(v, k).not.toMatch(/(^|[^\u00a0]):/); // espace insécable (U+00A0) avant :
      expect(v, k).not.toMatch(/« | »|[Nn]° | × /);
      expect(v, k).not.toMatch(/'/);
    }
  });

  it('anglais : apostrophe typographique, orthographe américaine', () => {
    for (const [k, v] of e) {
      expect(v, k).not.toMatch(/'/);
      expect(v, k).not.toMatch(/colour|favour|behaviour/i);
    }
  });
});
