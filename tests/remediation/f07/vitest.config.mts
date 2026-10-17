import {defineConfig} from 'vitest/config';
import path from 'node:path';
import {fluentTestAliases,fluentTestServer} from '../fluent-test-config.mts';
export default defineConfig({resolve:{alias:{...fluentTestAliases,'@':path.resolve('src'),'server-only':path.resolve('tests/unit/server-only.ts')}},
  oxc:{jsx:{runtime:'automatic'}},test:{server:fluentTestServer,environment:'node',fileParallelism:false,
    setupFiles:['tests/remediation/f01/offline-setup.ts'],include:['tests/remediation/f07/*.test.{ts,tsx}'],exclude:['**/*.local.test.ts']}});
