import {defineConfig} from 'vitest/config';
import path from 'node:path';
export default defineConfig({
 resolve:{alias:{'@':path.resolve('src'),'server-only':path.resolve('tests/unit/server-only.ts')}},
 oxc:{jsx:{runtime:'automatic'}},
 test:{environment:'node',fileParallelism:false,include:['tests/integration/f00-f06/selectors/*.test.{ts,tsx}']},
});
