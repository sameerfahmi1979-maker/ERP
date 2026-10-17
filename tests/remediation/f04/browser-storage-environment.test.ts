// @vitest-environment jsdom
import { expect, it } from 'vitest';

it('browser-storage globals are the actual per-window JSDOM stores, not host substitutes', () => {
  const dom = (globalThis as typeof globalThis & { jsdom: { window: Window } }).jsdom;
  expect(localStorage).toBe(dom.window.localStorage);
  expect(sessionStorage).toBe(dom.window.sessionStorage);
  expect(window.localStorage).toBe(localStorage);
  expect(localStorage).not.toBe(sessionStorage);
  const key = 'f04-browser-environment-probe';
  localStorage.setItem(key, 'browser only');
  expect(dom.window.localStorage.getItem(key)).toBe('browser only');
  expect(sessionStorage.getItem(key)).toBeNull();
  localStorage.removeItem(key);
});
