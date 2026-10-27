import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

it('uses one stable source identity for production assets, navigation and diagnostic receipts', async () => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('NEXT_DEPLOYMENT_ID', 'unrelated-host-value');
  vi.resetModules();
  const { default: config } = await import('../../../next.config');
  const id = await config.generateBuildId!();
  expect(id).toMatch(/^[a-f0-9]{64}$/);
  expect(config.deploymentId).toBe(id);
  expect(config.env?.NEXT_PUBLIC_ALGT_BUILD_COMMIT).toBe(id);
  expect((await config.headers!())[0].headers).toContainEqual({ key: 'X-ALGT-Build', value: id });
  // Same source loaded again is the same release, not an identity per process.
  vi.resetModules();
  expect((await import('../../../next.config')).default.deploymentId).toBe(id);
});

it('leaves development hot reload independent from production deployment identity', async () => {
  vi.stubEnv('NODE_ENV', 'development');
  vi.resetModules();
  const { default: config } = await import('../../../next.config');
  expect(config.deploymentId).toBeUndefined();
  expect(await config.generateBuildId!()).toMatch(/^[a-f0-9]{64}$/);
});
