import {defineConfig,mergeConfig} from "vitest/config";
import previous from "../ai-mod03/vitest.final.config.mts";
export default mergeConfig(previous,defineConfig({test:{exclude:["**/*.local.test.ts"],include:[
 "tests/ai-mod04/*.test.ts","tests/ai-mod04/*.test.tsx",
 "tests/remediation/f07/*.test.ts","tests/remediation/f07/*.test.tsx",
 "tests/remediation/f12/photo-*.test.ts","tests/remediation/f12/photo-*.test.tsx",
 "tests/remediation/f12/workforce-photo-*.test.ts","tests/remediation/f12/workforce-photo-*.test.tsx",
 "tests/performance/dms-approvals-server-page.test.tsx","tests/performance/dms-approvals-hook.test.tsx","tests/performance/dms-approvals-adoption.test.tsx"
 ,"tests/remediation/f09/dms-source.test.ts","tests/remediation/f10/event-pipeline.test.ts","tests/remediation/f10/dispatch-contract.test.ts","tests/remediation/f10/hr-routing.test.ts","tests/remediation/f10/worker-route.test.ts","tests/performance/p04-expiry-controls.test.tsx","tests/performance/p04-renewal-completeness.test.ts","tests/remediation/f06/dms-numbered-create.test.ts","tests/remediation/f06/dms-numbered-ai-approval-reminder-harness-contract.test.ts"
]}}));
