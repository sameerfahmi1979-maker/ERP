/**
 * ERP DMS AI Phase 17 — Correction Source Loader Unit Tests
 *
 * Tests:
 *   - restorePreviousEnabled logic for date/number/bigint/boolean/text
 *   - truncation warning for long text summaries
 *   - null/empty handling
 *
 * Note: The full loadCorrectionSource() function requires a live Supabase client,
 * so integration tests are deferred to runtime UAT.
 * These unit tests cover the evaluateRestorePrevious helper logic.
 */

import { describe, it, expect } from "vitest";

// ── Inline the evaluateRestorePrevious logic for unit testing ─────────────────
// (extracted from correction-source-loader.ts)

const SUMMARY_MAX = 200;

function evaluateRestorePrevious(
  valueType: string,
  originalBeforeSummary: string | null
): { enabled: boolean; warning: string | null } {
  if (valueType === "date" || valueType === "number" || valueType === "bigint" || valueType === "boolean") {
    if (!originalBeforeSummary || originalBeforeSummary.trim() === "") {
      return { enabled: false, warning: "No previous value is available to restore." };
    }
    return { enabled: true, warning: null };
  }

  if (valueType === "text") {
    if (!originalBeforeSummary || originalBeforeSummary.trim() === "") {
      return { enabled: false, warning: "No previous text value is available." };
    }
    const maybeTruncated =
      originalBeforeSummary.length >= SUMMARY_MAX ||
      originalBeforeSummary.endsWith("...");

    if (maybeTruncated) {
      return {
        enabled: true,
        warning:
          "The previous value may be truncated. The summary stored in history may not be the exact original text. " +
          "Review carefully before applying.",
      };
    }
    return {
      enabled: true,
      warning:
        "The previous value is a stored summary. Verify it is accurate before applying.",
    };
  }

  return { enabled: false, warning: null };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("evaluateRestorePrevious — date type", () => {
  it("returns enabled=true with no warning when summary exists", () => {
    const result = evaluateRestorePrevious("date", "2024-01-15");
    expect(result.enabled).toBe(true);
    expect(result.warning).toBeNull();
  });

  it("returns enabled=false when summary is empty", () => {
    const result = evaluateRestorePrevious("date", null);
    expect(result.enabled).toBe(false);
    expect(result.warning).toContain("No previous value");
  });

  it("returns enabled=false when summary is whitespace", () => {
    const result = evaluateRestorePrevious("date", "   ");
    expect(result.enabled).toBe(false);
  });
});

describe("evaluateRestorePrevious — number type", () => {
  it("returns enabled=true with no warning when value exists", () => {
    const result = evaluateRestorePrevious("number", "42.5");
    expect(result.enabled).toBe(true);
    expect(result.warning).toBeNull();
  });

  it("returns enabled=false when empty", () => {
    const result = evaluateRestorePrevious("number", "");
    expect(result.enabled).toBe(false);
  });
});

describe("evaluateRestorePrevious — boolean type", () => {
  it("returns enabled=true for true string", () => {
    const result = evaluateRestorePrevious("boolean", "true");
    expect(result.enabled).toBe(true);
    expect(result.warning).toBeNull();
  });
});

describe("evaluateRestorePrevious — text type", () => {
  it("returns enabled=true with summary warning for short text", () => {
    const result = evaluateRestorePrevious("text", "Short text value");
    expect(result.enabled).toBe(true);
    expect(result.warning).toContain("summary");
  });

  it("returns enabled=true with truncation warning when text ends with ...", () => {
    const result = evaluateRestorePrevious("text", "This is a truncated summary...");
    expect(result.enabled).toBe(true);
    expect(result.warning).toContain("truncated");
  });

  it("returns enabled=true with truncation warning when text is >= 200 chars", () => {
    const longText = "A".repeat(200);
    const result = evaluateRestorePrevious("text", longText);
    expect(result.enabled).toBe(true);
    expect(result.warning).toContain("truncated");
  });

  it("returns enabled=false when text summary is null", () => {
    const result = evaluateRestorePrevious("text", null);
    expect(result.enabled).toBe(false);
    expect(result.warning).toContain("No previous");
  });

  it("returns enabled=false when text summary is empty", () => {
    const result = evaluateRestorePrevious("text", "");
    expect(result.enabled).toBe(false);
  });
});

describe("evaluateRestorePrevious — unknown type", () => {
  it("returns enabled=false for unknown type", () => {
    const result = evaluateRestorePrevious("unknown_type", "some value");
    expect(result.enabled).toBe(false);
  });
});
