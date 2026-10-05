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
});
