/**
 * ERP DMS AI Phase 16 — Apply Target Registry Unit Tests
 *
 * Tests:
 *   - Tier 1 allowlisted fields pass validation (dms_documents, dms_document_metadata_values)
 *   - Tier 2 allowlisted fields pass validation (party_licenses, party_tax_registrations)
 *   - Forbidden direct Party/HR/payroll/bank fields are blocked
 *   - Forbidden patterns are blocked (regardless of allowlist)
 *   - isForbiddenTarget works correctly
 *   - getTargetPermissions returns correct permissions (Tier 1 and Tier 2)
 *   - listTier1ApplyTargets returns only DMS targets (not party)
 *   - listTier2ApplyTargets returns only party targets
 */

import { describe, it, expect } from "vitest";
import {
  validateApplyTarget,
  isForbiddenTarget,
  getTargetPermissions,
  listTier1ApplyTargets,
  listTier2ApplyTargets,
  listAllApplyTargets,
} from "../apply-target-registry";

// ── validateApplyTarget ────────────────────────────────────────────────────────

describe("validateApplyTarget", () => {
  describe("Tier 1 dms_documents fields — should pass", () => {
    const tier1DocFields = [
      "owning_company_id",
      "owning_branch_id",
      "party_id",
      "issue_date",
      "expiry_date",
      "title",
      "description",
    ];

    tier1DocFields.forEach((field) => {
      it(`allows dms_documents.${field}`, () => {
        const result = validateApplyTarget("dms_documents", field);
        expect(result.valid).toBe(true);
        if (result.valid) {
          expect(result.field.column).toBe(field);
        }
      });
    });
  });

  describe("Tier 1 dms_document_metadata_values fields — should pass", () => {
    const metaFields = ["value_text", "value_number", "value_date", "value_boolean"];

    metaFields.forEach((field) => {
      it(`allows dms_document_metadata_values.${field}`, () => {
        const result = validateApplyTarget("dms_document_metadata_values", field);
        expect(result.valid).toBe(true);
      });
    });
  });

  describe("Tier 2 party_licenses allowlisted fields — should pass", () => {
    const licenseFields = [
      "license_number",
      "license_name",
      "license_activity_text",
      "issue_date",
      "expiry_date",
      "remarks",
    ];

    licenseFields.forEach((field) => {
      it(`allows party_licenses.${field}`, () => {
        const result = validateApplyTarget("party_licenses", field);
        expect(result.valid).toBe(true);
        if (result.valid) {
          expect(result.field.column).toBe(field);
          expect(result.config.targetModule).toBe("party");
        }
      });
    });
  });

  describe("Tier 2 party_tax_registrations allowlisted fields — should pass", () => {
    const taxFields = [
      "tax_registration_number",
      "effective_from",
      "effective_to",
      "remarks",
    ];

    taxFields.forEach((field) => {
      it(`allows party_tax_registrations.${field}`, () => {
        const result = validateApplyTarget("party_tax_registrations", field);
        expect(result.valid).toBe(true);
        if (result.valid) {
          expect(result.field.column).toBe(field);
          expect(result.config.targetModule).toBe("party");
        }
      });
    });
  });

  describe("party_licenses forbidden fields — not in Tier 2 allowlist", () => {
    const forbidden = [
      "party_id",      // FK — not updatable via apply
      "license_status_id", // FK — not in allowlist
      "issuing_authority_party_id", // FK — not in allowlist
      "issuing_country_id", // FK — not in allowlist
      "is_active",     // lifecycle field — not in allowlist
      "created_at",    // system field
    ];

    forbidden.forEach((field) => {
      it(`blocks party_licenses.${field} (not in Tier 2 allowlist)`, () => {
        const result = validateApplyTarget("party_licenses", field);
        expect(result.valid).toBe(false);
      });
    });
  });

  describe("party_tax_registrations forbidden fields — not in Tier 2 allowlist", () => {
    const forbidden = [
      "party_id",          // FK — not updatable via apply
      "tax_type_id",       // FK — not in allowlist
      "tax_country_id",    // FK — not in allowlist
      "is_active",         // lifecycle field
      "created_at",        // system field
      "reverse_charge_applicable", // flag — not in allowlist
    ];

    forbidden.forEach((field) => {
      it(`blocks party_tax_registrations.${field} (not in Tier 2 allowlist)`, () => {
        const result = validateApplyTarget("party_tax_registrations", field);
        expect(result.valid).toBe(false);
      });
    });
  });

  describe("Direct parties and HR tables — must remain blocked forever", () => {
    const forbidden = [
      { table: "parties",                          field: "full_name_en" },
      { table: "parties",                          field: "full_name_ar" },
      { table: "employee_identity_documents",      field: "id_number" },
      { table: "employee_medical_insurances",      field: "policy_number" },
      { table: "party_bank_details",               field: "account_number" },
      { table: "party_contacts",                   field: "email" },
      { table: "party_addresses",                  field: "city" },
    ];

    forbidden.forEach(({ table, field }) => {
      it(`blocks ${table}.${field} (not in allowlist — forever forbidden)`, () => {
        const result = validateApplyTarget(table, field);
        expect(result.valid).toBe(false);
      });
    });
  });

  describe("Non-existent tables — should be blocked", () => {
    it("blocks unknown table", () => {
      const result = validateApplyTarget("random_table", "some_field");
      expect(result.valid).toBe(false);
    });

    it("blocks valid table but invalid field", () => {
      const result = validateApplyTarget("dms_documents", "nonexistent_field");
      expect(result.valid).toBe(false);
    });
  });
});

// ── isForbiddenTarget ─────────────────────────────────────────────────────────

describe("isForbiddenTarget", () => {
  describe("forbidden table patterns", () => {
    it("blocks payroll table", () => {
      expect(isForbiddenTarget("payroll_records", "basic_salary")).toBe(true);
    });
    it("blocks salary table", () => {
      expect(isForbiddenTarget("employee_salaries", "amount")).toBe(true);
    });
    it("blocks bank_detail table", () => {
      expect(isForbiddenTarget("party_bank_details", "iban")).toBe(true);
    });
    it("blocks audit_logs table", () => {
      expect(isForbiddenTarget("audit_logs", "action")).toBe(true);
    });
    it("blocks erp_ai_usage_logs table", () => {
      expect(isForbiddenTarget("erp_ai_usage_logs", "prompt_tokens")).toBe(true);
    });
    it("blocks erp_ai_feature_flags table", () => {
      expect(isForbiddenTarget("erp_ai_feature_flags", "is_enabled")).toBe(true);
    });
  });

  describe("forbidden field patterns", () => {
    it("blocks salary field", () => {
      expect(isForbiddenTarget("employees", "basic_salary")).toBe(true);
    });
    it("blocks payroll field", () => {
      expect(isForbiddenTarget("employees", "payroll_id")).toBe(true);
    });
    it("blocks iban field", () => {
      expect(isForbiddenTarget("any_table", "iban")).toBe(true);
    });
    it("blocks account_number field", () => {
      expect(isForbiddenTarget("any_table", "account_number")).toBe(true);
    });
    it("blocks password field", () => {
      expect(isForbiddenTarget("users", "password")).toBe(true);
    });
    it("blocks api_key field", () => {
      expect(isForbiddenTarget("settings", "api_key")).toBe(true);
    });
    it("blocks raw_response field", () => {
      expect(isForbiddenTarget("any_table", "raw_response")).toBe(true);
    });
    it("blocks ocr_text field", () => {
      expect(isForbiddenTarget("any_table", "ocr_text")).toBe(true);
    });
    it("blocks content_text field", () => {
      expect(isForbiddenTarget("any_table", "content_text")).toBe(true);
    });
    it("blocks embedding field", () => {
      expect(isForbiddenTarget("any_table", "summary_embedding")).toBe(true);
    });
  });

  describe("safe fields — should NOT be forbidden", () => {
    it("allows dms_documents.title", () => {
      expect(isForbiddenTarget("dms_documents", "title")).toBe(false);
    });
    it("allows dms_documents.party_id", () => {
      expect(isForbiddenTarget("dms_documents", "party_id")).toBe(false);
    });
    it("allows dms_documents.issue_date", () => {
      expect(isForbiddenTarget("dms_documents", "issue_date")).toBe(false);
    });
    it("allows dms_document_metadata_values.value_text", () => {
      expect(isForbiddenTarget("dms_document_metadata_values", "value_text")).toBe(false);
    });
    it("allows party_licenses.license_number (Tier 2)", () => {
      expect(isForbiddenTarget("party_licenses", "license_number")).toBe(false);
    });
    it("allows party_licenses.expiry_date (Tier 2)", () => {
      expect(isForbiddenTarget("party_licenses", "expiry_date")).toBe(false);
    });
    it("allows party_tax_registrations.effective_from (Tier 2)", () => {
      expect(isForbiddenTarget("party_tax_registrations", "effective_from")).toBe(false);
    });
    it("allows party_tax_registrations.tax_registration_number (Tier 2)", () => {
      expect(isForbiddenTarget("party_tax_registrations", "tax_registration_number")).toBe(false);
    });
  });
});

// ── getTargetPermissions ──────────────────────────────────────────────────────

describe("getTargetPermissions", () => {
  it("returns dms.documents.edit for dms_documents", () => {
    const perms = getTargetPermissions("dms_documents", "title");
    expect(perms.targetPermission).toBe("dms.documents.edit");
    expect(perms.dmsApplyPermission).toBe("dms.apply_to_erp.run");
  });

  it("returns dms.documents.edit for dms_document_metadata_values", () => {
    const perms = getTargetPermissions("dms_document_metadata_values", "value_text");
    expect(perms.targetPermission).toBe("dms.documents.edit");
  });

  it("returns master_data.parties.manage_licenses for party_licenses (Tier 2)", () => {
    const perms = getTargetPermissions("party_licenses", "license_number");
    expect(perms.targetPermission).toBe("master_data.parties.manage_licenses");
    expect(perms.adminPermission).toBe("master_data.parties.edit");
    expect(perms.dmsApplyPermission).toBe("dms.apply_to_erp.run");
  });

  it("returns master_data.parties.manage_tax for party_tax_registrations (Tier 2)", () => {
    const perms = getTargetPermissions("party_tax_registrations", "tax_registration_number");
    expect(perms.targetPermission).toBe("master_data.parties.manage_tax");
    expect(perms.adminPermission).toBe("master_data.parties.edit");
  });
});

// ── listTier1ApplyTargets ─────────────────────────────────────────────────────

describe("listTier1ApplyTargets", () => {
  it("returns at least 2 Tier 1 targets", () => {
    const targets = listTier1ApplyTargets();
    expect(targets.length).toBeGreaterThanOrEqual(2);
  });

  it("includes dms_documents", () => {
    const targets = listTier1ApplyTargets();
    const docTarget = targets.find((t) => t.table === "dms_documents");
    expect(docTarget).toBeDefined();
    expect(docTarget?.config.fields.length).toBeGreaterThan(0);
  });

  it("includes dms_document_metadata_values", () => {
    const targets = listTier1ApplyTargets();
    const metaTarget = targets.find((t) => t.table === "dms_document_metadata_values");
    expect(metaTarget).toBeDefined();
  });

  it("does NOT include party_licenses (Tier 1 list is DMS-only)", () => {
    const targets = listTier1ApplyTargets();
    const partyTables = targets.filter((t) => t.config.targetModule === "party");
    expect(partyTables).toHaveLength(0);
  });
});

// ── listTier2ApplyTargets ─────────────────────────────────────────────────────

describe("listTier2ApplyTargets", () => {
  it("returns exactly 2 Tier 2 targets", () => {
    const targets = listTier2ApplyTargets();
    expect(targets.length).toBe(2);
  });

  it("includes party_licenses", () => {
    const targets = listTier2ApplyTargets();
    const t = targets.find((x) => x.table === "party_licenses");
    expect(t).toBeDefined();
    expect(t?.config.targetModule).toBe("party");
    expect(t?.config.permission).toBe("master_data.parties.manage_licenses");
  });

  it("includes party_tax_registrations", () => {
    const targets = listTier2ApplyTargets();
    const t = targets.find((x) => x.table === "party_tax_registrations");
    expect(t).toBeDefined();
    expect(t?.config.targetModule).toBe("party");
    expect(t?.config.permission).toBe("master_data.parties.manage_tax");
  });

  it("does NOT include dms tables", () => {
    const targets = listTier2ApplyTargets();
    const dmsTables = targets.filter((t) => t.config.targetModule !== "party");
    expect(dmsTables).toHaveLength(0);
  });
});

// ── listAllApplyTargets ───────────────────────────────────────────────────────

describe("listAllApplyTargets", () => {
  it("returns at least 4 targets (2 Tier1 + 2 Tier2)", () => {
    const targets = listAllApplyTargets();
    expect(targets.length).toBeGreaterThanOrEqual(4);
  });

  it("includes all 4 expected tables", () => {
    const targets = listAllApplyTargets();
    const tables = targets.map((t) => t.table);
    expect(tables).toContain("dms_documents");
    expect(tables).toContain("dms_document_metadata_values");
    expect(tables).toContain("party_licenses");
    expect(tables).toContain("party_tax_registrations");
  });
});
