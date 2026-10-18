// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { getOutputRequestIntent, settleOutputRequestIntent, settleRecoveredOutputIntent, retireOutputRequestIntents } from "@/lib/output/client-request-intent";
import { buildRequestKey } from "@/lib/output/idempotency";
import { clearIdentityWorkspace } from "@/lib/auth/client-session";
beforeEach(() => { sessionStorage.clear(); vi.stubGlobal("crypto", webcrypto); });
afterEach(() => { sessionStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const command = { language: "en", inputs: { recipient: "CONFIDENTIAL NAME" } };
it("retains the same token after module reload, without storing employee fields or wording", async () => {
  const first = await getOutputRequestIntent("principal-secret-identity", 1, "QA_LETTER", command);
  vi.resetModules(); const fresh = await import("@/lib/output/client-request-intent");
  expect(await fresh.getOutputRequestIntent("principal-secret-identity", 1, "QA_LETTER", command)).toEqual(first);
  const retained = JSON.stringify(sessionStorage); expect(retained).not.toContain("CONFIDENTIAL"); expect(retained).not.toContain("principal-secret-identity"); expect(retained).not.toContain("recipient");
});
it("canonical ordering does not create a new logical request", async () => {
  expect(await getOutputRequestIntent("owner", 1, "QA", { a: 1, b: 2 })).toEqual(await getOutputRequestIntent("owner", 1, "QA", { b: 2, a: 1 }));
});
it("unconfirmed changed entries are blocked without losing the original token", async () => {
  const first = await getOutputRequestIntent("owner", 1, "QA", command);
  await expect(getOutputRequestIntent("owner", 1, "QA", { language: "ar" })).rejects.toThrow("earlier request is unconfirmed");
  expect((await getOutputRequestIntent("owner", 1, "QA", command)).token).toBe(first.token);
});
it("only confirmation of the matching token can retire it", async () => {
  const intent = await getOutputRequestIntent("owner", 1, "QA", command);
  settleOutputRequestIntent(intent.key, crypto.randomUUID()); expect(sessionStorage.getItem(intent.key)).not.toBeNull();
  settleOutputRequestIntent(intent.key, intent.token); expect(sessionStorage.getItem(intent.key)).toBeNull();
});
it("history recovery settles only the exact server request identity", async () => {
  const intent = await getOutputRequestIntent("owner", 1, "QA", command);
  await settleRecoveredOutputIntent("owner", 1, "QA", 11, "req_other"); expect(sessionStorage.getItem(intent.key)).not.toBeNull();
  await settleRecoveredOutputIntent("owner", 1, "QA", 11, buildRequestKey({ outputCode: "QA", recordId: 1, actorProfileId: 11, clientToken: intent.token })); expect(sessionStorage.getItem(intent.key)).toBeNull();
});
it("account, scope and subject changes partition request identity", async () => {
  const a = await getOutputRequestIntent("owner-a", 1, "QA", command), b = await getOutputRequestIntent("owner-b", 1, "QA", command), c = await getOutputRequestIntent("owner-a", 2, "QA", command);
  expect(new Set([a.token, b.token, c.token]).size).toBe(3);
});
it("retired asynchronous preparation cannot write a token after identity cleanup", async () => {
  await expect(getOutputRequestIntent("owner", 1, "QA", command, () => false)).rejects.toThrow("retired account"); expect(sessionStorage.length).toBe(0);
});
it("identity cleanup retires only our request metadata and existing private workspace data", async () => {
  await getOutputRequestIntent("owner", 1, "QA", command); sessionStorage.setItem("other-app", "keep");
  clearIdentityWorkspace(); expect(sessionStorage.length).toBe(1); expect(sessionStorage.getItem("other-app")).toBe("keep");
  retireOutputRequestIntents(); expect(sessionStorage.getItem("other-app")).toBe("keep");
});
it("blocked session storage fails closed before returning a new request token", async () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw Error("Storage unavailable"); });
  await expect(getOutputRequestIntent("owner", 1, "QA", command)).rejects.toThrow("Storage unavailable");
});
