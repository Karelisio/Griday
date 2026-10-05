import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAst } from 'rolldown/parseAst';
import { describe, expect, it } from 'vitest';

// Garde-fou : aucun texte destiné à l'utilisateur écrit en dur dans le JSX de l'app (tout passe par i18next).
// Analyse syntaxique réelle (parseur TSX de Vite/rolldown) : nœuds JSXText et attributs textuels sensibles.
const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const DIRS = ['screens', 'game', 'ui', 'archive', 'stats', 'share', 'daily', 'reminders'];
const files = [
  join(SRC, 'App.tsx'),
  ...DIRS.flatMap((d) =>
    readdirSync(join(SRC, d), { recursive: true, encoding: 'utf8' })
      .filter((f) => f.endsWith('.tsx') && !f.endsWith('.test.tsx') && !f.includes('gallery'))
      .map((f) => join(SRC, d, f)),
  ),
];
const TEXT_ATTRS = new Set(['aria-label', 'title', 'placeholder', 'alt', 'label']);

type Node = { type?: string; [k: string]: unknown };

function hardcoded(source: string): string[] {
  const out: string[] = [];
  const walk = (n: unknown): void => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) return n.forEach(walk);
    const node = n as Node;
    if (node.type === 'JSXText' && /\p{L}/u.test(String(node['value']))) out.push(String(node['value']).trim());
    if (node.type === 'JSXAttribute') {
      const name = (node['name'] as Node | undefined)?.['name'];
      const value = node['value'] as Node | null;
      if (typeof name === 'string' && TEXT_ATTRS.has(name) && value?.type === 'Literal' && /\p{L}/u.test(String(value['value']))) {
        out.push(`${name}="${String(value['value'])}"`);
      }
    }
    for (const [k, v] of Object.entries(node)) if (k !== 'parent') walk(v);
  };
  walk(parseAst(source, { lang: 'tsx' }));
  return out;
}

describe('aucun texte en dur dans le JSX', () => {
  it('le détecteur trouve bien les textes et attributs en dur', () => {
    expect(hardcoded('const a = <p aria-label="Fermer">Bonjour {x}<b>{t("k")}</b></p>;').sort()).toEqual(['Bonjour', 'aria-label="Fermer"']);
  });

  it.each(files.map((f) => [f.slice(SRC.length), f]))('%s', (_name, file) => {
    expect(hardcoded(readFileSync(file, 'utf8'))).toEqual([]);
  });
});
