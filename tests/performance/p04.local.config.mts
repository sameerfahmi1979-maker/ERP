import {defineConfig} from "vitest/config";
import path from "node:path";
export default defineConfig({resolve:{alias:{"@":path.resolve("src"),"server-only":path.resolve("tests/unit/server-only.ts")}},test:{environment:"node",fileParallelism:false,include:["tests/performance/p04.local.test.ts"],testTimeout:120000,hookTimeout:120000}});
