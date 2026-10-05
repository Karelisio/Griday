/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SPRING_SPECS, springToCssLinear } from './motion';
import { COLOR_ROLES, GRIDAY_SEED, colorRoleToCssVar, createScheme } from './scheme';

// Vitest vide les imports CSS (même `?raw`) : on lit le fichier directement.
const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'tokens.css'), 'utf8');

const SCALE = [
  'display-large',
  'display-medium',
  'display-small',
  'headline-large',
  'headline-medium',
  'headline-small',
  'title-large',
  'title-medium',
  'title-small',
  'body-large',
  'body-medium',
  'body-small',
  'label-large',
  'label-medium',
  'label-small',
];

describe('tokens.css', () => {
  it('enregistre chaque rôle de couleur avec le repli clair de la marque', () => {
    const light = createScheme({ seed: GRIDAY_SEED, dark: false });
    for (const role of COLOR_ROLES) {
      const name = colorRoleToCssVar(role);
      const rule = new RegExp(`@property ${name} \\{ syntax: '<color>'; inherits: true; initial-value: (#[0-9a-f]{6}); \\}`).exec(css);
      expect(rule, `@property ${name}`).not.toBeNull();
      expect(rule?.[1], name).toBe(light[role]);
    }
  });

  it('anime chaque rôle de couleur lors du fondu entre thèmes', () => {
    const fade = /:root\[data-theme-fade\] \{([^}]*)\}/.exec(css)?.[1] ?? '';
    for (const role of COLOR_ROLES) expect(fade).toContain(`${colorRoleToCssVar(role)},`.replace(/,$/, ''));
    expect(fade).toContain('transition-duration');
  });

  it('définit l’échelle typographique et ses variantes accentuées', () => {
    for (const name of SCALE) {
      for (const prop of ['font', 'size', 'line-height', 'weight', 'tracking', 'emphasized-weight']) {
        expect(css, `--md-sys-typescale-${name}-${prop}`).toContain(`--md-sys-typescale-${name}-${prop}:`);
      }
      expect(css).toContain(`.md-typescale-${name} {`);
      expect(css).toContain(`.md-typescale-${name}-emphasized {`);
    }
  });

  it('définit formes, élévations, états, mouvement et zones sûres', () => {
    for (const shape of ['none', 'extra-small', 'small', 'medium', 'large', 'large-increased', 'extra-large', 'extra-large-increased', 'extra-extra-large', 'full']) {
      expect(css).toContain(`--md-sys-shape-corner-${shape}:`);
    }
    for (let level = 0; level <= 5; level++) expect(css).toContain(`--md-sys-elevation-level${level}:`);
    expect(css).toMatch(/--md-sys-state-hover-opacity: 0\.08;/);
    expect(css).toMatch(/--md-sys-state-focus-opacity: 0\.1;/);
    expect(css).toMatch(/--md-sys-state-pressed-opacity: 0\.1;/);
    expect(css).toMatch(/--md-sys-state-dragged-opacity: 0\.16;/);
    expect(css).toContain('--md-sys-motion-easing-emphasized:');
    expect(css).toContain('--md-sys-motion-duration-medium2: 300ms;');
    for (const side of ['top', 'right', 'bottom', 'left']) {
      expect(css).toContain(`--md-safe-area-${side}: var(--safe-area-inset-${side}, env(safe-area-inset-${side}, 0px));`);
    }
    expect(css).toContain('-webkit-tap-highlight-color: transparent');
    expect(css).toContain('--md-ref-typeface-plain: \'Google Sans Flex\', \'Google Sans\', Roboto, system-ui, sans-serif;');
  });

  it('les ressorts CSS correspondent à motion.ts', () => {
    for (const [group, specs] of Object.entries(SPRING_SPECS)) {
      for (const [speed, spec] of Object.entries(specs)) {
        const { easing, duration } = springToCssLinear(spec, group === 'effects' ? 24 : 40);
        const name = `--md-sys-motion-spring-${speed}-${group === 'effects' ? 'effects' : 'spatial'}`;
        expect(css).toContain(`${name}: ${easing};`);
        expect(css).toContain(`${name}-duration: ${duration}ms;`);
      }
    }
  });
});
