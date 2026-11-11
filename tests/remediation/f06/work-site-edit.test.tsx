// @vitest-environment jsdom
import "../f05/setup";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AuthContext } from "@/lib/rbac/check";
import { WorkspaceUiMemoryProvider } from "@/hooks/use-persistent-ui-state";
import { updateWorkSite } from "@/server/actions/common-master-data/work-sites";
import WorkSitesPage from "@/app/(protected)/admin/common-master-data/work-sites/page";
import WorkSiteRecordPage from "@/app/(protected)/admin/common-master-data/work-sites/record/[id]/page";

const mock = vi.hoisted(() => ({ ctx: {} as AuthContext, client: vi.fn(), audit: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/rbac/check", async () => ({ ...await import("@/lib/rbac/scope"), getAuthContext: async () => mock.ctx }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mock.client }));
vi.mock("@/server/actions/audit", () => ({ logAudit: mock.audit }));
vi.mock("next/cache", () => ({ revalidatePath: mock.revalidate }));
vi.mock("next/navigation", () => ({ usePathname: () => "/admin/common-master-data/work-sites" }));
vi.mock("@/components/erp/export/erp-export-menu", () => ({ ERPExportMenu: () => null }));
vi.mock("@/features/common-master-data/work-sites/work-site-workspace-form", () => ({ WorkSiteWorkspaceForm: () => null }));

const ownSite = { id: 51, site_code: "SITE-A", site_name: "Assigned site", owner_company_id: 1, branch_id: 2, site_type: "yard", status: "active" };
const siblingSite = { ...ownSite, id: 52, site_code: "SITE-B", site_name: "Sibling site", branch_id: 3 };
const read = "common_md.work_sites.view";
const manage = "common_md.work_sites.manage";
const query = {
  select: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
  is: vi.fn().mockReturnThis(), update: vi.fn().mockReturnThis(), single: vi.fn(), maybeSingle: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mock.ctx = {
    profile: { id: 1 } as AuthContext["profile"], email: null, accountStatus: "active", isAccountActive: true,
    roleCodes: ["site_reader", "site_editor"], permissionCodes: [read, manage], roleAssignments: [
      { roleId: 1, roleCode: "site_reader", ownerCompanyId: 1, branchId: null, permissionCodes: [read] },
      { roleId: 2, roleCode: "site_editor", ownerCompanyId: 1, branchId: 2, permissionCodes: [manage] },
    ],
  };
  mock.client.mockResolvedValue({ from: () => query });
});
afterEach(cleanup);

it("adds Edit to permitted work-site rows while preserving read access to sibling rows", async () => {
  query.order.mockResolvedValueOnce({ data: [ownSite, siblingSite], error: null });
  const page = await WorkSitesPage();
  render(<FluentProvider theme={webLightTheme}><WorkspaceUiMemoryProvider principalId="test-owner">{page}</WorkspaceUiMemoryProvider></FluentProvider>);
  expect(screen.getByRole("link", { name: "Edit Assigned site" }).getAttribute("href")).toBe("/admin/common-master-data/work-sites/record/51?mode=edit");
  expect(screen.getByRole("link", { name: "Sibling site" })).toBeTruthy();
  expect(screen.queryByRole("link", { name: "Edit Sibling site" })).toBeNull();
});

it.each([
  { site: ownSite, requested: undefined, expected: "view" },
  { site: ownSite, requested: "edit", expected: "edit" },
  { site: siblingSite, requested: "edit", expected: "view" },
  { site: { ...ownSite, owner_company_id: 2 }, requested: "edit", expected: "view" },
])("uses $expected mode for a $requested request at the record route", async ({ site, requested, expected }) => {
  query.single.mockResolvedValueOnce({ data: site, error: null });
  query.order.mockResolvedValueOnce({ data: [], error: null });
  const page = await WorkSiteRecordPage({ params: Promise.resolve({ id: String(site.id) }), searchParams: Promise.resolve({ mode: requested }) });
  expect(page.props.mode).toBe(expected);
});

it("reports an edit as unsuccessful when the update affects no permitted row", async () => {
  query.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
  const result = await updateWorkSite({ id: siblingSite.id, site_name: "Revised site" });
  expect(result).toMatchObject({ success: false, error: expect.stringContaining("permission") });
  expect(query.select).toHaveBeenCalledWith("id");
  expect(mock.audit).not.toHaveBeenCalled();
  expect(mock.revalidate).not.toHaveBeenCalled();
});

it("reports success and refreshes the work site only after the update returns its ID", async () => {
  query.maybeSingle.mockResolvedValueOnce({ data: { id: ownSite.id }, error: null });
  expect(await updateWorkSite({ id: ownSite.id, site_name: "Revised site" })).toEqual({ success: true });
  expect(query.eq).toHaveBeenCalledWith("id", ownSite.id);
  expect(query.is).toHaveBeenCalledWith("deleted_at", null);
  expect(mock.audit).toHaveBeenCalledWith(expect.objectContaining({ entity_id: ownSite.id, action: "update" }));
  expect(mock.revalidate).toHaveBeenCalledWith("/admin/common-master-data/work-sites/record/51");
});
