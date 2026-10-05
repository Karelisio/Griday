/// <reference types="node" />
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Règle de conception : aucun texte utilisateur en dur dans les composants (tout vient des props,
 * traduites par l'application). On inspecte les sources des composants (hors tests et galerie).
 */
const dir = dirname(fileURLToPath(import.meta.url));
const files = readdirSync(dir, { recursive: true, encoding: 'utf8' })
  .filter((f) => /\.tsx$/.test(f) && !/\.test\.tsx$/.test(f) && !f.startsWith('gallery'))
  .map((f) => ({ file: f, source: readFileSync(join(dir, f), 'utf8') }));

/** Retire commentaires et littéraux de gabarit pour ne garder que le JSX et les attributs. */
const code = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('aucun texte en dur dans src/ui', () => {
  it('trouve bien les composants', () => {
    expect(files.length).toBeGreaterThan(15);
  });

  it.each(files)('$file : pas de texte JSX littéral', ({ source }) => {
    // Texte entre balises : `>mot<`, hors expressions `{…}`.
    const jsxText = [...code(source).matchAll(/>\s*([A-Za-zÀ-ÿ][^<>{}\n]*[A-Za-zÀ-ÿ.!?:])\s*</g)].map((m) => m[1]);
    // Les génériques TypeScript (`Ref<HTMLButtonElement>`) ressemblent à du JSX : on les écarte.
    // Les expressions TypeScript (`a > b && c < d`) sont aussi écartées : on cible du vrai texte.
    const real = jsxText.filter(
      (t) => !/^[A-Za-z]+(?:<|\[|\|)/.test(t as string) && !/^(?:HTML|SVG)\w*Element$/.test(t as string) && !/&&|\|\||=>|===|!==|<=|>=|[=;]/.test(t as string),
    );
    expect(real).toEqual([]);
  });

  it.each(files)('$file : pas d’attribut accessible littéral (aria-label, title, alt, placeholder)', ({ source }) => {
    const literals = [...code(source).matchAll(/\b(aria-label|aria-roledescription|title|alt|placeholder)="([^"]+)"/g)].map((m) => `${m[1]}="${m[2]}"`);
    expect(literals).toEqual([]);
  });
});
