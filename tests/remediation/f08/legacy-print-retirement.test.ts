import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { GET } from "@/app/print/[templateKey]/[recordType]/[recordId]/route";
import { signPrintToken } from "@/lib/pdf/print-token";

beforeAll(() => vi.stubEnv("PDF_PRINT_TOKEN_SECRET", "synthetic-phase4-print-secret-only-for-testing"));
afterAll(() => vi.unstubAllEnvs());

it("retires the old route for absent, malformed or previously valid credentials", async () => {
  const params = { templateKey: "hr-employment-letter-en", recordType: "employee", recordId: "44" };
  const oldToken = signPrintToken({ ...params, recordId: 44, userId: 4, ownerCompanyId: 7 });
  for (const token of ["", "malformed", oldToken]) {
    const response = await GET(new NextRequest(`http://localhost/print/${params.templateKey}/employee/44?token=${token}`), { params: Promise.resolve(params) });
    expect(response.status).toBe(410);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(await response.text()).toContain("This legacy print link is no longer available");
  }
});

it.each([400, 600, 700])("retains the shipped Arabic font bytes for weight %s", weight => {
  const bytes = readFileSync(`public/fonts/noto-sans-arabic-arabic-${weight}-normal.woff2`);
  expect(bytes.subarray(0, 4).toString("ascii")).toBe("wOF2");
});
