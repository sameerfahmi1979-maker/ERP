import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ rpc: vi.fn(), generate: vi.fn(), scope: true, global: true, permitted: true, from: vi.fn() }));
vi.mock("@/lib/rbac/check", () => ({ getAuthContext: async () => ({ profile: { id: 11 } }), hasPermission: () => m.permitted, isGlobalAdmin: () => m.global }));
vi.mock("@/lib/rbac/employee-access", () => ({ getEmployeeAccess: vi.fn() }));
vi.mock("@/lib/output/issued-file-access", () => ({ canAccessIssuedFile: async () => m.scope, issuedFileUrl: (id: number) => `/api/output/file?issuanceId=${id}` }));
vi.mock("@/server/actions/output/generate-official-document", () => ({ generateOfficialDocument: m.generate }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: m.rpc }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: m.from }) }));
import { revokeIssuance, reissueOfficialDocument, deleteIssuance } from "@/server/actions/output/issuance-history";
beforeEach(() => {
  vi.resetAllMocks(); m.scope = true; m.global = true; m.permitted = true;
  m.rpc.mockResolvedValue({ error: null, data: { id: 7 } });
  m.generate.mockResolvedValue({ success: true, issuanceId: 8 });
  let calls = 0;
  m.from.mockImplementation(() => ({ select: () => ({ eq: () => ({ single: async () => ({ error: null, data: ++calls === 1
    ? { id: 7, output_code: "F08_SYNTHETIC", source_record_id: 1, lifecycle_state: "issued", superseded_by_id: 8, data_snapshot_json: { language: "bilingual", inputs: { recipient: "Synthetic" } } }
    : calls % 2 === 0 ? { superseded_by_id: 8 } : { supersedes_issuance_id: 7, lifecycle_state: "issued" } }) }) }) }));
});
it("revokes using only the authenticated atomic command and a trimmed reason", async () => {
  expect(await revokeIssuance({ issuanceId: 7, reason: " Synthetic reason " })).toEqual({ success: true });
  expect(m.rpc).toHaveBeenCalledWith("f08_revoke_output", { p_id: 7, p_reason: "Synthetic reason" }); expect(m.from).not.toHaveBeenCalled();
});
it.each([{ data: null, error: new Error("lost response") }, { data: { id: 8 }, error: null }])("never claims revoke success without matching confirmation", async response => {
  m.rpc.mockResolvedValue(response); expect((await revokeIssuance({ issuanceId: 7, reason: "Synthetic reason" })).success).toBe(false);
});
it("rejects blank reasons and current scope loss before issuing a command", async () => {
  expect((await revokeIssuance({ issuanceId: 7, reason: "      " })).success).toBe(false);
  m.scope = false; expect((await revokeIssuance({ issuanceId: 7, reason: "Synthetic reason" })).success).toBe(false); expect(m.rpc).not.toHaveBeenCalled();
});
it("retains every artifact, including for global administrators", async () => {
  expect(await deleteIssuance({ issuanceId: 7 })).toMatchObject({ success: false, error: expect.stringContaining("retained") });
  expect(m.from).not.toHaveBeenCalled(); expect(m.rpc).not.toHaveBeenCalled();
});
it("reissue retains language, inputs, meaningful reason and deterministic command identity", async () => {
  const input = { issuanceId: 7, reason: " Synthetic correction ", issueQr: true };
  expect((await reissueOfficialDocument(input)).success).toBe(true);
  const options = m.generate.mock.calls[0][2];
  expect(options).toMatchObject({ language: "bilingual", inputs: { recipient: "Synthetic" }, supersedesIssuanceId: 7, reissueReason: "Synthetic correction" });
  expect(options.clientRequestToken).toMatch(/^reissue-[a-f0-9]{64}$/);
  // Simulate an independent response-loss retry with the same retained command.
  m.from.mockClear(); let n = 0;
  m.from.mockImplementation(() => ({ select: () => ({ eq: () => ({ single: async () => ({ error: null, data: ++n === 1
    ? { id: 7, output_code: "F08_SYNTHETIC", source_record_id: 1, lifecycle_state: "issued", data_snapshot_json: { language: "bilingual", inputs: { recipient: "Synthetic" } } }
    : n === 2 ? { superseded_by_id: 8 } : { supersedes_issuance_id: 7, lifecycle_state: "issued" } }) }) }) }));
  expect((await reissueOfficialDocument(input)).success).toBe(true);
  expect(m.generate.mock.calls[1][2].clientRequestToken).toBe(options.clientRequestToken);
});
it("does not report reissue success when the atomic graph cannot be confirmed", async () => {
  m.generate.mockResolvedValue({ success: true, issuanceId: 99 });
  expect(await reissueOfficialDocument({ issuanceId: 7, reason: "Synthetic correction", issueQr: false })).toMatchObject({ success: false, blocked: "reconciliation_required" });
});
