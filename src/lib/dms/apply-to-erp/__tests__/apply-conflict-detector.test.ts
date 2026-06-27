/**
 * ERP DMS AI Phase 16 — Apply Conflict Detector Unit Tests
 *
 * Tier 1 tests:
 *   - Missing record → conflict
 *   - Deleted record → conflict
 *   - Field has existing value + replaceExistingConfirmed=false → conflict
 *   - Field has existing value + replaceExistingConfirmed=true → no conflict (if unchanged)
 *   - Field was empty in preview but now has value → conflict
 *   - Field value changed since preview → conflict
 *   - No conflict when field is empty and preview was also empty
 *
 * Tier 2 tests (party_licenses, party_tax_registrations):
 *   - null row → target_record_not_found conflict
 *   - party_id mismatch → target_party_mismatch conflict
 *   - is_active=false → target_record_inactive conflict
 *   - field value changed → target_field_changed conflict
 *   - replace not confirmed → replace_existing_not_confirmed conflict
 *   - safe apply succeeds
 */

import { describe, it, expect } from "vitest";
import {
  detectDmsDocumentFieldConflict,
  detectMetadataValueConflict,
  detectPartyLicenseFieldConflict,
  detectPartyTaxFieldConflict,
  type DmsDocumentRecord,
  type DmsMetadataValueRecord,
  type PartyLicenseRecord,
  type PartyTaxRecord,
} from "../apply-conflict-detector";

// ── Helper ─────────────────────────────────────────────────────────────────────

function makeDoc(overrides: Partial<DmsDocumentRecord> = {}): DmsDocumentRecord {
  return {
    id:                100,
    owning_company_id: null,
    owning_branch_id:  null,
    party_id:          null,
    issue_date:        null,
    expiry_date:       null,
    title:             null,
    description:       null,
    deleted_at:        null,
    ...overrides,
  };
}

// ── detectDmsDocumentFieldConflict ────────────────────────────────────────────

describe("detectDmsDocumentFieldConflict", () => {
  it("returns conflict when record is null (not found)", () => {
    const result = detectDmsDocumentFieldConflict(null, "title", null, false);
    expect(result.conflict).toBe(true);
    if (result.conflict) {
      expect(result.reason).toContain("not found");
    }
  });

  it("returns conflict when record is deleted", () => {
    const doc = makeDoc({ deleted_at: "2026-01-01T00:00:00Z" });
    const result = detectDmsDocumentFieldConflict(doc, "title", null, false);
    expect(result.conflict).toBe(true);
    if (result.conflict) {
      expect(result.reason).toContain("deleted");
    }
  });

  it("returns conflict when field already has value and replaceExistingConfirmed=false", () => {
    const doc = makeDoc({ title: "Existing Title" });
    const result = detectDmsDocumentFieldConflict(doc, "title", null, false);
    expect(result.conflict).toBe(true);
    if (result.conflict) {
      expect(result.reason).toContain("already has a value");
    }
  });

  it("returns NO conflict when field already has value and replaceExistingConfirmed=true (value unchanged)", () => {
    const doc = makeDoc({ title: "Existing Title" });
    // previewCurrentValue matches live value (user confirmed replace)
    const result = detectDmsDocumentFieldConflict(doc, "title", "Existing Title", true);
    expect(result.conflict).toBe(false);
  });

  it("returns conflict when field value changed since preview (stale)", () => {
    const doc = makeDoc({ title: "New Title" });
    // Preview showed "Old Title" but live is now "New Title"
    const result = detectDmsDocumentFieldConflict(doc, "title", "Old Title", true);
    expect(result.conflict).toBe(true);
    if (result.conflict) {
      expect(result.reason).toContain("changed since preview");
    }
  });

  it("returns NO conflict when field was empty and preview was also empty", () => {
    const doc = makeDoc({ owning_company_id: null });
    const result = detectDmsDocumentFieldConflict(doc, "owning_company_id", null, false);
    expect(result.conflict).toBe(false);
  });

  it("returns NO conflict for FK field when empty and replaceExistingConfirmed=false", () => {
    const doc = makeDoc({ party_id: null });
    const result = detectDmsDocumentFieldConflict(doc, "party_id", null, false);
    expect(result.conflict).toBe(false);
  });

  it("returns conflict when preview showed empty but field now has value (race condition)", () => {
    const doc = makeDoc({ owning_company_id: 42 });
    // Preview showed null but now there's a value
    const result = detectDmsDocumentFieldConflict(doc, "owning_company_id", null, false);
    expect(result.conflict).toBe(true);
  });
});

// ── detectMetadataValueConflict ───────────────────────────────────────────────

describe("detectMetadataValueConflict", () => {
  it("returns NO conflict when row doesn't exist yet (new insert)", () => {
    const result = detectMetadataValueConflict(null, "value_text", null, false);
    expect(result.conflict).toBe(false);
  });

  it("returns conflict when row exists with value and replaceExistingConfirmed=false", () => {
    const row: DmsMetadataValueRecord = {
      id: 1, definition_id: 10, document_id: 100,
      value_text: "existing value", value_number: null, value_date: null, value_boolean: null,
    };
    const result = detectMetadataValueConflict(row, "value_text", null, false);
    expect(result.conflict).toBe(true);
  });

  it("returns NO conflict when row exists with value and replaceExistingConfirmed=true (unchanged)", () => {
    const row: DmsMetadataValueRecord = {
      id: 1, definition_id: 10, document_id: 100,
      value_text: "existing value", value_number: null, value_date: null, value_boolean: null,
    };
    const result = detectMetadataValueConflict(row, "value_text", "existing value", true);
    expect(result.conflict).toBe(false);
  });

  it("returns conflict when value changed since preview", () => {
    const row: DmsMetadataValueRecord = {
      id: 1, definition_id: 10, document_id: 100,
      value_text: "updated value", value_number: null, value_date: null, value_boolean: null,
    };
    const result = detectMetadataValueConflict(row, "value_text", "original value", true);
    expect(result.conflict).toBe(true);
    if (result.conflict) {
      expect(result.reason).toContain("changed since preview");
    }
  });

  it("returns NO conflict when row exists but field is null and preview was null", () => {
    const row: DmsMetadataValueRecord = {
      id: 1, definition_id: 10, document_id: 100,
      value_text: null, value_number: null, value_date: null, value_boolean: null,
    };
    const result = detectMetadataValueConflict(row, "value_text", null, false);
    expect(result.conflict).toBe(false);
  });

  it("handles date field conflict correctly", () => {
    const row: DmsMetadataValueRecord = {
      id: 1, definition_id: 10, document_id: 100,
      value_text: null, value_number: null, value_date: "2025-01-01", value_boolean: null,
    };
    const result = detectMetadataValueConflict(row, "value_date", null, false);
    expect(result.conflict).toBe(true);
  });

  it("handles number field conflict correctly", () => {
    const row: DmsMetadataValueRecord = {
      id: 1, definition_id: 10, document_id: 100,
      value_text: null, value_number: 99.5, value_date: null, value_boolean: null,
    };
    const result = detectMetadataValueConflict(row, "value_number", "99.5", true);
    expect(result.conflict).toBe(false);  // same value, replace confirmed
  });
});

// ── detectPartyLicenseFieldConflict (Tier 2) ──────────────────────────────────

function makeLicense(overrides: Partial<PartyLicenseRecord> = {}): PartyLicenseRecord {
  return {
    id:        200,
    party_id:  10,
    is_active: true,
    ...overrides,
  };
}

describe("detectPartyLicenseFieldConflict", () => {
  it("conflicts when row is null (target_record_not_found)", () => {
    const result = detectPartyLicenseFieldConflict(null, 10, "license_number", null, false);
    expect(result.conflict).toBe(true);
    if (result.conflict) expect(result.reason).toBe("target_record_not_found");
  });

  it("conflicts when party_id mismatches (target_party_mismatch)", () => {
    const row = makeLicense({ party_id: 99 });
    const result = detectPartyLicenseFieldConflict(row, 10, "license_number", null, false);
    expect(result.conflict).toBe(true);
    if (result.conflict) expect(result.reason).toBe("target_party_mismatch");
  });

  it("conflicts when is_active=false (target_record_inactive)", () => {
    const row = makeLicense({ is_active: false });
    const result = detectPartyLicenseFieldConflict(row, 10, "license_number", null, false);
    expect(result.conflict).toBe(true);
    if (result.conflict) expect(result.reason).toBe("target_record_inactive");
  });

  it("conflicts when existing value and replace not confirmed (replace_existing_not_confirmed)", () => {
    const row = makeLicense({ license_number: "DXB-2024-001" });
    const result = detectPartyLicenseFieldConflict(row, 10, "license_number", "DXB-2024-001", false);
    expect(result.conflict).toBe(true);
    if (result.conflict) expect(result.reason).toBe("replace_existing_not_confirmed");
  });

  it("conflicts when field changed since preview (target_field_changed)", () => {
    const row = makeLicense({ license_number: "DXB-2024-CHANGED" });
    const result = detectPartyLicenseFieldConflict(row, 10, "license_number", "DXB-2024-ORIGINAL", true);
    expect(result.conflict).toBe(true);
    if (result.conflict) expect(result.reason).toBe("target_field_changed");
  });

  it("no conflict: empty field, empty preview, replace=false", () => {
    const row = makeLicense({ license_number: null });
    const result = detectPartyLicenseFieldConflict(row, 10, "license_number", null, false);
    expect(result.conflict).toBe(false);
  });

  it("no conflict: existing value, replace confirmed, same preview value", () => {
    const row = makeLicense({ license_number: "DXB-2024-001" });
    const result = detectPartyLicenseFieldConflict(row, 10, "license_number", "DXB-2024-001", true);
    expect(result.conflict).toBe(false);
  });
});

// ── detectPartyTaxFieldConflict (Tier 2) ─────────────────────────────────────

function makeTax(overrides: Partial<PartyTaxRecord> = {}): PartyTaxRecord {
  return {
    id:        300,
    party_id:  10,
    is_active: true,
    ...overrides,
  };
}

describe("detectPartyTaxFieldConflict", () => {
  it("conflicts when row is null (target_record_not_found)", () => {
    const result = detectPartyTaxFieldConflict(null, 10, "tax_registration_number", null, false);
    expect(result.conflict).toBe(true);
    if (result.conflict) expect(result.reason).toBe("target_record_not_found");
  });

  it("conflicts when party_id mismatches (target_party_mismatch)", () => {
    const row = makeTax({ party_id: 99 });
    const result = detectPartyTaxFieldConflict(row, 10, "tax_registration_number", null, false);
    expect(result.conflict).toBe(true);
    if (result.conflict) expect(result.reason).toBe("target_party_mismatch");
  });

  it("conflicts when is_active=false (target_record_inactive)", () => {
    const row = makeTax({ is_active: false });
    const result = detectPartyTaxFieldConflict(row, 10, "tax_registration_number", null, false);
    expect(result.conflict).toBe(true);
    if (result.conflict) expect(result.reason).toBe("target_record_inactive");
  });

  it("conflicts when existing TRN and replace not confirmed (replace_existing_not_confirmed)", () => {
    const row = makeTax({ tax_registration_number: "100123456789003" });
    const result = detectPartyTaxFieldConflict(row, 10, "tax_registration_number", "100123456789003", false);
    expect(result.conflict).toBe(true);
    if (result.conflict) expect(result.reason).toBe("replace_existing_not_confirmed");
  });

  it("conflicts when TRN changed since preview (target_field_changed)", () => {
    const row = makeTax({ tax_registration_number: "100999999999003" });
    const result = detectPartyTaxFieldConflict(row, 10, "tax_registration_number", "100123456789003", true);
    expect(result.conflict).toBe(true);
    if (result.conflict) expect(result.reason).toBe("target_field_changed");
  });

  it("no conflict: empty TRN field, replace=false", () => {
    const row = makeTax({ tax_registration_number: null });
    const result = detectPartyTaxFieldConflict(row, 10, "tax_registration_number", null, false);
    expect(result.conflict).toBe(false);
  });

  it("no conflict: replace confirmed, same value", () => {
    const row = makeTax({ tax_registration_number: "100123456789003" });
    const result = detectPartyTaxFieldConflict(row, 10, "tax_registration_number", "100123456789003", true);
    expect(result.conflict).toBe(false);
  });
});
