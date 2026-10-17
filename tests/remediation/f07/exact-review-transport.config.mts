import {defineConfig} from 'vitest/config';import path from 'node:path';
export default defineConfig({resolve:{alias:{'@':path.resolve('src'),'server-only':path.resolve('tests/unit/server-only.ts')}},
 test:{environment:'node',fileParallelism:false,include:['tests/remediation/f07/exact-review-transport.local.test.ts'],testTimeout:30000}});
