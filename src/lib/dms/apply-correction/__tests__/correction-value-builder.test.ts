/**
 * ERP DMS AI Phase 17 — Correction Value Builder Unit Tests
 *
 * Tests:
 *   - Scalar-only validation (rejects arrays and objects)
 *   - Null/empty rejection
 *   - Type normalization (date, text, number, boolean, bigint)
 *   - TRN masking in summary
 *   - Sensitive field code blocking
 *   - Summary truncation
 */

import { describe, it, expect } from "vitest";
import { buildCorrectionValue } from "../correction-value-builder";

// ── Reject empty ──────────────────────────────────────────────────────────────

describe("buildCorrectionValue — empty/null rejection", () => {
  it("rejects null value", () => {
    const result = buildCorrectionValue(null, "text", "license_name");
    expect(result.ok).toBe(false);
  });

  it("rejects empty string", () => {
    const result = buildCorrectionValue("", "text", "license_name");
    expect(result.ok).toBe(false);
  });

  it("rejects undefined", () => {
    const result = buildCorrectionValue(undefined, "text", "license_name");
    expect(result.ok).toBe(false);
  });
});

// ── Reject non-scalar ─────────────────────────────────────────────────────────

describe("buildCorrectionValue — scalar-only rule", () => {
  it("rejects arrays", () => {
    const result = buildCorrectionValue(["a", "b"] as unknown as string, "text", "license_name");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("scalar");
    }
  });

  it("rejects nested objects", () => {
    const result = buildCorrectionValue({ key: "value" } as unknown as string, "text", "license_name");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("scalar");
    }
  });
});

// ── Forbidden field codes ─────────────────────────────────────────────────────

describe("buildCorrectionValue — forbidden field codes", () => {
  it("rejects ocr_text", () => {
    const result = buildCorrectionValue("some text", "text", "ocr_text");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("ocr_text");
    }
  });

  it("rejects raw_response", () => {
    const result = buildCorrectionValue("some text", "text", "raw_response");
    expect(result.ok).toBe(false);
  });

  it("rejects api_key", () => {
    const result = buildCorrectionValue("somekey123", "text", "api_key");
    expect(result.ok).toBe(false);
  });
});

// ── Date normalization ────────────────────────────────────────────────────────

describe("buildCorrectionValue — date type", () => {
  it("accepts valid ISO date", () => {
    const result = buildCorrectionValue("2025-06-15", "date", "issue_date");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.correctionValueJson.v).toBe("2025-06-15");
    }
  });

  it("rejects non-ISO date format", () => {
    const result = buildCorrectionValue("15/06/2025", "date", "issue_date");
    expect(result.ok).toBe(false);
  });
});

// ── Text normalization ────────────────────────────────────────────────────────

describe("buildCorrectionValue — text type", () => {
  it("accepts valid text", () => {
    const result = buildCorrectionValue("Trade License ABC-123", "text", "license_name");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.correctionValueJson.v).toBe("Trade License ABC-123");
    }
  });

  it("truncates summary to 200 chars", () => {
    const longText = "A".repeat(300);
    const result = buildCorrectionValue(longText, "text", "license_name");
    if (result.ok) {
      expect(result.proposedCorrectionSummary.length).toBeLessThanOrEqual(200);
    }
  });
});

// ── Number normalization ──────────────────────────────────────────────────────

describe("buildCorrectionValue — number type", () => {
  it("accepts valid number string", () => {
    const result = buildCorrectionValue("42.5", "number", "some_amount");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(typeof result.correctionValueJson.v).toBe("number");
      expect(result.correctionValueJson.v).toBe(42.5);
    }
  });

  it("rejects NaN string", () => {
    const result = buildCorrectionValue("abc", "number", "some_amount");
    expect(result.ok).toBe(false);
  });
});

// ── Boolean normalization ─────────────────────────────────────────────────────

describe("buildCorrectionValue — boolean type", () => {
  it("accepts true string", () => {
    const result = buildCorrectionValue("true", "boolean", "is_active");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.correctionValueJson.v).toBe(true);
    }
  });

  it("accepts false string", () => {
    const result = buildCorrectionValue("false", "boolean", "is_active");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.correctionValueJson.v).toBe(false);
    }
  });

  it("accepts 'yes' as boolean true (Phase 16 normalizer accepts yes/no)", () => {
    const result = buildCorrectionValue("yes", "boolean", "is_active");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.correctionValueJson.v).toBe(true);
    }
  });

  it("rejects invalid boolean string ('maybe')", () => {
    const result = buildCorrectionValue("maybe", "boolean", "is_active");
    expect(result.ok).toBe(false);
  });
});

// ── Bigint normalization ──────────────────────────────────────────────────────

describe("buildCorrectionValue — bigint type", () => {
  it("accepts positive integer", () => {
    const result = buildCorrectionValue("123", "bigint", "party_id");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.correctionValueJson.v).toBe(123);
    }
  });

  it("rejects zero", () => {
    const result = buildCorrectionValue("0", "bigint", "party_id");
    expect(result.ok).toBe(false);
  });

  it("rejects negative integer", () => {
    const result = buildCorrectionValue("-5", "bigint", "party_id");
    expect(result.ok).toBe(false);
  });
});

// ── TRN masking ───────────────────────────────────────────────────────────────

describe("buildCorrectionValue — TRN masking in summary", () => {
  it("masks tax_registration_number in summary", () => {
    const result = buildCorrectionValue("100123456789003", "text", "tax_registration_number");
    if (result.ok) {
      expect(result.proposedCorrectionSummary).toMatch(/^\d{4}\*{4}\d{4}$/);
      expect(result.proposedCorrectionSummary).not.toBe("100123456789003");
    }
  });

  it("masks short TRN (≤8 chars) as ****", () => {
    const result = buildCorrectionValue("1234567", "text", "tax_registration_number");
    if (result.ok) {
      expect(result.proposedCorrectionSummary).toBe("****");
    }
  });
});

// ── Sensitive field masking ───────────────────────────────────────────────────

describe("buildCorrectionValue — sensitive field masking", () => {
  it("masks IBAN in summary", () => {
    const result = buildCorrectionValue("AE120331234567890123456", "text", "iban");
    if (result.ok) {
      expect(result.proposedCorrectionSummary).toBe("****");
    }
  });
});
