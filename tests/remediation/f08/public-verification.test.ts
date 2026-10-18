import { it, expect, vi, beforeEach } from "vitest";
import { sanitizeVerificationFields } from "@/lib/public-verification/sanitizer";
const state = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: state.rpc }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/rbac/check", () => ({ getAuthContext: vi.fn(), hasPermission: vi.fn() }));
vi.mock("@/server/actions/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/server/actions/reports/template-governance", () => ({ checkTemplateIsIssuable: vi.fn() }));
import { getPublicVerificationByToken } from "@/server/actions/reports/public-verification";
beforeEach(() => vi.clearAllMocks());
it("public fields reject unknown keys, nested/array values and non-finite numbers", () => {
  expect(sanitizeVerificationFields({ subject_name: { nested: "private" }, subject_role: ["private"], salary: 2, id: 1, document_title: "Allowed", status: Infinity }, "letter")).toEqual({ document_title: "Allowed" });
  expect(sanitizeVerificationFields({ subject_name: "Do not disclose", document_title: "Allowed" }, "report")).toEqual({ document_title: "Allowed" });
});
it("dependency failure is temporarily unverifiable, not not-found/authentic", async () => {
  state.rpc.mockResolvedValue({ data: null, error: { message: "private server detail" } });
  const result = await getPublicVerificationByToken("a".repeat(40));
  expect(result.success).toBe(false);
  expect(result.error).toContain("temporarily unavailable");
  expect(JSON.stringify(result)).not.toContain("private server detail");
});
it("invalid/oversized tokens never reach the database", async () => {
  for (const token of ["short", "a".repeat(257), "/".repeat(40)]) expect(await getPublicVerificationByToken(token)).toEqual({ success: true, data: null });
  expect(state.rpc).not.toHaveBeenCalled();
});
it("legacy metadata never exposes payload or a binary download", async () => {
  state.rpc.mockResolvedValue({ error: null, data: { status: "legacy_metadata", output_type: "letter", document_title: "Historical", verification_summary: { subject_name: "private" }, public_payload: { salary: 100 }, download_enabled: true } });
  expect(await getPublicVerificationByToken("a".repeat(40))).toMatchObject({ success: true, data: { status: "legacy_metadata", public_payload: {}, verification_summary: {}, download_enabled: false } });
});
it("unknown states do not default to an authenticity claim", async () => {
  state.rpc.mockResolvedValue({ data: { status: "pending_activation" }, error: null });
  expect((await getPublicVerificationByToken("a".repeat(40))).success).toBe(false);
});
