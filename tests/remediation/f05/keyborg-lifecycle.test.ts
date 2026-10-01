// @vitest-environment jsdom
import './setup';
import { createRequire } from 'node:module';
import { expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const fluentRequire = createRequire(require.resolve('@fluentui/react-tabster/package.json'));
const tabsterRequire = createRequire(fluentRequire.resolve('tabster/package.json'));
const fluent: typeof import('keyborg') = fluentRequire('keyborg');
const tabster: typeof import('keyborg') = tabsterRequire('keyborg');

it('Fluent and Tabster resolve one Keyborg runtime rather than colliding instance counters', () => {
  expect(fluentRequire.resolve('keyborg')).toBe(tabsterRequire.resolve('keyborg'));
});

it('both focus owners receive changes and either owner can dispose without breaking the other', () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  const first = fluent.createKeyborg(window);
  const second = tabster.createKeyborg(window);
  const firstChange = vi.fn();
  const secondChange = vi.fn();
  let firstDisposed = false;
  let secondDisposed = false;
  try {
    first.subscribe(firstChange);
    second.subscribe(secondChange);
    first.setVal(true);
    expect(firstChange).toHaveBeenLastCalledWith(true);
    expect(secondChange).toHaveBeenLastCalledWith(true);
    fluent.disposeKeyborg(first);
    firstDisposed = true;
    second.setVal(false);
    expect(firstChange).toHaveBeenCalledTimes(1);
    expect(secondChange).toHaveBeenLastCalledWith(false);
    tabster.disposeKeyborg(second);
    secondDisposed = true;
    expect(error).not.toHaveBeenCalled();
  } finally {
    if (!firstDisposed) fluent.disposeKeyborg(first);
    if (!secondDisposed) tabster.disposeKeyborg(second);
    error.mockRestore();
  }
});
