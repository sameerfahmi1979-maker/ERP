import { beforeEach, expect, it, vi } from "vitest";
import { createClient as createSdk } from "@supabase/supabase-js";
import { getDmsAdminOverviewStats } from "@/server/actions/dms/overview";
import { getDmsCategories } from "@/server/actions/dms/categories";
import { getDmsDocumentTypeChoices, getDmsDocumentTypes } from "@/server/actions/dms/document-types";
import { getDmsMetadataDefinitions } from "@/server/actions/dms/metadata-definitions";
import { getDmsRetentionPolicies } from "@/server/actions/dms/retention-policies";
import { adminListApprovalWorkflows } from "@/server/actions/dms/document-approvals";
import { getDmsIntelligenceAdminStats } from "@/server/actions/dms/intelligence-admin";
import { getDmsTags } from "@/server/actions/dms/tags";
import { getDmsNotificationRecipientOptions } from "@/server/actions/dms/notification-settings";

type Transport = (url: URL, init: RequestInit, client: "caller" | "admin") => Promise<Response>;
const state = vi.hoisted(() => ({ transport: null as Transport | null, permissions: ["dms.admin"] }));
vi.mock("@/lib/rbac/check", async () => ({
  ...await vi.importActual("@/lib/rbac/scope"),
  getAuthContext: async () => ({
    profile: { id: 7, must_change_password: false }, isAccountActive: true,
    roleCodes: [], permissionCodes: state.permissions, globalPermissionCodes: state.permissions,
  }),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => client("caller") }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => client("admin") }));

function client(scope: "caller" | "admin") {
  return createSdk("https://dms-admin-fixture.invalid", "fixture-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init = {}) => {
      const url = new URL(String(input));
      if (url.origin !== "https://dms-admin-fixture.invalid" || !state.transport) {
        throw Error("Unexpected transport");
      }
      return state.transport(url, init, scope);
    } },
  });
}

function result(rows: unknown[], count: number, offset = 0, head = false) {
  return new Response(head ? null : JSON.stringify(rows), {
    headers: {
      "content-type": "application/json",
      "content-range": rows.length ? `${offset}-${offset + rows.length - 1}/${count}` : `*/${count}`,
    },
  });
}

const unavailable = () => Response.json({ code: "XX000", message: "Fixture unavailable" }, { status: 500 });

beforeEach(() => {
  state.transport = null;
  state.permissions = ["dms.admin"];
});

it("keeps overview count failure distinct from a verified zero", async () => {
  state.transport = async (url, init, scope) => {
    expect(scope).toBe("caller");
    expect(init.method).toBe("HEAD");
    return url.pathname.endsWith("dms_metadata_definitions") ? unavailable() : result([], 0, 0, true);
  };
  const read = await getDmsAdminOverviewStats();
  expect(read).toMatchObject({ success: true, data: { metadata_definitions_total: null, tags_total: 0 } });
});

it("leaves a missing intelligence count and its dependent total unavailable", async () => {
  state.transport = async (url, init, scope) => {
    expect(scope).toBe("admin");
    expect(init.method).toBe("HEAD");
    return url.pathname.endsWith("dms_document_content") ? unavailable() : result([], 9, 0, true);
  };
  const read = await getDmsIntelligenceAdminStats();
  expect(read).toMatchObject({ success: true, data: {
    totalDocuments: 9, documentsWithExtractedText: null, documentsMissingExtractedText: null,
  } });
});

it.each([
  ["dms_document_categories", getDmsCategories],
  ["dms_document_types", getDmsDocumentTypes],
  ["dms_metadata_definitions", getDmsMetadataDefinitions],
  ["dms_retention_policies", getDmsRetentionPolicies],
  ["dms_document_workflows", adminListApprovalWorkflows],
] as const)("reads every authorized %s row across transport pages", async (table, read) => {
  const pages: number[] = [];
  state.transport = async (url, init, scope) => {
    expect(scope).toBe("caller");
    expect(url.pathname.endsWith(`/${table}`)).toBe(true);
    const offset = Number(url.searchParams.get("offset") ?? 0);
    const length = Math.min(Number(url.searchParams.get("limit") ?? 1000), 1101 - offset);
    if (url.searchParams.has("limit")) {
      expect(new Headers(init.headers).get("prefer")).toContain("count=exact");
      expect(url.searchParams.get("order")).toMatch(/(?:^|,)id\.asc$/);
    }
    pages.push(length);
    return result(Array.from({ length }, (_, i) => ({ id: offset + i + 1, steps: [], doc_types: [] })), 1101, offset);
  };
  const resultPage = await read();
  expect(resultPage.success).toBe(true);
  expect(resultPage.data?.map(row => row.id)).toEqual(Array.from({ length: 1101 }, (_, i) => i + 1));
  expect(pages).toEqual([500, 500, 101]);
});

it("rejects an incomplete catalogue instead of accepting a partial first page", async () => {
  state.transport = async () => result([{ id: 1 }], 1101);
  expect(await getDmsCategories()).toMatchObject({ success: false });
});

it("loads 201 tags through three concurrent guarded count requests", async () => {
  let active = 0;
  let peak = 0;
  const lengths: number[] = [];
  state.transport = async url => {
    if (url.pathname.endsWith("/dms_tags")) {
      return result(Array.from({ length: 201 }, (_, index) => ({ id: index + 1 })), 201);
    }
    expect(url.pathname.endsWith("/dms_catalogue_tag_counts")).toBe(true);
    const ids = (url.searchParams.get("tag_ids") ?? "").replace(/[{}]/g, "").split(",").map(Number);
    lengths.push(ids.length);
    active += 1;
    peak = Math.max(peak, active);
    await new Promise(resolve => setImmediate(resolve));
    active -= 1;
    return result([{ tag_id: ids[0], document_count: 2 }], 1);
  };
  const response = await getDmsTags();
  expect(response.success).toBe(true);
  expect(response.data?.filter(row => row.document_count === 2).map(row => row.id)).toEqual([1, 101, 201]);
  expect(lengths.sort((left, right) => left - right)).toEqual([1, 100, 100]);
  expect(peak).toBe(3);
});

it("returns an explicit failure when recipient choices cannot be read", async () => {
  state.transport = async url => url.pathname.endsWith("/roles")
    ? result([{ role_code: "reviewer", role_name: "Reviewer" }], 1)
    : unavailable();
  expect(await getDmsNotificationRecipientOptions()).toMatchObject({ success: false });
});

it("requires the original document-view gate for the new creation choices read", async () => {
  const read = vi.fn(async () => result([], 0));
  state.transport = read;
  state.permissions = ["dms.documents.upload"];
  expect(await getDmsDocumentTypeChoices(true)).toEqual({ success: false, error: "Permission denied" });
  expect(read).not.toHaveBeenCalled();
});

it("returns narrow counted active choices through the ordinary scoped client", async () => {
  state.permissions = ["dms.documents.view"];
  const row = { id: 6, type_code: "QA", name_en: "Synthetic type", is_active: true };
  state.transport = async (url, init, scope) => {
    expect(scope).toBe("caller");
    expect(url.pathname.endsWith("/dms_document_types")).toBe(true);
    expect(url.searchParams.get("is_active")).toBe("eq.true");
    expect(url.searchParams.get("deleted_at")).toBe("is.null");
    expect(url.searchParams.get("select")).toBe("id,type_code,name_en,is_active");
    expect(new Headers(init.headers).get("prefer")).toContain("count=exact");
    return result([row], 1);
  };
  expect(await getDmsDocumentTypeChoices(true)).toEqual({ success: true, data: [row] });
});
