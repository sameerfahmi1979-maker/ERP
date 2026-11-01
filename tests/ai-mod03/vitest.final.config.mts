import { defineConfig, mergeConfig } from "vitest/config";
import previous from "../ai-mod02/vitest.final.config.mts";
export default mergeConfig(previous, defineConfig({ test: { include: ["tests/ai-mod03/*.test.ts", "tests/ai-mod03/*.test.tsx", "tests/remediation/f06/company-suggestion-contract.test.ts", "tests/remediation/f06/company-suggestion-lock-authority.test.ts", "tests/remediation/f06/party-ai-child-contract.test.ts", "tests/remediation/f06/administration-form-save.test.tsx", "tests/remediation/f04/complex-adapters.test.tsx"] } }));
