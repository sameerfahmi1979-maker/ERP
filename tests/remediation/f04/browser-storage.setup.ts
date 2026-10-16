import { afterAll } from 'vitest';

// Vitest 4 keeps existing host globals. Node 25+ exposes Web Storage itself,
// so its localStorage getter can shadow JSDOM's real, per-window Storage even
// when no --localstorage-file exists. These browser tests must exercise the
// actual JSDOM stores, never a fake store or Node's process-wide persistence.
const dom = (globalThis as typeof globalThis & { jsdom?: { window: Window } }).jsdom;
if (dom) {
  for (const key of ['localStorage', 'sessionStorage'] as const) {
    const original = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, get: () => dom.window[key] });
    afterAll(() => {
      if (original) Object.defineProperty(globalThis, key, original);
      else Reflect.deleteProperty(globalThis, key);
    });
  }
}
