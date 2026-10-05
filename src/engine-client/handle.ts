/** Exécution d'un appel moteur (dans le worker, ou en repli sur le fil principal). */
import { versionForDate } from '../../engine/core/schedule';
import { getDailyInfo, getDailyPuzzle, getUnlimitedPuzzle, engineSelfCheck, REGISTRY, SCHEDULE } from '../../engine/index';
import { getQueensHint } from '../../engine/queens/hint';
import type { EngineCall } from './protocol';

export function handleEngineCall(call: EngineCall): unknown {
  switch (call.kind) {
    case 'daily':
      // Jamais de deadlineMs ici : le puzzle du jour doit rester identique pour tous.
      return getDailyPuzzle(call.date);
    case 'dailyInfo':
      return getDailyInfo(call.date);
    case 'unlimited':
      return getUnlimitedPuzzle(call.type, call.target, call.token, call.today, {
        version: call.version,
        deadlineMs: 4000,
      });
    case 'unlimitedOptions': {
      const version = versionForDate(SCHEDULE, call.type, call.today);
      return { version, sizes: [...REGISTRY[call.type].versions[version]!.sizes] };
    }
    case 'queensHint':
      return getQueensHint(call.puzzle, call.marks);
    case 'selfCheck':
      return engineSelfCheck();
  }
}
