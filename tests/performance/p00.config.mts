import {defineConfig} from 'vitest/config';
import fs from 'node:fs';
fs.mkdirSync('.performance',{recursive:true});
export default defineConfig({test:{environment:'node',fileParallelism:false,include:[
  'tests/performance/inventory-acceptance-qualification.test.ts',
  'tests/performance/inventory-semantics.test.ts',
  'tests/performance/adoption-dependency-hashes.test.ts',
  'tests/performance/export-review.test.ts',
]}});
