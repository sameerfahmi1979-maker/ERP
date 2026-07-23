/**
 * ERP PDF.1 — Security Tests for Secure Print Route
 * Phase: ERP PDF.1 — Production PDF Generation Framework
 *
 * These tests verify the security of the /print/... route.
 * They do NOT require Gotenberg — they test the route directly.
 *
 * Run:
 *   npx playwright test tests/pdf/print-route-security.spec.ts
 *
 * Prerequisites:
 *   - ERP application must be running (npm run dev)
 *   - PDF_PRINT_TOKEN_SECRET must be set in .env.local (min 32 chars)
 *
 * NOTE (2026-07-23 UAT Status):
 *   These tests are WRITTEN but not yet EXECUTED because:
 *   - Docker Desktop daemon not running → Gotenberg cannot be started
 *   - Poppler (pdftoppm/pdfinfo) not installed → rasterization blocked
 *   Status: BLOCKED — awaiting environment setup (see closure report)
 */

import { test, expect } from "@playwright/test";
import { createHmac } from "crypto";

// ─── Helpers ────────────────────────────────────────────────────────────────

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

/**
 * Sign a minimal print token matching the server-side signPrintToken() contract.
 * Uses the same PDF_PRINT_TOKEN_SECRET from environment.
 */
function signTestToken(params: {
  templateKey: string;
  recordType: string;
  recordId: number;
  userId: number;
  ownerCompanyId: number;
  ttlSeconds?: number;
}): string {
  // Use the same secret as the running server.
  // The server reads PDF_PRINT_TOKEN_SECRET from .env.local.
  // When not set (server started before the env var was added), the secret defaults to "".
  // Pass PDF_PRINT_TOKEN_SECRET=<secret> to this test runner to match the server's secret.
  const secret = process.env.PDF_PRINT_TOKEN_SECRET ?? "";
  const exp = Math.floor(Date.now() / 1000) + (params.ttlSeconds ?? 120);
  const payload = {
    templateKey: params.templateKey,
    recordType: params.recordType,
    recordId: params.recordId,
    userId: params.userId,
    ownerCompanyId: params.ownerCompanyId,
    exp,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function printRouteUrl(templateKey: string, recordType: string, recordId: number, token: string): string {
  return `${BASE_URL}/print/${encodeURIComponent(templateKey)}/${encodeURIComponent(recordType)}/${recordId}?token=${token}`;
}

// ─── Security Tests ──────────────────────────────────────────────────────────

test.describe("Print Route Security", () => {
  test("missing token returns 401", async ({ request }) => {
    const res = await request.get(
      `${BASE_URL}/print/hr-employment-letter-en/employee/1`,
    );
    expect(res.status()).toBe(401);
    const body = await res.text();
    expect(body).toContain("Missing print token");
  });

  test("tampered token returns 401", async ({ request }) => {
    // Generate a valid token then corrupt it
    const token = signTestToken({
      templateKey: "hr-employment-letter-en",
      recordType: "employee",
      recordId: 1,
      userId: 1,
      ownerCompanyId: 1,
    });
    const tampered = token.slice(0, -4) + "XXXX";
    const res = await request.get(
      printRouteUrl("hr-employment-letter-en", "employee", 1, tampered),
    );
    expect(res.status()).toBe(401);
    const body = await res.text();
    expect(body.toLowerCase()).toContain("invalid");
  });

  test("expired token returns 401", async ({ request }) => {
    const expiredToken = signTestToken({
      templateKey: "hr-employment-letter-en",
      recordType: "employee",
      recordId: 1,
      userId: 1,
      ownerCompanyId: 1,
      ttlSeconds: -10, // already expired
    });
    const res = await request.get(
      printRouteUrl("hr-employment-letter-en", "employee", 1, expiredToken),
    );
    expect(res.status()).toBe(401);
    const body = await res.text();
    expect(body.toLowerCase()).toContain("expired");
  });

  test("token-route mismatch (wrong templateKey) returns 403", async ({ request }) => {
    // Token says 'sample-quotation-en' but route says 'hr-employment-letter-en'
    const token = signTestToken({
      templateKey: "sample-quotation-en",
      recordType: "employee",
      recordId: 1,
      userId: 1,
      ownerCompanyId: 1,
    });
    const res = await request.get(
      printRouteUrl("hr-employment-letter-en", "employee", 1, token),
    );
    expect(res.status()).toBe(403);
    const body = await res.text();
    expect(body).toContain("mismatch");
  });

  test("token-route mismatch (wrong recordId) returns 403", async ({ request }) => {
    const token = signTestToken({
      templateKey: "hr-employment-letter-en",
      recordType: "employee",
      recordId: 999,
      userId: 1,
      ownerCompanyId: 1,
    });
    const res = await request.get(
      printRouteUrl("hr-employment-letter-en", "employee", 1, token),
    );
    expect(res.status()).toBe(403);
  });

  test("unknown template key returns 404", async ({ request }) => {
    const token = signTestToken({
      templateKey: "non-existent-template",
      recordType: "employee",
      recordId: 1,
      userId: 1,
      ownerCompanyId: 1,
    });
    const res = await request.get(
      printRouteUrl("non-existent-template", "employee", 1, token),
    );
    expect(res.status()).toBe(404);
  });

  test("draft-only template returns 404 (not in governance DB)", async ({ request }) => {
    // A template code that is not in erp_report_templates at all
    const token = signTestToken({
      templateKey: "totally-unknown-draft",
      recordType: "employee",
      recordId: 1,
      userId: 1,
      ownerCompanyId: 1,
    });
    const res = await request.get(
      printRouteUrl("totally-unknown-draft", "employee", 1, token),
    );
    // 404 from component registry check (not in TEMPLATE_COMPONENT_REGISTRY)
    expect(res.status()).toBe(404);
  });
});

// ─── Functionality Tests (require real employee data) ────────────────────────

test.describe("Print Route Functionality", () => {
  // NOTE: Employee ID 1 is 'Sameer Fahmi Abu Elayyan', owner_company_id=1
  const EMPLOYEE_ID = 1;
  const OWNER_COMPANY_ID = 1;

  test("valid published template returns 200 with HTML", async ({ request }) => {
    const token = signTestToken({
      templateKey: "hr-employment-letter-en",
      recordType: "employee",
      recordId: EMPLOYEE_ID,
      userId: 1,
      ownerCompanyId: OWNER_COMPANY_ID,
    });
    const res = await request.get(
      printRouteUrl("hr-employment-letter-en", "employee", EMPLOYEE_ID, token),
    );
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/html");
    const body = await res.text();
    // Should contain employee name
    expect(body).toContain("Sameer");
    // Should NOT contain the DRAFT watermark (published template)
    expect(body).not.toContain("DRAFT — NOT OFFICIAL");
    // Should have font-face for Arabic
    expect(body).toContain("noto-sans-arabic");
    // Should have X-Template-Governance header
    expect(res.headers()["x-template-governance"]).toBe("published");
  });

  test("draft template returns 200 with DRAFT watermark", async ({ request }) => {
    const token = signTestToken({
      templateKey: "bilingual-sample-en-ar",
      recordType: "employee",
      recordId: EMPLOYEE_ID,
      userId: 1,
      ownerCompanyId: OWNER_COMPANY_ID,
    });
    const res = await request.get(
      printRouteUrl("bilingual-sample-en-ar", "employee", EMPLOYEE_ID, token),
    );
    expect(res.status()).toBe(200);
    const body = await res.text();
    // Draft templates MUST show watermark
    expect(body).toContain("DRAFT — NOT OFFICIAL");
    expect(res.headers()["x-template-governance"]).toBe("draft");
  });

  test("no-cache and no-index headers are set", async ({ request }) => {
    const token = signTestToken({
      templateKey: "hr-employment-letter-en",
      recordType: "employee",
      recordId: EMPLOYEE_ID,
      userId: 1,
      ownerCompanyId: OWNER_COMPANY_ID,
    });
    const res = await request.get(
      printRouteUrl("hr-employment-letter-en", "employee", EMPLOYEE_ID, token),
    );
    expect(res.headers()["cache-control"]).toContain("no-store");
    expect(res.headers()["x-robots-tag"]).toBe("noindex");
  });

  test("Arabic font @font-face served from self-hosted /fonts/ path", async ({ request }) => {
    const token = signTestToken({
      templateKey: "hr-employment-letter-en",
      recordType: "employee",
      recordId: EMPLOYEE_ID,
      userId: 1,
      ownerCompanyId: OWNER_COMPANY_ID,
    });
    const res = await request.get(
      printRouteUrl("hr-employment-letter-en", "employee", EMPLOYEE_ID, token),
    );
    const body = await res.text();
    // Font MUST come from self-hosted path, NOT Google Fonts CDN
    expect(body).toContain("/fonts/noto-sans-arabic-arabic-400-normal.woff2");
    expect(body).not.toContain("fonts.googleapis.com");
    expect(body).not.toContain("fonts.gstatic.com");
  });

  test("self-hosted Arabic font file is actually accessible", async ({ request }) => {
    const res = await request.get(
      `${BASE_URL}/fonts/noto-sans-arabic-arabic-400-normal.woff2`,
    );
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("woff2");
  });
});
