/**
 * OFFICIAL DOCS.1 — Unit tests for the official document catalog and layout.
 *
 * Gate 1: catalog compiles, validates, and cannot publish incomplete wording.
 * Gate 3 (unit level): EN / AR / bilingual HTML structure, escaping, zones.
 */

import { describe, it, expect } from "vitest";
import {
  listOfficialDocumentDefinitions,
  validateOfficialDocumentDefinition,
  validateOfficialDocumentRegistry,
  getOfficialDocumentDefinition,
  isGeneratable,
  supportsLanguage,
  buildInputsSchema,
  findMissingDataError,
} from "../registry";
import { renderOfficialDocumentHtml } from "../layout/render";
import type {
  OfficialDocumentDefinition,
  OfficialDocumentRenderContext,
} from "../types";

// ─── Fixtures (synthetic, clearly non-production) ────────────────────────────

const FIXTURE_ROW: Record<string, unknown> = {
  employee_name: "Test Employee (FIXTURE)",
  employee_name_ar: "موظف تجريبي",
  employee_code: "FIX-0001",
  designation: "Operations Supervisor",
  designation_ar: "مشرف عمليات",
  department: "Operations",
  employment_type: "Full-Time",
  joining_date: "2023-04-15",
  company_name: "Fixture Logistics L.L.C",
  gross_salary: 12500,
  basic_salary: 8000,
  currency: "AED",
  passport_number_masked: "AB****12",
  warning_level: "First",
  warning_reason: "Late attendance",
  incident_date: "2026-07-01",
  incident_description: "Repeated late arrival.",
  clearance_area: "Department",
  checklist_item: "Employee Profile Created",
  area: "HR",
  ppe_item: "Safety Helmet",
  ppe_category: "Head Protection",
  quantity: 1,
  issue_date: "2026-06-10",
  last_working_date: "",
};

function ctx(overrides: Partial<OfficialDocumentRenderContext> = {}): OfficialDocumentRenderContext {
  return {
    row: FIXTURE_ROW,
    rows: [FIXTURE_ROW],
    inputs: {},
    language: "en",
    issuedDateEn: "28 July 2026",
    issuedDateAr: "٢٨ يوليو ٢٠٢٦",
    serialNo: "HR_TEST-C1-2026-000001",
    branding: {
      companyNameEn: "Fixture Logistics L.L.C",
      companyNameAr: "شركة الخدمات اللوجستية التجريبية",
      footerTextEn: "Fixture Logistics — Confidential",
      trn: "100000000000003",
      showLogo: false,
      showStamp: false,
      showSignatory: true,
      signatoryName: "Test Signatory",
      signatoryTitleEn: "HR Manager",
    },
    ...overrides,
  };
}

// ─── Gate 1: registry governance ─────────────────────────────────────────────

describe("official document registry governance", () => {
  it("registry has zero governance violations", () => {
    expect(validateOfficialDocumentRegistry()).toEqual([]);
  });

  it("contains all 14 catalog identities", () => {
    const codes = listOfficialDocumentDefinitions().map((d) => d.documentCode);
    expect(codes).toEqual(
      expect.arrayContaining([
        "HR_EMPLOYMENT_LETTER",
        "HR_EMPLOYMENT_CONFIRMATION",
        "HR_EXPERIENCE_LETTER",
        "HR_SALARY_CERT_WITH_AMOUNT",
        "HR_SALARY_CERT_GENERAL",
        "HR_NOC",
        "HR_WARNING_LETTER",
        "HR_CLEARANCE_FORM",
        "HR_JOINING_CHECKLIST",
        "HR_PPE_ISSUE_FORM",
        "HR_BANK_SALARY_TRANSFER",
        "HR_EMBASSY_LETTER",
        "HR_HANDOVER_FORM",
        "HR_LEAVE_CONFIRMATION",
      ])
    );
    expect(codes.length).toBe(14);
  });

  it("cannot publish a definition with unverified wording", () => {
    const bad: OfficialDocumentDefinition = {
      documentCode: "HR_BAD_DOC",
      version: 1,
      moduleCode: "HR",
      recordType: "employee",
      titleEn: "Bad Doc",
      businessPurpose: "test",
      status: "published",
      supportedLanguages: ["en"],
      requiredSourceFields: [],
      optionalInputs: [],
      sensitiveFields: [],
      wording: { en: { source: "none", provenance: "pending", businessApprovalStatus: "draft" } },
      build: () => ({ titleEn: "Bad Doc", blocks: [] }),
    };
    const errors = validateOfficialDocumentDefinition(bad);
    expect(errors.some((e) => e.includes("English wording is not verified"))).toBe(true);
  });

  it("cannot publish bilingual support without verified Arabic wording", () => {
    const bad: OfficialDocumentDefinition = {
      documentCode: "HR_BAD_BILINGUAL",
      version: 1,
      moduleCode: "HR",
      recordType: "employee",
      titleEn: "Bad Bilingual",
      businessPurpose: "test",
      status: "published",
      supportedLanguages: ["en", "bilingual"],
      bilingualLayoutType: "narrative_two_column",
      requiredSourceFields: [],
      optionalInputs: [],
      sensitiveFields: [],
      wording: { en: { source: "x", provenance: "verified_code", businessApprovalStatus: "approved" } },
      build: () => ({ titleEn: "Bad Bilingual", blocks: [] }),
    };
    const errors = validateOfficialDocumentDefinition(bad);
    expect(errors.some((e) => e.includes("Arabic wording is not verified"))).toBe(true);
  });

  it("disabled_pending_wording documents are not generatable and cannot render", () => {
    for (const code of ["HR_BANK_SALARY_TRANSFER", "HR_EMBASSY_LETTER", "HR_HANDOVER_FORM", "HR_LEAVE_CONFIRMATION"]) {
      const def = getOfficialDocumentDefinition(code)!;
      expect(def.status).toBe("disabled_pending_wording");
      expect(isGeneratable(def)).toBe(false);
      expect(() => def.build(ctx())).toThrow(/disabled pending approved wording/);
    }
  });

  it("published documents are generatable", () => {
    for (const def of listOfficialDocumentDefinitions().filter((d) => d.status === "published")) {
      expect(isGeneratable(def)).toBe(true);
    }
  });

  it("language support is definition-driven", () => {
    const conf = getOfficialDocumentDefinition("HR_EMPLOYMENT_CONFIRMATION")!;
    expect(supportsLanguage(conf, "en")).toBe(true);
    expect(supportsLanguage(conf, "ar")).toBe(true);
    expect(supportsLanguage(conf, "bilingual")).toBe(true);
    const salary = getOfficialDocumentDefinition("HR_SALARY_CERT_WITH_AMOUNT")!;
    expect(supportsLanguage(salary, "ar")).toBe(false);
    expect(supportsLanguage(salary, "bilingual")).toBe(false);
  });
});

// ─── Input validation ────────────────────────────────────────────────────────

describe("optional input validation", () => {
  it("NOC requires purpose and rejects unknown keys", () => {
    const noc = getOfficialDocumentDefinition("HR_NOC")!;
    const schema = buildInputsSchema(noc);
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ purpose: "" }).success).toBe(false);
    expect(schema.safeParse({ purpose: "applying for a driving licence" }).success).toBe(true);
    expect(schema.safeParse({ purpose: "x", hacked_field: "1" }).success).toBe(false);
  });

  it("rejects control characters and over-length input", () => {
    const noc = getOfficialDocumentDefinition("HR_NOC")!;
    const schema = buildInputsSchema(noc);
    expect(schema.safeParse({ purpose: "bad\u0000value" }).success).toBe(false);
    expect(schema.safeParse({ purpose: "x".repeat(201) }).success).toBe(false);
  });
});

// ─── Missing-data UX ─────────────────────────────────────────────────────────

describe("missing-data validation", () => {
  it("returns the precise configured message for a missing salary profile", () => {
    const def = getOfficialDocumentDefinition("HR_SALARY_CERT_WITH_AMOUNT")!;
    const err = findMissingDataError(def, { ...FIXTURE_ROW, gross_salary: 0 });
    expect(err).toMatch(/approved salary profile is missing/);
  });

  it("returns null when all required data is present", () => {
    const def = getOfficialDocumentDefinition("HR_EMPLOYMENT_LETTER")!;
    expect(findMissingDataError(def, FIXTURE_ROW)).toBeNull();
  });
});

// ─── Gate 3 (unit): layout rendering ─────────────────────────────────────────

describe("official document HTML rendering", () => {
  it("renders the English employment certificate with verified prose", () => {
    const def = getOfficialDocumentDefinition("HR_EMPLOYMENT_LETTER")!;
    const html = renderOfficialDocumentHtml(def, ctx());
    expect(html).toContain('dir="ltr"');
    expect(html).toContain("This is to certify that Test Employee (FIXTURE)");
    expect(html).toContain("issued upon the employee&#x27;s request for official purposes only");
    expect(html).toContain("od-footer");
    expect(html).toContain("TRN: 100000000000003");
  });

  it("renders Arabic-only confirmation with true RTL and Arabic font", () => {
    const def = getOfficialDocumentDefinition("HR_EMPLOYMENT_CONFIRMATION")!;
    const html = renderOfficialDocumentHtml(def, ctx({ language: "ar" }));
    expect(html).toContain('<html lang="ar" dir="rtl">');
    expect(html).toContain("إلى من يهمه الأمر");
    expect(html).toContain("خطاب تأكيد التوظيف");
  });

  it("renders bilingual confirmation as synchronized two-column rows", () => {
    const def = getOfficialDocumentDefinition("HR_EMPLOYMENT_CONFIRMATION")!;
    const html = renderOfficialDocumentHtml(def, ctx({ language: "bilingual" }));
    // Synchronized rows: EN cell + AR cell inside the same <tr>
    expect(html).toContain('class="od-bi-row"');
    expect(html).toContain('class="od-bi-en"');
    expect(html).toContain('class="od-bi-ar"');
    expect(html).toContain("To Whom It May Concern,");
    expect(html).toContain("إلى من يهمه الأمر،");
    // Shared single title with both languages
    expect(html).toContain("Employment Confirmation Letter");
    expect(html).toContain("خطاب تأكيد التوظيف");
    // Exactly one header, one footer, one signature zone
    expect(html.match(/od-header"/g)?.length).toBe(1);
    expect(html.match(/class="od-footer"/g)?.length).toBe(1);
    expect(html.match(/class="od-signature"/g)?.length).toBe(1);
  });

  it("escapes hostile data values", () => {
    const def = getOfficialDocumentDefinition("HR_EMPLOYMENT_LETTER")!;
    const html = renderOfficialDocumentHtml(
      def,
      ctx({
        row: {
          ...FIXTURE_ROW,
          employee_name: '<script>alert("xss")</script>',
        },
      })
    );
    expect(html).not.toContain('<script>alert("xss")</script>');
    expect(html).toContain("&lt;script&gt;");
  });

  it("renders the verified salary certificate wording with amount", () => {
    const def = getOfficialDocumentDefinition("HR_SALARY_CERT_WITH_AMOUNT")!;
    const html = renderOfficialDocumentHtml(def, ctx());
    expect(html).toContain("TO WHOM IT MAY CONCERN");
    expect(html).toContain("holding Employee No. FIX-0001");
    expect(html).toContain("Monthly Salary: AED 12,500.00");
  });

  it("NOC includes the purpose and conditional validity sentence", () => {
    const def = getOfficialDocumentDefinition("HR_NOC")!;
    const withValidity = renderOfficialDocumentHtml(
      def,
      ctx({ inputs: { purpose: "applying for a UAE driving licence", validity_period: "90 days" } })
    );
    expect(withValidity).toContain("has no objection to Test Employee (FIXTURE)");
    expect(withValidity).toContain("valid for 90 days from the date of issue");
    const withoutValidity = renderOfficialDocumentHtml(
      def,
      ctx({ inputs: { purpose: "applying for a UAE driving licence" } })
    );
    expect(withoutValidity).not.toContain("from the date of issue");
  });

  it("bilingual clearance form uses bilingual labels in one shared table", () => {
    const def = getOfficialDocumentDefinition("HR_CLEARANCE_FORM")!;
    const rows = ["Department", "HR", "Finance", "IT", "Safety", "Admin"].map((area) => ({
      ...FIXTURE_ROW,
      clearance_area: area,
    }));
    const html = renderOfficialDocumentHtml(def, ctx({ language: "bilingual", rows }));
    expect(html).toContain("اسم الموظف");
    expect(html).toContain("رقم الموظف");
    expect(html).toContain("نموذج تسوية الموظف");
    expect(html).toContain("Finance");
    // Form rows must be pagination-safe
    expect(html).toContain("od-form-row");
  });

  it("renders QR zone only with a valid QR data URL and never for missing verification", () => {
    const def = getOfficialDocumentDefinition("HR_EMPLOYMENT_LETTER")!;
    const noQr = renderOfficialDocumentHtml(def, ctx());
    expect(noQr).not.toContain('class="od-qr-img"');
    const withQr = renderOfficialDocumentHtml(
      def,
      ctx({
        verification: {
          publicUrl: "https://erp.example/verify/token",
          qrDataUrl:
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        },
      })
    );
    expect(withQr).toContain('class="od-qr-img"');
    // Exactly one QR image element on the document
    expect((withQr.match(/class="od-qr-img"/g) ?? []).length).toBe(1);
  });

  it("stamp and signature render only when the gated branding provides them", () => {
    const def = getOfficialDocumentDefinition("HR_EMPLOYMENT_LETTER")!;
    const without = renderOfficialDocumentHtml(def, ctx());
    expect(without).not.toContain('class="od-stamp-img"');
    const withAssets = renderOfficialDocumentHtml(
      def,
      ctx({
        branding: {
          companyNameEn: "Fixture Logistics L.L.C",
          showStamp: true,
          showSignatory: true,
          stampUrl: "https://signed.example/stamp.png",
          signatureUrl: "https://signed.example/sig.png",
          signatoryName: "Test Signatory",
        },
      })
    );
    expect(withAssets).toContain('src="https://signed.example/stamp.png"');
    expect(withAssets).toContain('src="https://signed.example/sig.png"');
  });

  it("draft watermark renders only when watermark text is provided", () => {
    const def = getOfficialDocumentDefinition("HR_EMPLOYMENT_LETTER")!;
    expect(renderOfficialDocumentHtml(def, ctx())).not.toContain('class="od-watermark"');
    expect(renderOfficialDocumentHtml(def, ctx({ watermarkText: "DRAFT" }))).toContain('class="od-watermark"');
  });

  it("warning letter renders the verified disciplinary wording", () => {
    const def = getOfficialDocumentDefinition("HR_WARNING_LETTER")!;
    const html = renderOfficialDocumentHtml(def, ctx());
    expect(html).toContain("official first warning regarding: Late attendance");
    expect(html).toContain("Employee Acknowledgment Required.");
    expect(html).toContain("up to and including termination");
  });

  it("salary certificate addressee line is conditional", () => {
    const def = getOfficialDocumentDefinition("HR_SALARY_CERT_WITH_AMOUNT")!;
    const without = renderOfficialDocumentHtml(def, ctx());
    expect(without).not.toContain("To: ");
    const withAddressee = renderOfficialDocumentHtml(
      def,
      ctx({ inputs: { addressee: "Fixture Bank PJSC" } })
    );
    expect(withAddressee).toContain("To: Fixture Bank PJSC");
  });

  it("PPE form renders the verified empty-state paragraph when no items are issued", () => {
    const def = getOfficialDocumentDefinition("HR_PPE_ISSUE_FORM")!;
    const empty = renderOfficialDocumentHtml(
      def,
      ctx({ rows: [{ ...FIXTURE_ROW, ppe_item: "No items" }] })
    );
    expect(empty).toContain("No PPE items are currently recorded as issued to this employee.");
    const issued = renderOfficialDocumentHtml(def, ctx());
    expect(issued).toContain("Safety Helmet");
    expect(issued).not.toContain("No PPE items are currently recorded");
  });

  it("accepts base64 image data URIs for branding but rejects other schemes", () => {
    const def = getOfficialDocumentDefinition("HR_EMPLOYMENT_LETTER")!;
    const pngDataUri = `data:image/png;base64,${Buffer.from("fixture").toString("base64")}`;
    const withDataUri = renderOfficialDocumentHtml(
      def,
      ctx({ branding: { ...ctx().branding, showLogo: true, logoUrl: pngDataUri } })
    );
    expect(withDataUri).toContain('class="od-header-logo"');
    const withHttp = renderOfficialDocumentHtml(
      def,
      ctx({ branding: { ...ctx().branding, showLogo: true, logoUrl: "http://evil.example/x.png" } })
    );
    expect(withHttp).not.toContain('class="od-header-logo"');
    const withScript = renderOfficialDocumentHtml(
      def,
      // eslint-disable-next-line no-script-url
      ctx({ branding: { ...ctx().branding, showLogo: true, logoUrl: "javascript:alert(1)" } })
    );
    expect(withScript).not.toContain('class="od-header-logo"');
  });
});
