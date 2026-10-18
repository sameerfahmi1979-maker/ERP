import {defineConfig} from 'vitest/config';
import path from 'node:path';
export default defineConfig({resolve:{alias:{'@':path.resolve('src')}},test:{environment:'node',fileParallelism:false,setupFiles:['tests/remediation/f10/offline.ts'],include:['tests/remediation/f10/*.test.{ts,tsx}'],exclude:['**/*.local.test.ts']}});
