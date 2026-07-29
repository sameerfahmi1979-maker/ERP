import { describe, it, expect } from "vitest";
import {
  buildRequestKey,
  buildContentFingerprint,
  hashFinalPdfBytes,
  generatePublicToken,
} from "../idempotency";

describe("request idempotency vs content fingerprint separation", () => {
  it("same client token produces the same request key (double-click protection)", () => {
    const a = buildRequestKey({ outputCode: "HR_EXPERIENCE_CERT", recordId: 1, actorProfileId: 7, clientToken: "tab-abc-123" });
    const b = buildRequestKey({ outputCode: "HR_EXPERIENCE_CERT", recordId: 1, actorProfileId: 7, clientToken: "tab-abc-123" });
    expect(a).toBe(b);
  });

  it("different client tokens produce different request keys (legitimate reissue)", () => {
    const a = buildRequestKey({ outputCode: "HR_EXPERIENCE_CERT", recordId: 1, actorProfileId: 7, clientToken: "attempt-1" });
    const b = buildRequestKey({ outputCode: "HR_EXPERIENCE_CERT", recordId: 1, actorProfileId: 7, clientToken: "attempt-2" });
    expect(a).not.toBe(b);
  });

  it("no client token → unique random key each call", () => {
    const a = buildRequestKey({ outputCode: "X", recordId: 1, actorProfileId: 1 });
    const b = buildRequestKey({ outputCode: "X", recordId: 1, actorProfileId: 1 });
    expect(a).not.toBe(b);
  });

  it("fingerprint is stable across key ordering (semantic equality)", () => {
    const a = buildContentFingerprint({ outputCode: "X", recordId: 1, templateId: 5, templateVersion: 2, dataSnapshot: { name: "A", salary: 100 } });
    const b = buildContentFingerprint({ outputCode: "X", recordId: 1, templateId: 5, templateVersion: 2, dataSnapshot: { salary: 100, name: "A" } });
    expect(a).toBe(b);
  });

  it("fingerprint changes when content changes", () => {
    const a = buildContentFingerprint({ outputCode: "X", recordId: 1, templateId: 5, templateVersion: 2, dataSnapshot: { name: "A" } });
    const b = buildContentFingerprint({ outputCode: "X", recordId: 1, templateId: 5, templateVersion: 3, dataSnapshot: { name: "A" } });
    const c = buildContentFingerprint({ outputCode: "X", recordId: 1, templateId: 5, templateVersion: 2, dataSnapshot: { name: "B" } });
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
  });

  it("request key and fingerprint are independent concepts", () => {
    // Two different requests (different keys) can carry identical content fingerprints.
    const k1 = buildRequestKey({ outputCode: "X", recordId: 1, actorProfileId: 1, clientToken: "t1" });
    const k2 = buildRequestKey({ outputCode: "X", recordId: 1, actorProfileId: 1, clientToken: "t2" });
    const fp = { outputCode: "X", recordId: 1, templateId: 1, templateVersion: 1, dataSnapshot: { a: 1 } };
    expect(k1).not.toBe(k2);
    expect(buildContentFingerprint(fp)).toBe(buildContentFingerprint(fp));
  });

  it("final hash is exact-byte SHA-256", () => {
    const bytes = Buffer.from("%PDF-1.7 fake body");
    expect(hashFinalPdfBytes(bytes)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashFinalPdfBytes(bytes)).toBe(hashFinalPdfBytes(Buffer.from(bytes)));
    expect(hashFinalPdfBytes(Buffer.from("%PDF-1.7 fake body!"))).not.toBe(hashFinalPdfBytes(bytes));
  });

  it("public token is long, url-safe and non-enumerable", () => {
    const t1 = generatePublicToken();
    const t2 = generatePublicToken();
    expect(t1.length).toBeGreaterThanOrEqual(32); // storage CHECK requires >= 32
    expect(t1).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(t1).not.toBe(t2);
  });
});
