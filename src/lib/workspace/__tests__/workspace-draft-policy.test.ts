/**
 * WORKSPACE.PERF.1 (WS.3) — tests for the two-tier draft field policy (D3)
 * and the in-memory draft store behavior.
 */

import { describe, expect, it } from "vitest";
import {
  isDraftFieldAllowed,
  NEVER_DRAFT_FIELDS,
  MEMORY_ONLY_FIELDS,
  buildWorkspaceDraftKey,
} from "../workspace-draft-types";
import { createWorkspaceDraftStore } from "../workspace-draft-store";

describe("isDraftFieldAllowed — two-tier policy (D3)", () => {
  it("denies every Tier-1 credential/file field", () => {
    for (const field of NEVER_DRAFT_FIELDS) {
      expect(isDraftFieldAllowed(field), field).toBe(false);
    }
  });

  it("denies credential fields case-insensitively and by substring", () => {
    expect(isDraftFieldAllowed("PASSWORD")).toBe(false);
    expect(isDraftFieldAllowed("user_password_hint")).toBe(false);
    expect(isDraftFieldAllowed("myApiToken")).toBe(false);
    expect(isDraftFieldAllowed("azure_api_key_value")).toBe(false);
    expect(isDraftFieldAllowed("client_secret_ref")).toBe(false);
  });

  it("ALLOWS Tier-2 business PII in the in-memory store (decision D3)", () => {
    for (const field of MEMORY_ONLY_FIELDS) {
      expect(isDraftFieldAllowed(field), field).toBe(true);
    }
    expect(isDraftFieldAllowed("emirates_id")).toBe(true);
    expect(isDraftFieldAllowed("iban")).toBe(true);
    expect(isDraftFieldAllowed("bank_account_number")).toBe(true);
    expect(isDraftFieldAllowed("passport_number")).toBe(true);
  });

  it("allows ordinary business fields", () => {
    expect(isDraftFieldAllowed("bank_name_en")).toBe(true);
    expect(isDraftFieldAllowed("full_name")).toBe(true);
    expect(isDraftFieldAllowed("expiry_date")).toBe(true);
  });
});

describe("workspace draft store", () => {
  it("stores and restores Tier-2 PII fields", () => {
    const store = createWorkspaceDraftStore();
    const key = buildWorkspaceDraftKey({ tabId: "t1", formId: "employee-form" });
    store.setDraft(key, {
      full_name: "Sameer",
      emirates_id: "784-1979-4817020-0",
      iban: "AE070331234567890123456",
    });
    expect(store.getDraft(key)).toEqual({
      full_name: "Sameer",
      emirates_id: "784-1979-4817020-0",
      iban: "AE070331234567890123456",
    });
  });

  it("filters Tier-1 credential fields on every write path", () => {
    const store = createWorkspaceDraftStore();
    const key = buildWorkspaceDraftKey({ tabId: "t1", formId: "f" });

    store.setDraft(key, { name: "a", password: "x", api_key: "y" });
    expect(store.getDraft(key)).toEqual({ name: "a" });

    store.patchDraft(key, { access_token: "z", city: "Dubai" });
    expect(store.getDraft(key)).toEqual({ name: "a", city: "Dubai" });

    store.writeField(key, "client_secret", "s");
    expect(store.getDraft(key)).toEqual({ name: "a", city: "Dubai" });
  });

  it("clears drafts per tab prefix", () => {
    const store = createWorkspaceDraftStore();
    const keyA = buildWorkspaceDraftKey({ tabId: "tabA", formId: "f1" });
    const keyB = buildWorkspaceDraftKey({ tabId: "tabB", formId: "f1" });
    store.setDraft(keyA, { x: "1" });
    store.setDraft(keyB, { x: "2" });

    store.clearDraftsForTab("tabA");
    expect(store.hasDraft(keyA)).toBe(false);
    expect(store.hasDraft(keyB)).toBe(true);
  });
});
