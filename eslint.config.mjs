import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Evidence and independent prototypes are not application lint targets.
    // `npm run lint` still checks every file under src, including app/dev.
    "CODEX_AUDIT_13_09_2026/**",
    "UIUX_Design/**",
    "ChatGPT/**",
    "spikes/**",
    "test-results/**",
    "playwright-report/**",
  ]),
]);

export default eslintConfig;
