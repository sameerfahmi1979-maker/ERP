/**
 * ERP DMS AI Phase 15 — Unit Tests for safe-usage-redaction.ts
 *
 * Tests pure functions only (no DB, no network, no external dependencies).
 * Verifies that all blocked keys are stripped and safe keys are retained.
 */

import { describe, it, expect } from "vitest";
import {
  buildSafeMetadata,
  sanitizeErrorMessage,
  extractSafeUsageDisplayFields,
} from "../safe-usage-redaction";

// ─── buildSafeMetadata ───────────────────────────────────────────────────────

describe("buildSafeMetadata", () => {
  it("returns null for null input", () => {
    expect(buildSafeMetadata(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(buildSafeMetadata(undefined)).toBeNull();
  });

  it("returns null for empty object", () => {
    expect(buildSafeMetadata({})).toBeNull();
  });

  it("strips 'prompt' key", () => {
    const result = buildSafeMetadata({ prompt: "tell me everything" });
    expect(result).toBeNull();
  });

  it("strips 'raw_prompt' key", () => {
    const result = buildSafeMetadata({ raw_prompt: "raw text" });
    expect(result).toBeNull();
  });

  it("strips 'system_prompt' key", () => {
    const result = buildSafeMetadata({ system_prompt: "You are an AI" });
    expect(result).toBeNull();
  });

  it("strips 'user_prompt' key", () => {
    const result = buildSafeMetadata({ user_prompt: "what is this?" });
    expect(result).toBeNull();
  });

  it("strips 'raw_response' key", () => {
    const result = buildSafeMetadata({ raw_response: "AI said..." });
    expect(result).toBeNull();
  });

  it("strips 'response_text' key", () => {
    const result = buildSafeMetadata({ response_text: "content here" });
    expect(result).toBeNull();
  });

  it("strips 'ocr_text' key", () => {
    const result = buildSafeMetadata({ ocr_text: "scanned content" });
    expect(result).toBeNull();
  });

  it("strips 'content_text' key", () => {
    const result = buildSafeMetadata({ content_text: "document body" });
    expect(result).toBeNull();
  });

  it("strips 'chunk_text' key", () => {
    const result = buildSafeMetadata({ chunk_text: "semantic chunk" });
    expect(result).toBeNull();
  });

  it("strips 'full_text' key", () => {
    const result = buildSafeMetadata({ full_text: "full document" });
    expect(result).toBeNull();
  });

  it("strips 'api_key' key", () => {
    const result = buildSafeMetadata({ api_key: "sk-abc123" });
    expect(result).toBeNull();
  });

  it("strips 'secret' key", () => {
    const result = buildSafeMetadata({ secret: "mysecret" });
    expect(result).toBeNull();
  });

  it("strips 'password' key", () => {
    const result = buildSafeMetadata({ password: "hunter2" });
    expect(result).toBeNull();
  });

  it("strips 'token' key", () => {
    const result = buildSafeMetadata({ token: "bearer-abc" });
    expect(result).toBeNull();
  });

  it("strips 'bearer' key", () => {
    const result = buildSafeMetadata({ bearer: "abc" });
    expect(result).toBeNull();
  });

  it("strips 'embedding' key", () => {
    const result = buildSafeMetadata({ embedding: [0.1, 0.2, 0.3] });
    expect(result).toBeNull();
  });

  it("strips 'vector' key", () => {
    const result = buildSafeMetadata({ vector: [0.1, 0.2] });
    expect(result).toBeNull();
  });

  it("strips 'embeddings' key", () => {
    const result = buildSafeMetadata({ embeddings: [[0.1, 0.2]] });
    expect(result).toBeNull();
  });

  it("strips 'provider_response' key", () => {
    const result = buildSafeMetadata({ provider_response: { choices: [] } });
    expect(result).toBeNull();
  });

  it("retains safe keys: model_id, source, chunk_count", () => {
    const result = buildSafeMetadata({
      model_id: "gpt-4o",
      source: "post_approve",
      chunk_count: 5,
    });
    expect(result).toEqual({ model_id: "gpt-4o", source: "post_approve", chunk_count: 5 });
  });

  it("CRITICAL: does NOT strip 'prompt_version' (safe key)", () => {
    const result = buildSafeMetadata({ prompt_version: "v1.2" });
    expect(result).not.toBeNull();
    expect(result?.prompt_version).toBe("v1.2");
  });

  it("retains boolean and number values", () => {
    const result = buildSafeMetadata({
      embedded_count: 10,
      failed_count: 0,
      input_truncated: false,
    });
    expect(result).toEqual({ embedded_count: 10, failed_count: 0, input_truncated: false });
  });

  it("caps string values at 500 chars", () => {
    const longString = "a".repeat(600);
    const result = buildSafeMetadata({ source: longString });
    expect(result?.source).toHaveLength(500);
  });

  it("strips blocked keys from nested objects (depth 1)", () => {
    const result = buildSafeMetadata({
      stats: {
        prompt: "should be removed",
        model: "gpt-4o",
      },
    });
    expect((result?.stats as Record<string, unknown>)?.prompt).toBeUndefined();
    expect((result?.stats as Record<string, unknown>)?.model).toBe("gpt-4o");
  });

  it("handles mix of blocked and safe keys", () => {
    const result = buildSafeMetadata({
      model_id: "gpt-4o",
      prompt: "BLOCKED",
      source: "test",
      api_key: "BLOCKED",
      chunk_count: 3,
    });
    expect(result?.model_id).toBe("gpt-4o");
    expect(result?.source).toBe("test");
    expect(result?.chunk_count).toBe(3);
    expect(result?.prompt).toBeUndefined();
    expect(result?.api_key).toBeUndefined();
  });

  it("allows simple primitive arrays", () => {
    const result = buildSafeMetadata({ tags: ["doc", "invoice"] });
    expect(result?.tags).toEqual(["doc", "invoice"]);
  });

  it("drops arrays of objects", () => {
    const result = buildSafeMetadata({
      source: "test",
      complex: [{ nested: "object" }],
    });
    expect(result?.complex).toBeUndefined();
    expect(result?.source).toBe("test");
  });
});

// ─── sanitizeErrorMessage ─────────────────────────────────────────────────────

describe("sanitizeErrorMessage", () => {
  it("returns null for null input", () => {
    expect(sanitizeErrorMessage(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(sanitizeErrorMessage(undefined)).toBeNull();
  });

  it("caps message at 200 chars", () => {
    const msg = "x".repeat(300);
    expect(sanitizeErrorMessage(msg)).toHaveLength(200);
  });

  it("strips stack trace (everything after first newline)", () => {
    const msg = "Error: something failed\n    at Object.<anonymous> (file.ts:10:5)";
    const result = sanitizeErrorMessage(msg);
    expect(result).toBe("Error: something failed");
  });

  it("redacts OpenAI API key patterns (sk-...)", () => {
    const msg = "Request failed with sk-abc123def456ghi789";
    const result = sanitizeErrorMessage(msg);
    expect(result).not.toContain("sk-abc123def456ghi789");
    expect(result).toContain("[REDACTED]");
  });

  it("redacts Bearer token patterns", () => {
    const msg = "Unauthorized: Bearer abc123def456ghi789jkl";
    const result = sanitizeErrorMessage(msg);
    expect(result).not.toContain("abc123def456ghi789jkl");
    expect(result).toContain("[REDACTED]");
  });

  it("redacts password= patterns", () => {
    const msg = "Connection error: password=mysecretpassword";
    const result = sanitizeErrorMessage(msg);
    expect(result).not.toContain("mysecretpassword");
    expect(result).toContain("[REDACTED]");
  });

  it("handles Error objects", () => {
    const err = new Error("Network timeout occurred");
    const result = sanitizeErrorMessage(err);
    expect(result).toBe("Network timeout occurred");
  });

  it("handles plain string", () => {
    expect(sanitizeErrorMessage("Something went wrong")).toBe("Something went wrong");
  });

  it("handles non-Error objects by stringifying", () => {
    const result = sanitizeErrorMessage({ code: 500 });
    expect(typeof result).toBe("string");
  });
});

// ─── extractSafeUsageDisplayFields ───────────────────────────────────────────

describe("extractSafeUsageDisplayFields", () => {
  it("returns empty object for null input", () => {
    expect(extractSafeUsageDisplayFields(null)).toEqual({});
  });

  it("returns empty object for non-object input", () => {
    expect(extractSafeUsageDisplayFields("string")).toEqual({});
    expect(extractSafeUsageDisplayFields(42)).toEqual({});
    expect(extractSafeUsageDisplayFields([])).toEqual({});
  });

  it("extracts prompt_version safely", () => {
    const result = extractSafeUsageDisplayFields({ prompt_version: "v1.0" });
    expect(result.promptVersion).toBe("v1.0");
  });

  it("caps prompt_version at 50 chars", () => {
    const result = extractSafeUsageDisplayFields({ prompt_version: "v".repeat(100) });
    expect(result.promptVersion).toHaveLength(50);
  });

  it("extracts numeric fields", () => {
    const result = extractSafeUsageDisplayFields({
      input_char_count: 1500,
      output_char_count: 200,
      chunk_count: 5,
      embedded_count: 4,
      failed_count: 1,
      result_count: 3,
    });
    expect(result.inputCharCount).toBe(1500);
    expect(result.outputCharCount).toBe(200);
    expect(result.chunkCount).toBe(5);
    expect(result.embeddedCount).toBe(4);
    expect(result.failedCount).toBe(1);
    expect(result.resultCount).toBe(3);
  });

  it("extracts boolean fields", () => {
    const result = extractSafeUsageDisplayFields({ input_truncated: true });
    expect(result.inputTruncated).toBe(true);
  });

  it("does NOT expose raw prompt, ocr_text, or any sensitive key", () => {
    const result = extractSafeUsageDisplayFields({
      prompt: "system prompt",
      ocr_text: "document content",
      api_key: "sk-abc",
      prompt_version: "v1",
    });
    // Only prompt_version is in the safe allowlist
    expect(Object.keys(result)).toEqual(["promptVersion"]);
  });
});
