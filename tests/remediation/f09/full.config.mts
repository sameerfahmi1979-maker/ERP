import {defineConfig} from "vitest/config";
import path from "node:path";
export default defineConfig({resolve:{alias:{"@":path.resolve("src")}},test:{environment:"node",fileParallelism:false,include:["tests/remediation/f09/*.local.test.ts"],testTimeout:60000,hookTimeout:60000}});
