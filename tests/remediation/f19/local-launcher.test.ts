import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterAll, expect, it } from 'vitest';

// PowerShell launcher acceptance is Windows-specific. Other platforms report
// explicit skips, never substitute their own runtime as Windows acceptance.
const windows = process.platform === 'win32';
const suite = it.skipIf(!windows);
const root = resolve('.');
const ownedBase = join(root, 'node_modules/.cache/f19-launcher');
mkdirSync(ownedBase, { recursive: true });
const owned = mkdtempSync(join(ownedBase, 'run-'));
const runtime = dirname(process.execPath);
const packageFile = join(owned, 'package.json');
const launcher = join(owned, 'tooling/local/erp.ps1');
mkdirSync(dirname(launcher), { recursive: true });
copyFileSync('tooling/local/erp.ps1', launcher);
const original = JSON.parse(readFileSync('package.json', 'utf8'));
const packageWith = (scripts = {}, node = original.engines.node) => {
  writeFileSync(packageFile, JSON.stringify({ private: true, engines: { node }, packageManager: original.packageManager, scripts }));
};
const run = (task = 'check', nodeDir = runtime) => spawnSync(process.env.ERP_TEST_POWERSHELL || 'pwsh.exe', [
  '-NoLogo', '-NoProfile', '-NonInteractive', '-File', launcher, task, '-NodeDirectory', nodeDir,
], { cwd: root, env: process.env, encoding: 'utf8', windowsHide: true, timeout: 30000 });
afterAll(() => {
  // Exact generated directory only; never remove the parent cache or runtime.
  if (dirname(owned) !== ownedBase) throw new Error('Invalid fixture cleanup boundary');
  rmSync(owned, { recursive: true, force: true });
});

suite('reports the real pinned versions without starting an app or changing the parent PATH', () => {
  packageWith();
  const path = process.env.PATH;
  const result = run();
  expect(result.status, result.stderr).toBe(0);
  const actual = JSON.parse(result.stdout);
  expect(actual).toMatchObject({ Node: 'v' + original.engines.node, Npm: '10.9.9', Project: owned });
  expect(resolve(actual.NodeExecutable).toLowerCase()).toBe(resolve(process.execPath).toLowerCase());
  expect(process.env.PATH).toBe(path);
});

suite('rejects an incomplete toolchain instead of falling back to shell Node', () => {
  packageWith();
  const result = run('check', owned);
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain('toolchain is incomplete');
});

suite('rejects a wrong Node version before executing the npm task', () => {
  packageWith({ test: 'node -e "throw new Error(\'SHOULD_NOT_RUN\')"' }, '0.0.1');
  const result = run('test');
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain('requires Node 0.0.1');
  expect(result.stdout).not.toContain('SHOULD_NOT_RUN');
});

suite('uses the approved Node in npm children and the actual project directory', () => {
  packageWith({ test: 'node -e "console.log(JSON.stringify({version:process.version,cwd:process.cwd()}))"' });
  const result = run('test');
  expect(result.status, result.stderr).toBe(0);
  const receipt = result.stdout.split(/\r?\n/).find(line => line.startsWith('{"version"'))!;
  expect(JSON.parse(receipt)).toEqual({ version: 'v' + original.engines.node, cwd: owned });
});

suite('propagates a failed child check instead of reporting success', () => {
  packageWith({ test: 'node -e "process.exit(7)"' });
  expect(run('test').status).toBe(7);
});

suite('does not admit browser scripts or arbitrary npm tasks', () => {
  packageWith();
  const result = run('test:e2e');
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain('ValidateSet');
});
