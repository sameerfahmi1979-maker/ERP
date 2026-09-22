import { defineConfig, devices } from "@playwright/test";

/**
 * ERP DMS AI Phase 15 — Playwright E2E Config
 *
 * Reads credentials from environment variables only.
 * Never hardcode passwords.
 *
 * Required env vars:
 *   E2E_USER_EMAIL    — test user email
 *   E2E_USER_PASSWORD — test user password (never print)
 *   APP_BASE_URL      — defaults to http://localhost:3000
 */
export default defineConfig({
  tsconfig: './tests/e2e/tsconfig.json',
  testDir: "./tests",
  testMatch: ["**/e2e/**/*.spec.ts", "**/pdf/**/*.spec.ts"],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["html", { open: "never" }], ["list"]],
  use: {
    baseURL: process.env.APP_BASE_URL ?? "http://localhost:3000",
    // Tokens and fixture credentials must not enter traces/screenshots or public artifacts.
    trace: "off",
    screenshot: "off",
    // Trust the operating-system/corporate CA store; never bypass bad certificates.
    ignoreHTTPSErrors: false,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // Do not start dev server automatically — run `npm run dev` separately
});
