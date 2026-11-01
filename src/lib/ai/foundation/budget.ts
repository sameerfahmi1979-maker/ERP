/** Shared engineering limits; these do not activate a provider or approve spend. */
export const AI_TURN_LIMITS = Object.freeze({ modelCalls: 2, readCalls: 6, outputCharacters: 4000 });

export class AiBudgetExceeded extends Error {
  constructor(readonly resource: "model" | "read" | "deadline" | "cancelled") { super(`AI ${resource} budget unavailable`); }
}

export function createAiTurnBudget(options: { directLookup?: boolean; deadline: number; now?: () => number; signal?: AbortSignal }) {
  let modelCalls = 0, readCalls = 0;
  const now = options.now ?? Date.now;
  if (!Number.isFinite(options.deadline)) throw new Error("A finite deadline is required");
  function check() {
    if (options.signal?.aborted) throw new AiBudgetExceeded("cancelled");
    if (now() >= options.deadline) throw new AiBudgetExceeded("deadline");
  }
  return {
    consumeModelCall() { check(); if (modelCalls >= (options.directLookup ? 0 : AI_TURN_LIMITS.modelCalls)) throw new AiBudgetExceeded("model"); modelCalls++; },
    consumeReadCall() { check(); if (readCalls >= AI_TURN_LIMITS.readCalls) throw new AiBudgetExceeded("read"); readCalls++; },
    snapshot() { return { modelCalls, readCalls }; },
  };
}
