/**
 * ERP DMS AI Phase 16 — Apply Value Normalizer Unit Tests
 *
 * Tests:
 *   - Date normalization (ISO YYYY-MM-DD enforcement)
 *   - Date ordering (expiry_date before issue_date → error)
 *   - Text max length enforcement (including maxLength from extraContext)
 *   - Bigint positive integer enforcement
 *   - Boolean normalization
 *   - Summary truncation (max 200 chars)
 *   - maskSensitiveSummary for sensitive field codes
 *   - maskTrnSummary for TRN (tax_registration_number) fields (Tier 2)
 *   - buildPartyFieldSummary for Tier 2 party fields
 */

import { describe, it, expect } from "vitest";
import {
  normalizeApplyValue,
  buildValueSummary,
  maskSensitiveSummary,
  truncateSummary,
  maskTrnSummary,
  buildPartyFieldSummary,
} from "../apply-value-normalizer";

// ── normalizeApplyValue — dates ───────────────────────────────────────────────

describe("normalizeApplyValue — date", () => {
  it("accepts valid ISO date", () => {
    const result = normalizeApplyValue("2025-06-15", "date", "issue_date");
    expect(result.valid).toBe(true);
    expect(result.normalizedValue).toBe("2025-06-15");
  });

  it("rejects non-ISO date format (DD/MM/YYYY)", () => {
    const result = normalizeApplyValue("15/06/2025", "date", "issue_date");
    expect(result.valid).toBe(false);
    expect(result.validationError).toContain("YYYY-MM-DD");
  });

  it("rejects invalid date (month 13)", () => {
    const result = normalizeApplyValue("2025-13-01", "date", "issue_date");
    expect(result.valid).toBe(false);
  });

  it("rejects expiry_date before issue_date", () => {
    const result = normalizeApplyValue(
      "2024-01-01",
      "date",
      "expiry_date",
      { issueDate: "2025-06-15" }
    );
    expect(result.valid).toBe(false);
    expect(result.validationError).toContain("expiry_date");
  });

  it("accepts expiry_date after issue_date", () => {
    const result = normalizeApplyValue(
      "2026-12-31",
      "date",
      "expiry_date",
      { issueDate: "2025-06-15" }
    );
    expect(result.valid).toBe(true);
    expect(result.normalizedValue).toBe("2026-12-31");
  });

  it("accepts expiry_date when no issue_date provided", () => {
    const result = normalizeApplyValue("2025-01-01", "date", "expiry_date");
    expect(result.valid).toBe(true);
  });

  it("rejects null date", () => {
    const result = normalizeApplyValue(null, "date", "issue_date");
    expect(result.valid).toBe(false);
  });

  it("rejects empty string date", () => {
    const result = normalizeApplyValue("", "date", "issue_date");
    expect(result.valid).toBe(false);
  });
});

// ── normalizeApplyValue — text ────────────────────────────────────────────────

describe("normalizeApplyValue — text", () => {
  it("accepts normal text", () => {
    const result = normalizeApplyValue("Contract Agreement 2025", "text", "title");
    expect(result.valid).toBe(true);
    expect(result.normalizedValue).toBe("Contract Agreement 2025");
  });

  it("trims whitespace", () => {
    const result = normalizeApplyValue("  Trimmed  ", "text", "title");
    expect(result.valid).toBe(true);
    expect(result.normalizedValue).toBe("Trimmed");
  });

  it("rejects title exceeding 200 chars", () => {
    const long = "a".repeat(201);
    const result = normalizeApplyValue(long, "text", "title");
    expect(result.valid).toBe(false);
    expect(result.validationError).toContain("200");
  });

  it("accepts title exactly 200 chars", () => {
    const exact = "a".repeat(200);
    const result = normalizeApplyValue(exact, "text", "title");
    expect(result.valid).toBe(true);
  });

  it("rejects description exceeding 500 chars", () => {
    const long = "b".repeat(501);
    const result = normalizeApplyValue(long, "text", "description");
    expect(result.valid).toBe(false);
    expect(result.validationError).toContain("500");
  });

  it("accepts description exactly 500 chars", () => {
    const exact = "b".repeat(500);
    const result = normalizeApplyValue(exact, "text", "description");
    expect(result.valid).toBe(true);
  });

  it("rejects empty text", () => {
    const result = normalizeApplyValue("", "text", "title");
    expect(result.valid).toBe(false);
  });

  it("rejects null text", () => {
    const result = normalizeApplyValue(null, "text", "title");
    expect(result.valid).toBe(false);
  });
});

// ── normalizeApplyValue — bigint ──────────────────────────────────────────────

describe("normalizeApplyValue — bigint", () => {
  it("accepts positive integer", () => {
    const result = normalizeApplyValue(42, "bigint", "owning_company_id");
    expect(result.valid).toBe(true);
    expect(result.normalizedValue).toBe(42);
  });

  it("accepts numeric string", () => {
    const result = normalizeApplyValue("123", "bigint", "party_id");
    expect(result.valid).toBe(true);
    expect(result.normalizedValue).toBe(123);
  });

  it("rejects zero", () => {
    const result = normalizeApplyValue(0, "bigint", "owning_company_id");
    expect(result.valid).toBe(false);
    expect(result.validationError).toContain("positive");
  });

  it("rejects negative integer", () => {
    const result = normalizeApplyValue(-5, "bigint", "party_id");
    expect(result.valid).toBe(false);
  });

  it("rejects float", () => {
    const result = normalizeApplyValue(3.14, "bigint", "owning_branch_id");
    expect(result.valid).toBe(false);
  });

  it("rejects non-numeric string", () => {
    const result = normalizeApplyValue("not-a-number", "bigint", "owning_company_id");
    expect(result.valid).toBe(false);
  });
});

// ── normalizeApplyValue — boolean ─────────────────────────────────────────────

describe("normalizeApplyValue — boolean", () => {
  it("accepts boolean true", () => {
    const result = normalizeApplyValue(true, "boolean", "some_flag");
    expect(result.valid).toBe(true);
    expect(result.normalizedValue).toBe(true);
  });

  it("accepts boolean false", () => {
    const result = normalizeApplyValue(false, "boolean", "some_flag");
    expect(result.valid).toBe(true);
    expect(result.normalizedValue).toBe(false);
  });

  it("accepts 'true' string", () => {
    const result = normalizeApplyValue("true", "boolean", "some_flag");
    expect(result.valid).toBe(true);
    expect(result.normalizedValue).toBe(true);
  });

  it("accepts '1' string", () => {
    const result = normalizeApplyValue("1", "boolean", "some_flag");
    expect(result.valid).toBe(true);
    expect(result.normalizedValue).toBe(true);
  });

  it("accepts 'false' string", () => {
    const result = normalizeApplyValue("false", "boolean", "some_flag");
    expect(result.valid).toBe(true);
    expect(result.normalizedValue).toBe(false);
  });

  it("rejects invalid boolean string", () => {
    const result = normalizeApplyValue("maybe", "boolean", "some_flag");
    expect(result.valid).toBe(false);
  });
});

// ── buildValueSummary ─────────────────────────────────────────────────────────

describe("buildValueSummary", () => {
  it("returns null for null value", () => {
    expect(buildValueSummary(null, "text")).toBeNull();
  });

  it("returns string for text value", () => {
    expect(buildValueSummary("Hello World", "text")).toBe("Hello World");
  });

  it("truncates to 200 chars for long text", () => {
    const long = "a".repeat(250);
    const result = buildValueSummary(long, "text");
    expect(result?.length).toBeLessThanOrEqual(200);
    expect(result?.endsWith("...")).toBe(true);
  });

  it("returns date string as-is", () => {
    expect(buildValueSummary("2025-06-15", "date")).toBe("2025-06-15");
  });

  it("returns boolean as 'true'/'false'", () => {
    expect(buildValueSummary(true, "boolean")).toBe("true");
    expect(buildValueSummary(false, "boolean")).toBe("false");
  });

  it("returns bigint as string", () => {
    expect(buildValueSummary(42, "bigint")).toBe("42");
  });
});

// ── truncateSummary ───────────────────────────────────────────────────────────

describe("truncateSummary", () => {
  it("returns null for null input", () => {
    expect(truncateSummary(null)).toBeNull();
  });

  it("returns value unchanged if within 200 chars", () => {
    const short = "Hello!";
    expect(truncateSummary(short)).toBe(short);
  });

  it("truncates and adds ellipsis when > 200 chars", () => {
    const long = "x".repeat(250);
    const result = truncateSummary(long);
    expect(result?.length).toBe(200);
    expect(result?.endsWith("...")).toBe(true);
  });
});

// ── maskSensitiveSummary ──────────────────────────────────────────────────────

describe("maskSensitiveSummary", () => {
  it("masks iban field", () => {
    const result = maskSensitiveSummary("iban", "AE290860000001234567890");
    expect(result).toContain("[masked");
  });

  it("masks account_number field", () => {
    const result = maskSensitiveSummary("account_number", "1234567890");
    expect(result).toContain("[masked");
  });

  it("masks salary field", () => {
    const result = maskSensitiveSummary("basic_salary", "5000");
    expect(result).toContain("[masked");
  });

  it("does NOT mask title field", () => {
    const result = maskSensitiveSummary("title", "Service Agreement 2025");
    expect(result).toBe("Service Agreement 2025");
  });

  it("does NOT mask issue_date field", () => {
    const result = maskSensitiveSummary("issue_date", "2025-01-01");
    expect(result).toBe("2025-01-01");
  });

  it("masks tax_registration_number with TRN partial masking (not full)", () => {
    const result = maskSensitiveSummary("tax_registration_number", "100123456789003");
    // Should be TRN-style partial mask, not [masked: string]
    expect(result).not.toContain("[masked");
    expect(result).toContain("****");
  });

  it("masks trn field with TRN partial masking", () => {
    const result = maskSensitiveSummary("trn", "100123456789003");
    expect(result).toContain("****");
    expect(result).not.toContain("[masked");
  });
});

// ── maskTrnSummary (Tier 2) ───────────────────────────────────────────────────

describe("maskTrnSummary", () => {
  it("returns '****' for empty string", () => {
    expect(maskTrnSummary("")).toBe("****");
  });

  it("returns '****' for value of length <= 8", () => {
    expect(maskTrnSummary("1234567")).toBe("****");
    expect(maskTrnSummary("12345678")).toBe("****");
  });

  it("masks long TRN as first4****last4", () => {
    const result = maskTrnSummary("100123456789003");
    expect(result).toBe("1001****9003");
  });

  it("masks exactly 9-char TRN correctly", () => {
    const result = maskTrnSummary("123456789");
    expect(result).toBe("1234****6789");
  });

  it("preserves first 4 and last 4 chars", () => {
    const trn = "ABCD12345678WXYZ";
    const result = maskTrnSummary(trn);
    expect(result.startsWith("ABCD")).toBe(true);
    expect(result.endsWith("WXYZ")).toBe(true);
    expect(result).toContain("****");
  });
});

// ── buildPartyFieldSummary (Tier 2) ───────────────────────────────────────────

describe("buildPartyFieldSummary", () => {
  it("masks tax_registration_number field", () => {
    const result = buildPartyFieldSummary("tax_registration_number", "100123456789003", "text");
    expect(result).toBe("1001****9003");
  });

  it("does NOT mask license_number field", () => {
    const result = buildPartyFieldSummary("license_number", "DXB-2025-123456", "text");
    expect(result).toBe("DXB-2025-123456");
  });

  it("returns null for null value", () => {
    const result = buildPartyFieldSummary("license_number", null, "text");
    expect(result).toBeNull();
  });

  it("returns null for empty string value", () => {
    const result = buildPartyFieldSummary("expiry_date", "", "date");
    expect(result).toBeNull();
  });

  it("returns date string as-is for date fields", () => {
    const result = buildPartyFieldSummary("expiry_date", "2026-12-31", "date");
    expect(result).toBe("2026-12-31");
  });
});

// ── normalizeApplyValue with maxLength extraContext (Tier 2) ──────────────────

describe("normalizeApplyValue — maxLength extraContext (Tier 2)", () => {
  it("accepts text within maxLength", () => {
    const result = normalizeApplyValue("Short remarks", "text", "remarks", { maxLength: 1000 });
    expect(result.valid).toBe(true);
    expect(result.normalizedValue).toBe("Short remarks");
  });

  it("rejects text exceeding maxLength from extraContext", () => {
    const long = "x".repeat(1001);
    const result = normalizeApplyValue(long, "text", "remarks", { maxLength: 1000 });
    expect(result.valid).toBe(false);
    expect(result.validationError).toContain("1000 chars");
  });

  it("uses maxLength 100 for tax_registration_number", () => {
    const valid100 = "X".repeat(100);
    const result = normalizeApplyValue(valid100, "text", "tax_registration_number", { maxLength: 100 });
    expect(result.valid).toBe(true);

    const tooLong = "X".repeat(101);
    const fail = normalizeApplyValue(tooLong, "text", "tax_registration_number", { maxLength: 100 });
    expect(fail.valid).toBe(false);
  });
});
