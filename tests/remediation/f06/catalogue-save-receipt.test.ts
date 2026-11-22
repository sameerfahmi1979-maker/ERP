// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import type { AuthContext } from "@/lib/rbac/check";
import { saveCommonCatalogue } from "@/server/save-common-catalogue";
import { updateWorkSite } from "@/server/actions/common-master-data/work-sites";

const observed = vi.hoisted(() => ({ rpc: vi.fn(), refresh: vi.fn(), context: {} as AuthContext }));
vi.mock("next/cache", () => ({ revalidatePath: observed.refresh }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: observed.rpc }) }));
vi.mock("@/lib/rbac/check", async () => ({
  ...await import("@/lib/rbac/scope"),
  getAuthContext: async () => observed.context,
}));

const contract = { revision: "4", operationId: "30000000-0000-4000-8000-000000000004" };
const basicReceipt = { id: 1, revision: "4", replayed: false };
const permissions = ["common_md.work_sites.manage"];
const cases = [
  { label: "catalogue", routine: "phase3_save_catalogue", fields: {}, invoke: () => saveCommonCatalogue("designations", 1, { designation_name_en: "Synthetic" }, contract) },
  { label: "work site", routine: "phase3_save_work_site",
    fields: { owner_company_id: 1, branch_id: 11, available_to_all_organizations: false },
    invoke: () => updateWorkSite({ id: 1, site_name: "Synthetic", owner_company_id: 1 }, contract) },
];

beforeEach(() => {
  vi.resetAllMocks();
  observed.context = {
    isAccountActive: true,
    profile: { id: 1 },
    permissionCodes: permissions,
    roleCodes: ["site_manager"],
  } as AuthContext;
});

for (const entry of cases) {
  it.each([false, true])(`${entry.label} retains an exact no-op result with replayed=%s and skips refresh`, async replayed => {
    const receipt = { ...basicReceipt, ...entry.fields, replayed, changed: false };
    observed.rpc.mockResolvedValue({ data: receipt, error: null });
    const result = await entry.invoke();
    expect(result).toEqual({ success: true, data: receipt });
    expect(observed.rpc).toHaveBeenCalledExactlyOnceWith(entry.routine, expect.objectContaining({
      p_revision: contract.revision, p_operation: contract.operationId,
    }));
    expect(observed.refresh).not.toHaveBeenCalled();
  });

  it(`${entry.label} still refreshes both routes on legacy confirmed change`, async () => {
    const receipt = { ...basicReceipt, ...entry.fields, revision: "5" };
    observed.rpc.mockResolvedValue({ data: receipt, error: null });
    expect(await entry.invoke()).toEqual({ success: true, data: receipt });
    expect(observed.refresh).toHaveBeenCalledTimes(2);
  });

  it(`${entry.label} rejects a no-op receipt reporting a different revision`, async () => {
    observed.rpc.mockResolvedValue({ data: { ...basicReceipt, ...entry.fields, revision: "5", changed: false }, error: null });
    expect(await entry.invoke()).toMatchObject({ success: false, uncertain: true });
    expect(observed.refresh).not.toHaveBeenCalled();
  });
}
