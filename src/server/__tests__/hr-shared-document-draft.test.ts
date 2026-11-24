import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContext } from "@/lib/rbac/check";

const mocks = vi.hoisted(() => ({ getAuthContext: vi.fn(), createClient: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/rbac/check", () => ({ getAuthContext: mocks.getAuthContext }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import { accessSharedDocumentEmployeeDraft } from "@/server/actions/hr/shared-document-employee-draft";

const sources = [{ documentId: 2, fingerprint: "a".repeat(64) }];
const draftId = "3731e900-a7f0-41de-b53b-fd53bede10a8";
const draft = { draftId, revision: 1, ownerCompanyId: 3, branchId: 4, sourceFingerprints: sources, payload: {} };
const permissions = ["hr.employees.create", "dms.documents.view", "dms.documents.preview", "dms.documents.edit"];
const auth = {
  profile: { id: 7, must_change_password: false },
  isAccountActive: true,
  permissionCodes: permissions,
  globalPermissionCodes: ["numbering.rules.generate"],
  roleAssignments: [{ roleId: 3, roleCode: "hr", ownerCompanyId: 3, branchId: 4, permissionCodes: permissions }],
} as AuthContext;

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("DMS_HR_SHARED_DRAFTS_ENABLED", "true");
  mocks.getAuthContext.mockResolvedValue(auth);
  mocks.createClient.mockResolvedValue({ rpc: mocks.rpc });
});
afterEach(() => vi.unstubAllEnvs());

describe("held HR wizard draft action", () => {
  it("defaults off and reaches no authentication or draft operation", async () => {
    vi.stubEnv("DMS_HR_SHARED_DRAFTS_ENABLED", undefined);
    expect(await accessSharedDocumentEmployeeDraft({ kind: "open", reviewedSources: sources }))
      .toMatchObject({ success: false, code: "disabled" });
    expect(mocks.getAuthContext).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each([
    { profile: null, isAccountActive: false },
    { profile: { id: 7, must_change_password: true } },
    { roleAssignments: [], permissionCodes: [], globalPermissionCodes: [] },
  ])("denies a caller without a current admitted wizard principal", async (overrides) => {
    mocks.getAuthContext.mockResolvedValue({ ...auth, ...overrides });
    expect(await accessSharedDocumentEmployeeDraft({ kind: "open", reviewedSources: sources }))
      .toMatchObject({ success: false, code: "denied" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("opens from the exact reviewed source set and validates returned fingerprints", async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: { ...draft, revision: 0 }, error: null })
      .mockResolvedValueOnce({ data: { ...draft, sourceFingerprints: [{ documentId: 2, fingerprint: "b".repeat(64) }] }, error: null });
    expect(await accessSharedDocumentEmployeeDraft({ kind: "open", reviewedSources: sources }))
      .toEqual({ success: true, data: { ...draft, revision: 0 } });
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, "open_shared_hr_document_draft", {
      p_document_ids: [2], p_source_fingerprints: sources,
    });
    expect(await accessSharedDocumentEmployeeDraft({ kind: "open", reviewedSources: sources }))
      .toMatchObject({ success: false, code: "changed" });
  });

  it("lets the native read deny access without returning a draft or its error details", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "private test detail" } });
    const result = await accessSharedDocumentEmployeeDraft({ kind: "read", draftId, reviewedSources: sources });
    expect(result).toMatchObject({ success: false, code: "denied" });
    expect(JSON.stringify(result)).not.toContain("private test detail");
  });

  it.each([
    { owner_company_id: 3 },
    { branch_id: 4 },
    { employee_status: "active" },
    { complianceRecords: [] },
    { full_name_en: { medical: "private" } },
  ])("rejects fields outside the shared employee draft shape before reaching the database", async (payload) => {
    expect(await accessSharedDocumentEmployeeDraft({ kind: "save", draftId, revision: 1, reviewedSources: sources, payload }))
      .toMatchObject({ success: false, code: "invalid" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("cannot save when the draft being reopened has a different source witness", async () => {
    mocks.rpc.mockResolvedValue({ data: { ...draft, sourceFingerprints: [{ documentId: 2, fingerprint: "b".repeat(64) }] }, error: null });
    expect(await accessSharedDocumentEmployeeDraft({ kind: "save", draftId, revision: 1, reviewedSources: sources, payload: { full_name_en: "Test" } }))
      .toMatchObject({ success: false, code: "changed" });
    expect(mocks.rpc.mock.calls.map(call => call[0])).toEqual(["read_shared_hr_document_draft"]);
  });

  it("sends the original revision and preserves a native concurrent-edit conflict", async () => {
    const payload = { full_name_en: "Test" };
    mocks.rpc.mockResolvedValueOnce({ data: draft, error: null }).mockResolvedValueOnce({ data: null, error: { code: "PT409" } });
    expect(await accessSharedDocumentEmployeeDraft({ kind: "save", draftId, revision: 1, reviewedSources: sources, payload }))
      .toMatchObject({ success: false, code: "changed" });
    expect(mocks.rpc).toHaveBeenLastCalledWith("save_shared_hr_document_draft", {
      p_draft_id: draftId, p_expected_revision: 1, p_payload: payload,
    });
  });

  it("requires a receipt for the next revision of the same draft and only returns validated values", async () => {
    const payload = { full_name_en: "Test" };
    const request = { kind: "save", draftId, revision: 1, reviewedSources: sources, payload };
    const saved = { ...draft, revision: 2, payload };
    mocks.rpc
      .mockResolvedValueOnce({ data: draft, error: null })
      .mockResolvedValueOnce({ data: saved, error: null })
      .mockResolvedValueOnce({ data: draft, error: null })
      .mockResolvedValueOnce({ data: { ...saved, revision: 3 }, error: null });
    expect(await accessSharedDocumentEmployeeDraft(request)).toEqual({ success: true, data: saved });
    expect(await accessSharedDocumentEmployeeDraft(request)).toMatchObject({ success: false, code: "unconfirmed" });
  });
});
