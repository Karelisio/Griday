/**
 * Client du moteur : génération et indices dans un Web Worker (l'UI ne gèle jamais),
 * repli sur le fil principal si les workers sont indisponibles (tests, très vieux WebView).
 */
import type { ISODate } from '../../engine/core/date';
import type { DailyInfo, GenerationTarget, PuzzleTypeId } from '../../engine/core/types';
import type { QueensHint } from '../../engine/queens/hint';
import type { QueensMark, QueensSolvedPuzzle } from '../../engine/queens/types';
import type { AnyDailyPuzzle, AnyGeneratedPuzzle } from '../../engine/registry';
import type { EngineCall, EngineRequest, EngineResponse } from './protocol';

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };

class EngineClient {
  private worker: Worker | null = null;
  private failed = false;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();

  private getWorker(): Worker | null {
    if (this.failed || typeof Worker === 'undefined') return null;
    if (!this.worker) {
      try {
        this.worker = new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' });
        this.worker.onmessage = (e: MessageEvent<EngineResponse>) => this.settle(e.data);
        this.worker.onerror = () => this.fail(new Error('Worker du moteur indisponible'));
      } catch {
        this.failed = true;
        return null;
      }
    }
    return this.worker;
  }

  private settle(res: EngineResponse): void {
    const p = this.pending.get(res.id);
    if (!p) return;
    this.pending.delete(res.id);
    if (res.ok) p.resolve(res.value);
    else p.reject(new Error(res.error));
  }

  private fail(err: Error): void {
    this.failed = true;
    this.worker?.terminate();
    this.worker = null;
    for (const p of this.pending.values()) p.reject(err);
    this.pending.clear();
  }

  private async call<T>(call: EngineCall): Promise<T> {
    const worker = this.getWorker();
    if (!worker) {
      const { handleEngineCall } = await import('./handle');
      return handleEngineCall(call) as T;
    }
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      const request: EngineRequest = { ...call, id };
      worker.postMessage(request);
    });
  }

  daily(date: ISODate): Promise<AnyDailyPuzzle> {
    return this.call({ kind: 'daily', date });
  }

  dailyInfo(date: ISODate): Promise<DailyInfo> {
    return this.call({ kind: 'dailyInfo', date });
  }

  unlimited(type: PuzzleTypeId, target: GenerationTarget, token: string, today: ISODate, version?: number): Promise<AnyGeneratedPuzzle> {
    return this.call({ kind: 'unlimited', type, target, token, today, version });
  }

  queensHint(puzzle: QueensSolvedPuzzle, marks: readonly QueensMark[]): Promise<QueensHint> {
    return this.call({ kind: 'queensHint', puzzle, marks });
  }

  selfCheck(): Promise<string[]> {
    return this.call({ kind: 'selfCheck' });
  }
}

export const engine = new EngineClient();
