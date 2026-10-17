import {defineConfig} from 'vitest/config';
import path from 'node:path';
import {fluentTestServer,fluentTestAliases} from '../fluent-test-config.mts';
export default defineConfig({
 resolve:{alias:{...fluentTestAliases,'@':path.resolve('src'),'server-only':path.resolve('tests/unit/server-only.ts')}},oxc:{jsx:{runtime:'automatic'}},
 test:{server:fluentTestServer,environment:'node',fileParallelism:false,
  include:['tests/remediation/f06/*.test.{ts,tsx}'],exclude:['**/*.local.test.ts'],
  setupFiles:['tests/remediation/f01/offline-setup.ts']},
});
