import {defineConfig} from 'vitest/config';
import path from 'node:path';
import {fluentTestAliases,fluentTestServer} from '../remediation/fluent-test-config.mts';
// Use the same real, per-window browser storage as the F04/F05 suites on Node 25+.
export default defineConfig({resolve:{alias:{...fluentTestAliases,'@':path.resolve('src'),'server-only':path.resolve('tests/unit/server-only.ts')}},test:{server:fluentTestServer,environment:'jsdom',setupFiles:['tests/remediation/f04/browser-storage.setup.ts'],fileParallelism:false,include:['tests/performance/*.test.{ts,tsx}'],exclude:['**/*.local.test.ts','**/node_modules/**']}});
