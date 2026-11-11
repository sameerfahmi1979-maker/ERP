import { createClient } from "@supabase/supabase-js";
import { beforeEach, expect, it, vi } from "vitest";
import { withDocumentReadPolicy } from "@/lib/supabase/document-read-policy";
import { searchDmsDocumentsForRenewalReplacement } from "@/server/actions/dms/renewals";

const state = vi.hoisted(() => ({ createClient: vi.fn(), allowed: true }));
vi.mock("@/lib/supabase/server", () => ({ createClient: state.createClient }));
vi.mock("@/lib/rbac/check", () => ({
  getAuthContext: async () => ({ profile: { id: 7 } }),
  hasPermission: (_: unknown, permission: string) => state.allowed && permission === "dms.renewals.manage",
}));
vi.mock("@/server/actions/audit", () => ({ logAudit: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const candidate = { id: 22, document_no: "DMS-TEST-22", title: "Synthetic replacement", expiry_date: "2028-02-29", status: "active" };
const responses = [
  [{ entity_type: "employee", entity_id: 5, is_primary: true }],
  [{ document_id: 11 }, { document_id: 22 }, { document_id: 33 }],
  [{ replacement_document_id: 33 }],
  [{ ...candidate, created_at: "2026-11-11T08:00:00Z" }],
];

function setup(failAt?: number) {
  let read = 0;
  const fetch = vi.fn(async (_url: string) => {
    const index = read++;
    if (index === failAt) return Response.json({ code: "42703", message: "PRIVATE_SQL_DETAIL" }, { status: 400 });
    return Response.json(responses[index]);
  });
  const client = createClient("https://erp-test.invalid", "synthetic-key", {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch },
  });
  state.createClient.mockResolvedValue(withDocumentReadPolicy(client));
  return fetch;
}

beforeEach(() => {
  vi.clearAllMocks();
  state.allowed = true;
});

it("includes each sort column in the protected projection and retains the original candidate constraints", async () => {
  const fetch = setup();
  expect(await searchDmsDocumentsForRenewalReplacement(9, 11)).toEqual({ success: true, data: [candidate] });
  expect(fetch).toHaveBeenCalledTimes(4);
  const linkRequest = new URL(fetch.mock.calls[1][0]);
  expect(linkRequest.searchParams.get("entity_type")).toBe("eq.employee");
  expect(linkRequest.searchParams.get("entity_id")).toBe("eq.5");
  const documentRequest = new URL(fetch.mock.calls[3][0]);
  expect(documentRequest.pathname).toBe("/rest/v1/rpc/f03_read_documents");
  const params = documentRequest.searchParams;
  expect(params.get("order")).toBe("created_at.desc,id.desc");
  expect(params.get("select")?.split(",")).toEqual(["id", "document_no", "title", "expiry_date", "status", "created_at"]);
  expect(params.get("document_type_id")).toBe("eq.9");
  expect(params.get("deleted_at")).toBe("is.null");
  expect(params.getAll("id")).toEqual(["not.in.(11,33)", "in.(11,22,33)"]);
});

it.each([0, 1, 2, 3])("reports a safe load error and stops when read %s fails", async (index) => {
  const fetch = setup(index);
  expect(await searchDmsDocumentsForRenewalReplacement(9, 11)).toEqual({
    success: false, error: "Could not load replacement documents.",
  });
  expect(fetch).toHaveBeenCalledTimes(index + 1);
});

it("requires renewal permission before reading candidates", async () => {
  const fetch = setup();
  state.allowed = false;
  expect(await searchDmsDocumentsForRenewalReplacement(9, 11)).toEqual({ success: false, error: "Permission denied" });
  expect(fetch).not.toHaveBeenCalled();
});
