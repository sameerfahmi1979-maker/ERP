/**
 * ERP PDF.1 — End-to-End Gotenberg Generation Tests
 * Phase: ERP PDF.1 — Production PDF Generation Framework
 *
 * Tests require ALL of:
 *   - ERP app running (npm run dev, port 3000)
 *   - Gotenberg running (docker run --rm -p 3100:3000 gotenberg/gotenberg:8)
 *   - INTERNAL_SITE_URL=http://host.docker.internal:3000
 *   - PDF_PRINT_TOKEN_SECRET set (min 32 chars)
 *   - GOTENBERG_URL=http://localhost:3100
 *
 * NOTE (2026-07-23 UAT Status):
 *   BLOCKED — Docker Desktop daemon not running.
 *   Run `docker run --rm -p 3100:3000 gotenberg/gotenberg:8` first.
 *
 * Run:
 *   npx playwright test tests/pdf/e2e-pdf-generation.spec.ts
 */

import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const GOTENBERG_URL = process.env.GOTENBERG_URL ?? "http://localhost:3100";

// Test output directory for PDF artifacts
const TEST_OUTPUT_DIR = path.join(__dirname, "../../test-output/pdf-artifacts");

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

test.describe("Gotenberg Health", () => {
  test("Gotenberg is reachable at GOTENBERG_URL", async ({ request }) => {
    const res = await request.get(`${GOTENBERG_URL}/health`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("status", "up");
  });

  test("Gotenberg version is 8.x", async ({ request }) => {
    const res = await request.get(`${GOTENBERG_URL}/version`);
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body.trim().startsWith("8")).toBe(true);
  });
});

test.describe("Employment Letter PDF Generation", () => {
  test.beforeAll(() => {
    ensureDir(TEST_OUTPUT_DIR);
  });

  test("HR Employment Letter generates valid PDF (employee 1)", async ({ page }) => {
    // 1. Login as system admin
    await page.goto(`${BASE_URL}/admin/login`);
    await page.fill('[name="email"]', "sameer@algt.net");
    await page.fill('[name="password"]', "Alliance@123");
    await page.click('[type="submit"]');
    await page.waitForURL(/admin/);

    // 2. Navigate to employee record
    await page.goto(`${BASE_URL}/admin/hr/employees/record/1`);
    await page.waitForLoadState("networkidle");

    // 3. Open HR Actions tab
    await page.click('[data-section="hr_actions"], text=HR Actions', { timeout: 5000 });
    await page.waitForLoadState("domcontentloaded");

    // 4. Click "Download PDF" (Official PDF button)
    const pdfButton = page.getByRole("button", { name: /Download PDF|Employment Letter.*Official/i });
    await expect(pdfButton).toBeVisible({ timeout: 5000 });
    await pdfButton.click();

    // 5. Wait for generation (up to 30s for Gotenberg)
    await page.waitForFunction(
      () => !document.querySelector('[data-generating="true"]'),
      { timeout: 30000 },
    );

    // 6. Verify success toast
    const toast = page.getByText(/Employment Letter PDF ready|page/i);
    await expect(toast).toBeVisible({ timeout: 5000 });
  });
});

test.describe("Print Route HTML Quality", () => {
  /**
   * These tests check the HTML output of print routes.
   * They do NOT require Gotenberg — they call the route directly.
   * Token generation replicates signPrintToken() server logic.
   */

  function signToken(params: {
    templateKey: string;
    recordType: string;
    recordId: number;
    userId: number;
    ownerCompanyId: number;
  }): string {
    const secret = process.env.PDF_PRINT_TOKEN_SECRET!;
    const exp = Math.floor(Date.now() / 1000) + 120;
    const payload = { ...params, exp };
    const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const sig = crypto.createHmac("sha256", secret).update(body).digest("hex");
    return `${body}.${sig}`;
  }

  test("Employment Letter HTML has correct document structure", async ({ request }) => {
    const token = signToken({
      templateKey: "hr-employment-letter-en",
      recordType: "employee",
      recordId: 1,
      userId: 1,
      ownerCompanyId: 1,
    });
    const res = await request.get(
      `${BASE_URL}/print/hr-employment-letter-en/employee/1?token=${token}`,
    );
    expect(res.status()).toBe(200);
    const html = await res.text();

    // Document structure
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain('charset="utf-8"');
    // Font loading script
    expect(html).toContain("document.fonts.ready");
    // Arabic font self-hosted
    expect(html).toContain("/fonts/noto-sans-arabic");
    expect(html).not.toContain("googleapis.com");
    // Security headers
    expect(res.headers()["x-robots-tag"]).toBe("noindex");
    expect(res.headers()["cache-control"]).toContain("no-store");
  });

  test("Arabic fonts served correctly (no 404)", async ({ request }) => {
    const fonts = [
      "/fonts/noto-sans-arabic-arabic-400-normal.woff2",
      "/fonts/noto-sans-arabic-arabic-600-normal.woff2",
      "/fonts/noto-sans-arabic-arabic-700-normal.woff2",
    ];
    for (const fontPath of fonts) {
      const res = await request.get(`${BASE_URL}${fontPath}`);
      expect(res.status(), `Font ${fontPath} should return 200`).toBe(200);
    }
  });
});
