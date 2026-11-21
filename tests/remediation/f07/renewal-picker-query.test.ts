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
const page = { rows: [candidate], nextBefore: null };

function setup(response: unknown = page, status = 200) {
  const fetch = vi.fn(async (_url: string, _init?: RequestInit) => Response.json(response, { status }));
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

it("uses the checked renewal request and sends search text and a keyset cursor as typed RPC arguments", async () => {
  const fetch = setup();
  expect(await searchDmsDocumentsForRenewalReplacement(8, "  Prior %_ issue  ", 77)).toEqual({ success: true, data: page });
  expect(fetch).toHaveBeenCalledTimes(1);
  const [[url, init]] = fetch.mock.calls;
  expect(new URL(url).pathname).toBe("/rest/v1/rpc/fa08_renewal_replacement_page");
  expect(init?.method).toBe("POST");
  expect(JSON.parse(String(init?.body))).toEqual({ p_request: 8, p_query: "Prior %_ issue", p_before: 77, p_limit: 25 });
});

it.each([
  [{ code: "42501", message: "PRIVATE_SQL_DETAIL" }, 403],
  [{ rows: [{ ...candidate, owner: "PRIVATE_SQL_DETAIL" }], nextBefore: null }, 200],
])("returns a safe load error on denied or unexpected data", async (payload, status) => {
  setup(payload, status);
  expect(await searchDmsDocumentsForRenewalReplacement(8)).toEqual({ success: false, error: "Could not load replacement documents." });
});

it("rejects invalid request data before reads and requires renewal permission", async () => {
  const fetch = setup();
  expect((await searchDmsDocumentsForRenewalReplacement(8, "", -1)).success).toBe(false);
  state.allowed = false;
  expect(await searchDmsDocumentsForRenewalReplacement(8)).toEqual({ success: false, error: "Permission denied" });
  expect(fetch).not.toHaveBeenCalled();
});
