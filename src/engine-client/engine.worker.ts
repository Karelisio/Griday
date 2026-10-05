/// <reference lib="webworker" />
import { handleEngineCall } from './handle';
import type { EngineRequest, EngineResponse } from './protocol';

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = (event: MessageEvent<EngineRequest>) => {
  const { id, ...call } = event.data;
  let response: EngineResponse;
  try {
    response = { id, ok: true, value: handleEngineCall(call) };
  } catch (e) {
    response = { id, ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  self.postMessage(response);
};
