/**
 * Tests d'implémentation (auteur du solveur) : forme des étapes décrites, telles que l'UI les explique,
 * sur les vrais puzzles du jour (toutes les techniques V1 y apparaissent).
 */
import { describe, expect, it } from 'vitest';
import { addDays } from '../../core/date';
import { generateDailyForVersion } from '../../core/pipeline';
import { BINAIRO_DEFINITION } from '../index';
import type { BinairoCell, BinairoSolvedPuzzle } from '../types';
import { BINAIRO_TECHNIQUES_V1, solveBinairoLogically, type BinairoLineRef, type BinairoStep } from './solver';

const lineCells = (n: number, ref: BinairoLineRef): number[] =>
  Array.from({ length: n }, (_, k) => (ref.kind === 'row' ? ref.index * n + k : k * n + ref.index));

/** Invariants d'une étape décrite dans l'état `board` (avant application). */
function checkStep(p: BinairoSolvedPuzzle, board: readonly BinairoCell[], step: BinairoStep): void {
  const n = p.size;
  const tag = `${step.technique} ${JSON.stringify(step)}`;
  expect(step.level, tag).toBe(BINAIRO_TECHNIQUES_V1.techniques.find((t) => t.id === step.technique)!.level);
  expect(step.place.length, tag).toBeGreaterThan(0);
  for (let i = 0; i < step.place.length; i++) {
    const { cell, value } = step.place[i]!;
    expect(board[cell], tag).toBe(0); // information nouvelle
    expect(value, tag).toBe(p.solution[cell]); // déduction juste
    if (i > 0) expect(cell, tag).toBeGreaterThan(step.place[i - 1]!.cell);
  }
  expect([...step.cells].sort((a, b) => a - b), tag).toEqual(step.cells);
  expect(step.line, tag).not.toBeNull();
  const line = lineCells(n, step.line!);
  const inLine = (cells: readonly number[]) => cells.every((x) => line.includes(x));
  const symbols = (cells: readonly number[]) => new Set(cells.map((x) => board[x]));
  switch (step.technique) {
    case 'pair':
    case 'sandwich': {
      expect(step.cells, tag).toHaveLength(2);
      expect(inLine(step.cells) && inLine(step.place.map((x) => x.cell)), tag).toBe(true);
      const [a, b] = step.cells.map((x) => line.indexOf(x));
      expect(b! - a!, tag).toBe(step.technique === 'pair' ? 1 : 2);
      const sym = symbols(step.cells);
      expect(sym.size === 1 && !sym.has(0), tag).toBe(true);
      expect(step.place.every((x) => x.value !== board[step.cells[0]!]), tag).toBe(true);
      expect(step.other, tag).toBeNull();
      break;
    }
    case 'count': {
      expect(step.cells, tag).toHaveLength(n / 2);
      expect(inLine(step.cells), tag).toBe(true);
      expect(symbols(step.cells).size, tag).toBe(1);
      expect(step.place.map((x) => x.cell), tag).toEqual(line.filter((x) => board[x] === 0));
      break;
    }
    case 'line':
      expect(step.cells, tag).toEqual(line.filter((x) => board[x] !== 0));
      expect(inLine(step.place.map((x) => x.cell)), tag).toBe(true);
      break;
    case 'unique': {
      expect(step.other?.kind, tag).toBe(step.line!.kind);
      const other = lineCells(n, step.other!);
      expect(step.cells, tag).toEqual(other);
      expect(other.every((x) => board[x] !== 0), tag).toBe(true); // ligne comparée complète
      expect(inLine(step.place.map((x) => x.cell)), tag).toBe(true);
      break;
    }
    case 'contradiction':
      expect(step.place, tag).toHaveLength(1);
      expect(step.cells.length, tag).toBeGreaterThan(0);
      expect(inLine(step.cells.filter((x) => !(step.other && lineCells(n, step.other).includes(x)))), tag).toBe(true);
      break;
  }
}

describe('étapes décrites sur les puzzles du jour (huit semaines)', () => {
  it('invariants de chaque étape, toutes les techniques V1 rencontrées', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 56; i++) {
      const p = generateDailyForVersion(BINAIRO_DEFINITION, 1, addDays('2026-10-05', i)).puzzle;
      const res = solveBinairoLogically(p);
      expect(res.solved).toBe(true);
      const board: BinairoCell[] = [...p.givens];
      for (const step of res.steps) {
        checkStep(p, board, step);
        seen.add(step.technique);
        for (const { cell, value } of step.place) board[cell] = value;
      }
      expect(board).toEqual([...p.solution]);
    }
    expect([...seen].sort()).toEqual(BINAIRO_TECHNIQUES_V1.techniques.map((t) => t.id).sort());
  });
});
