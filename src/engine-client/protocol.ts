/** Protocole entre l'UI et le worker du moteur (messages structurés, clonables). */
import type { ISODate } from '../../engine/core/date';
import type { GenerationTarget, PuzzleTypeId } from '../../engine/core/types';
import type { QueensMark, QueensSolvedPuzzle } from '../../engine/queens/types';

export type EngineCall =
  | { kind: 'daily'; date: ISODate }
  | { kind: 'dailyInfo'; date: ISODate }
  | { kind: 'unlimited'; type: PuzzleTypeId; target: GenerationTarget; token: string; today: ISODate; version?: number }
  | { kind: 'unlimitedOptions'; type: PuzzleTypeId; today: ISODate }
  | { kind: 'queensHint'; puzzle: QueensSolvedPuzzle; marks: readonly QueensMark[] }
  | { kind: 'selfCheck' };

export type EngineRequest = EngineCall & { readonly id: number };

export type EngineResponse =
  | { readonly id: number; readonly ok: true; readonly value: unknown }
  | { readonly id: number; readonly ok: false; readonly error: string };
