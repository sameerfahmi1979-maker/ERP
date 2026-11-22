import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  context: {} as object,
  createClient: vi.fn(),
  rpc: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("@/lib/rbac/check", async () => ({
  ...await import("@/lib/rbac/scope"),
  getAuthContext: async () => state.context,
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: state.createClient }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));
vi.mock("next/cache", () => ({ revalidatePath: state.revalidate }));

import { linkCandidateDmsDocument } from "@/server/actions/hr/recruitment";

const operation = "30000000-0000-4000-8000-000000000001";
const input = { dms_document_id: 39, document_purpose: "cv" as const, notes: "Synthetic" };
const receipt = {
  id: 29, candidate_id: 19, dms_document_id: 39, operation_id: operation,
  outcome: "linked", replayed: false,
};

beforeEach(() => {
  vi.resetAllMocks();
  state.context = {
    profile: { id: 1, must_change_password: false }, isAccountActive: true, permissionCodes: ["hr.recruitment.manage"], roleCodes: ["scoped_hr"],
    roleAssignments: [{ roleCode: "scoped_hr", ownerCompanyId: 1, branchId: 11, permissionCodes: ["hr.recruitment.manage"] }],
  };
  state.createClient.mockResolvedValue({ rpc: state.rpc });
  state.rpc.mockResolvedValue({ data: receipt, error: null });
});

it("confirms the atomic receipt even if the record cache cannot refresh", async () => {
  state.revalidate.mockImplementation(() => { throw new Error("Private refresh diagnostic"); });
  expect(await linkCandidateDmsDocument(19, input, operation))
    .toEqual({ success: true, data: receipt, refreshPending: true });
  expect(state.rpc).toHaveBeenCalledExactlyOnceWith("link_hr_candidate_document", {
    p_candidate: 19, p_document: 39, p_operation: operation, p_purpose: "cv", p_notes: "Synthetic",
  });
  expect(state.revalidate).toHaveBeenCalledExactlyOnceWith("/admin/hr/recruitment/candidates/record/19");
});

it.each([
  { candidate_id: 20 }, { dms_document_id: 40 }, { operation_id: "50000000-0000-4000-8000-000000000001" },
  { outcome: "unverified" }, { id: undefined },
])("does not confirm a mismatched or malformed receipt %j", async mismatch => {
  state.rpc.mockResolvedValue({ data: { ...receipt, ...mismatch }, error: null });
  expect(await linkCandidateDmsDocument(19, input, operation)).toMatchObject({ success: false, uncertain: true });
  expect(state.revalidate).not.toHaveBeenCalled();
});

it("distinguishes lost responses from a confirmed scope rejection", async () => {
  state.rpc.mockRejectedValueOnce(new Error("Private response detail"));
  expect(await linkCandidateDmsDocument(19, input, operation)).toMatchObject({ success: false, uncertain: true });
  state.rpc.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "Private scope detail" } });
  const denied = await linkCandidateDmsDocument(19, input, operation);
  expect(denied).toMatchObject({ success: false, uncertain: false });
  expect(JSON.stringify(denied)).not.toContain("Private");
  expect(state.revalidate).not.toHaveBeenCalled();
});

it("rejects invalid document identity and a retired ERP principal before a request", async () => {
  expect((await linkCandidateDmsDocument(19, { ...input, dms_document_id: 12.5 }, operation)).success).toBe(false);
  state.context = { ...state.context, isAccountActive: false };
  expect((await linkCandidateDmsDocument(19, input, operation)).success).toBe(false);
  expect(state.createClient).not.toHaveBeenCalled();
});
