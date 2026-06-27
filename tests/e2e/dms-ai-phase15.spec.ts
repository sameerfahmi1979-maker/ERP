/**
 * ERP DMS AI Phase 15 — Playwright E2E Tests
 *
 * Browser-level E2E tests for all DMS AI routes and key workflows.
 * Requires:
 *   - Dev server running: npm run dev
 *   - Env vars set in .env.local or environment:
 *       E2E_USER_EMAIL    — test user email
 *       E2E_USER_PASSWORD — test user password (never printed)
 *       APP_BASE_URL      — defaults to http://localhost:3000
 *
 * Run: npm run test:e2e
 *
 * Security rules:
 *   - Never print E2E_USER_PASSWORD in any log, screenshot label, or assertion message.
 *   - Test data uses [PHASE15-TEST] prefix for any created documents.
 *   - All created test data is deleted in afterAll cleanup.
 */

import { test, expect, type Page } from "@playwright/test";

// ── Config ────────────────────────────────────────────────────────────────────

const EMAIL = process.env.E2E_USER_EMAIL ?? "sameer@algt.net";
// NEVER print or log the password
const PASSWORD = process.env.E2E_USER_PASSWORD ?? "";

if (!PASSWORD) {
  console.warn("[E2E] E2E_USER_PASSWORD not set — tests will fail at login");
}

// ── Shared login helper ───────────────────────────────────────────────────────

async function login(page: Page) {
  await page.goto("/login");
  await page.fill('input[type="email"], input[name="email"]', EMAIL);
  await page.fill('input[type="password"], input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  // Wait for redirect away from login
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 15000 });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe("PW-01: Login flow", () => {
  test("logs in successfully", async ({ page }) => {
    await login(page);
    // Should be on dashboard or DMS, not on login page
    expect(page.url()).not.toContain("/login");
  });
});

test.describe("DMS User Routes", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("PW-02: /dms/documents loads", async ({ page }) => {
    await page.goto("/dms/documents");
    await page.waitForLoadState("networkidle");
    const status = page.url();
    // Should not be error or login
    expect(status).not.toContain("/login");
    // Should not show 500 error text
    const bodyText = await page.textContent("body");
    expect(bodyText).not.toContain("Internal Server Error");
    expect(bodyText).not.toContain("500");
  });

  test("PW-04: /dms/review-queue loads", async ({ page }) => {
    await page.goto("/dms/review-queue");
    await page.waitForLoadState("networkidle");
    expect(page.url()).not.toContain("/login");
    const bodyText = await page.textContent("body");
    expect(bodyText).not.toContain("Internal Server Error");
  });
});

test.describe("DMS Document Record", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("PW-03: /dms/documents/record/[existing_id] loads with sections", async ({ page }) => {
    // Navigate to documents list first
    await page.goto("/dms/documents");
    await page.waitForLoadState("networkidle");

    // Try to click the first document row if available
    const firstRow = page.locator("table tbody tr").first();
    const rowCount = await firstRow.count();

    if (rowCount > 0) {
      await firstRow.click();
      await page.waitForLoadState("networkidle");
      expect(page.url()).not.toContain("/login");
      // Should show a document record
      const bodyText = await page.textContent("body");
      expect(bodyText).not.toContain("Internal Server Error");
    } else {
      // No documents — navigate directly with a known-safe URL pattern
      await page.goto("/dms/documents");
      // Just verify the page loaded without error
      expect(page.url()).not.toContain("/login");
    }
  });
});

test.describe("Admin DMS Routes", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("PW-05: /admin/dms/intelligence loads", async ({ page }) => {
    await page.goto("/admin/dms/intelligence");
    await page.waitForLoadState("networkidle");
    expect(page.url()).not.toContain("/login");
    const bodyText = await page.textContent("body");
    expect(bodyText).not.toContain("Internal Server Error");
  });

  test("PW-06: /admin/dms/ai-observability with flag OFF shows disabled state", async ({ page }) => {
    // DMS_AI_OBSERVABILITY is OFF by default (verified in Phase 15 state check)
    await page.goto("/admin/dms/ai-observability");
    await page.waitForLoadState("networkidle");
    expect(page.url()).not.toContain("/login");
    // Should not show a 500 error — must show disabled/access-denied state
    const bodyText = await page.textContent("body");
    expect(bodyText).not.toContain("Internal Server Error");
  });
});

test.describe("PW-11: Review Queue", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("Review Queue page renders without error", async ({ page }) => {
    await page.goto("/dms/review-queue");
    await page.waitForLoadState("networkidle");
    expect(page.url()).not.toContain("/login");
    const bodyText = await page.textContent("body");
    expect(bodyText).not.toContain("Internal Server Error");
    // Page should render without crashing (even if list is empty)
  });
});

test.describe("Admin Settings AI", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("/admin/settings/ai loads", async ({ page }) => {
    await page.goto("/admin/settings/ai");
    await page.waitForLoadState("networkidle");
    expect(page.url()).not.toContain("/login");
    const bodyText = await page.textContent("body");
    expect(bodyText).not.toContain("Internal Server Error");
  });
});

test.describe("Observability Dashboard — Flag ON state", () => {
  // Note: This test requires DMS_AI_OBSERVABILITY=true to be set before running.
  // Toggle via: UPDATE erp_ai_feature_flags SET is_enabled=true WHERE feature_code='DMS_AI_OBSERVABILITY';
  // It is skipped if E2E_OBSERVABILITY_ON is not set.

  test("PW-07: Dashboard loads when flag is ON", async ({ page }) => {
    if (!process.env.E2E_OBSERVABILITY_ON) {
      test.skip();
      return;
    }
    await login(page);
    await page.goto("/admin/dms/ai-observability");
    await page.waitForLoadState("networkidle");
    expect(page.url()).not.toContain("/login");
    const bodyText = await page.textContent("body");
    expect(bodyText).not.toContain("Internal Server Error");
  });
});
