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

const mock = vi.hoisted(() => ({ ctx: {} as AuthContext, client: vi.fn(), rpc: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/rbac/check", async () => ({ ...await import("@/lib/rbac/scope"), getAuthContext: async () => mock.ctx }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mock.client }));
vi.mock("next/cache", () => ({ revalidatePath: mock.revalidate }));
vi.mock("next/navigation", () => ({ usePathname: () => "/admin/common-master-data/work-sites", useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/erp/export/erp-export-menu", () => ({ ERPExportMenu: () => null }));
vi.mock("@/features/common-master-data/work-sites/work-site-workspace-form", () => ({ WorkSiteWorkspaceForm: () => null }));

const ownSite = { id: 51, site_code: "SITE-A", site_name: "Assigned site", owner_company_id: 1, branch_id: 2, site_type: "yard", status: "active" };
const siblingSite = { ...ownSite, id: 52, site_code: "SITE-B", site_name: "Sibling site", branch_id: 3 };
const read = "common_md.work_sites.view";
const manage = "common_md.work_sites.manage";
const contract = { operationId: "10000000-0000-4000-8000-000000000051", revision: "1" };
const query = {
  select: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
  is: vi.fn().mockReturnThis(), range: vi.fn(), single: vi.fn(), in: vi.fn().mockResolvedValue({data:[],error:null}),
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
  mock.client.mockResolvedValue({ from: () => query, rpc: mock.rpc });
});
afterEach(cleanup);

it("adds Edit to permitted work-site rows while preserving read access to sibling rows", async () => {
  query.range.mockResolvedValueOnce({ data: [ownSite, siblingSite], count: 2, status: 200, error: null });
  const page = await WorkSitesPage({});
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
  mock.rpc.mockResolvedValueOnce({ data: null, error: { code: "42501" } });
  const result = await updateWorkSite({ id: siblingSite.id, site_name: "Revised site" }, contract);
  expect(result).toMatchObject({ success: false, error: expect.stringContaining("permission") });
  expect(mock.rpc).toHaveBeenCalledWith("phase3_save_work_site", expect.objectContaining({p_id:siblingSite.id,p_revision:"1"}));
  expect(mock.revalidate).not.toHaveBeenCalled();
});

it("reports success and refreshes the work site only after the update returns its ID", async () => {
  const receipt = { id: ownSite.id, revision: "2", replayed: false, owner_company_id: 1, branch_id: 2, available_to_all_organizations: false };
  mock.rpc.mockResolvedValueOnce({ data: receipt, error: null });
  expect(await updateWorkSite({ id: ownSite.id, site_name: "Revised site" }, contract)).toEqual({ success: true, data: receipt });
  expect(mock.rpc).toHaveBeenCalledWith("phase3_save_work_site", expect.objectContaining({p_id:ownSite.id,p_data:{site_name:"Revised site"}}));
  expect(mock.revalidate).toHaveBeenCalledWith("/admin/common-master-data/work-sites/record/51");
});
