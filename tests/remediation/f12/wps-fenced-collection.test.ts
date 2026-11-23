import { beforeEach, expect, it, vi } from "vitest";
import type { AuthContext } from "@/lib/rbac/check";

const dependencies = vi.hoisted(() => ({
  admin: vi.fn(),
  subjects: vi.fn(),
  linked: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: dependencies.admin }));
vi.mock("@/lib/rbac/employee-access", async original => ({
  ...await original<typeof import("@/lib/rbac/employee-access")>(),
  getAuthorizedReportEmployees: dependencies.subjects,
  getLinkedEmployeeId: dependencies.linked,
}));

import { createScopedReportReadClient, revalidateScopedReportReadClient } from "@/lib/report-center/scoped-read-client";
import { wpsReadinessFetcher } from "@/server/actions/reports/hr/wps-readiness-report";

const permissions = ["reports.run", "reports.export", "hr.employees.view", "hr.payroll.view", "hr.banking.view"];
const actor = {
  profile: { id: 50, must_change_password: false },
  roleAssignments: [{ roleCode: "fixture", roleId: 4, ownerCompanyId: 1, branchId: 11, permissionCodes: permissions }],
  roleCodes: [],
  permissionCodes: permissions,
  isAccountActive: true,
  accountStatus: "active",
} as AuthContext;
const sources = [
  "employees",
  "employee_payroll_profiles",
  "employee_wps_profiles",
  "employee_salary_components",
  "employee_salary_revision_effects",
  "employee_payroll_holds",
  "owner_companies",
  "banks",
  "hr_salary_component_types",
  "erp_user_employee_links",
] as const;

type FixtureRow = Record<string, unknown>;
function fixture(size = 1) {
  const ids = Array.from({ length: size }, (_, index) => index + 1);
  dependencies.subjects.mockResolvedValue({
    ids, subjects: ids.map(id => ({ id, owner_company_id: 1, branch_id: 11, reporting_manager_id: null })),
  });
  const tables: Record<string, FixtureRow[]> = {
    employees: ids.map(id => ({
      id, workspace_revision: 1, employee_code: `SYN-${id}`, full_name_en: "Synthetic employee",
      employee_status: "active", joining_date: "2020-01-01", owner_company_id: 1,
      owner_company: { legal_name_en: "Synthetic company" },
    })),
    employee_payroll_profiles: ids.map(employee_id => ({
      employee_id, workspace_revision: 1, effective_date: "2020-01-01", currency: "USD", payroll_status: "active",
    })),
    employee_wps_profiles: ids.map(employee_id => ({
      employee_id, workspace_revision: 1, wps_applicable: true, wps_status: "active",
      salary_payment_method: "bank_transfer", labour_card_number: "PRIVATE_LABOUR",
      mohre_person_code: "PRIVATE_MOHRE", bank_id: 1, iban_state: "valid", exchange_house: null,
      bank: { bank_name_en: "Synthetic bank" },
    })),
    employee_salary_components: ids.map(id => ({
      id, employee_id: id, workspace_revision: 1, component_type_id: 1, amount: "0.10",
      effective_from: "2020-01-01", effective_to: null, is_active: true, deleted_at: null,
      component_type: { component_kind: "earning", is_basic: true, workspace_revision: 1 },
    })),
    employee_salary_revision_effects: [],
    employee_payroll_holds: [],
  };
  const generations: Record<string, string> = Object.fromEntries(sources.map(source => [source, "1"]));
  const selectReads: string[] = [];
  const pageReads: string[] = [];
  const exactCountReads: string[] = [];
  const readPayloads: number[] = [];
  const from = (table: string) => {
    let visible = tables[table];
    let first = 0;
    let last = 499;
    let exactCount = true;
    const query = {
      select: () => { selectReads.push(table); return query; },
      range: (start: number, end: number) => { first = start; last = end; return query; },
      in: (column: string, values: unknown[]) => { visible = visible.filter(row => values.includes(row[column])); return query; },
      is: () => query,
      eq: () => query,
      lte: () => query,
      order: () => query,
      setHeader: (name: string, value: string) => {
        expect(name.toLowerCase()).toBe("prefer");
        exactCount = value.includes("count=exact");
        return query;
      },
      then: (resolve: (value: { data: FixtureRow[]; count: number | null; error: null }) => unknown) => {
        pageReads.push(table);
        if (exactCount) exactCountReads.push(table);
        const data = visible.slice(first, last + 1);
        readPayloads.push(Buffer.byteLength(JSON.stringify(data)));
        return Promise.resolve({ data, count: exactCount ? visible.length : null, error: null }).then(resolve);
      },
    };
    return query;
  };
  dependencies.admin.mockReturnValue({
    from,
    rpc: (name: string) => {
      expect(name).toBe("phase3_report_source_generations");
      return { abortSignal: async () => ({ data: { ...generations }, error: null }) };
    },
  });
  return { generations, selectReads, pageReads, exactCountReads, readPayloads, tables };
}

async function reportClient() {
  return createScopedReportReadClient(actor, "HR_WPS_READINESS", ["reports.export"]);
}

beforeEach(() => {
  vi.resetAllMocks();
  dependencies.linked.mockResolvedValue(null);
});

it("reads six authorized WPS sources once across 1,107 employees and exact native pages", async () => {
  const { selectReads, pageReads, exactCountReads } = fixture(1107);
  const client = await reportClient();
  const result = await wpsReadinessFetcher.fetch({}, permissions, client);
  await revalidateScopedReportReadClient(client, actor);
  expect(selectReads).toEqual(sources.slice(0, 6));
  expect(pageReads).toHaveLength(14);
  expect(exactCountReads).toEqual(sources.slice(0, 6));
  expect(result.rows.map(row => row.employee_code)).toEqual(
    Array.from({ length: 1107 }, (_, index) => `SYN-${index + 1}`),
  );
  expect(result.rows[1106]).toMatchObject({ readiness_status: "ready", bank_name: "Synthetic bank" });
  expect(result.meta).toMatchObject({ total: 1107, ownerCompanyIds: [1], sourceFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/) });
  expect(JSON.stringify(result)).not.toContain("PRIVATE_");
});

it("does not read child sources when the verified scope has zero eligible subjects", async () => {
  const { selectReads, pageReads } = fixture(0);
  const client = await reportClient();
  const result = await wpsReadinessFetcher.fetch({}, permissions, client);
  await revalidateScopedReportReadClient(client, actor);
  expect(result).toMatchObject({ rows: [], meta: { total: 0 } });
  expect(selectReads).toEqual(["employees"]);
  expect(pageReads).toEqual(["employees"]);
});

it.each(sources)("rejects a changed generation for %s before releasing output", async source => {
  const { generations } = fixture();
  const client = await reportClient();
  await wpsReadinessFetcher.fetch({}, permissions, client);
  generations[source] = "3";
  await expect(revalidateScopedReportReadClient(client, actor)).rejects.toThrow("Report data changed during collection");
});

it("rejects price-source replacement across count-free continuation pages", async () => {
  const { exactCountReads, generations } = fixture(501);
  const client = await reportClient();
  const result = await wpsReadinessFetcher.fetch({}, permissions, client);
  expect(result.meta?.total).toBe(501);
  expect(exactCountReads.filter(table => table === "employee_salary_components")).toHaveLength(1);
  generations.employee_salary_components = "2";
  await expect(revalidateScopedReportReadClient(client, actor)).rejects.toThrow("Report data changed during collection");
});

it("keeps report rows, totals, company and fingerprint identical to the two-pass path", async () => {
  const baseline = fixture(1107);
  const oldClient = await reportClient();
  const oldReport = await wpsReadinessFetcher.fetch({}, permissions, { from: oldClient.from });
  await revalidateScopedReportReadClient(oldClient, actor);
  const candidate = fixture(1107);
  const newClient = await reportClient();
  const newReport = await wpsReadinessFetcher.fetch({}, permissions, newClient);
  await revalidateScopedReportReadClient(newClient, actor);

  const bytes = (payloads: number[]) => payloads.reduce((total, size) => total + size, 0);
  expect(newReport).toEqual(oldReport);
  expect(baseline.pageReads).toHaveLength(28);
  expect(candidate.pageReads).toHaveLength(14);
  expect(bytes(baseline.readPayloads)).toBe(2 * bytes(candidate.readPayloads));
});

it("refuses fenced output when a required relationship's generation is unavailable", async () => {
  const { generations } = fixture();
  delete generations.banks;
  const client = await reportClient();
  await wpsReadinessFetcher.fetch({}, permissions, client);
  await expect(revalidateScopedReportReadClient(client, actor)).rejects.toThrow("Report data changed during collection");
});

it("retains the authorized branch and current export capability", async () => {
  const { tables } = fixture();
  tables.employees.push({ ...tables.employees[0], id: 2, employee_code: "FOREIGN_BRANCH" });
  tables.employee_wps_profiles.push({ ...tables.employee_wps_profiles[0], employee_id: 2, bank: { bank_name_en: "FOREIGN_BANK" } });
  const client = await reportClient();
  const result = await wpsReadinessFetcher.fetch({}, permissions, client);
  expect(JSON.stringify(result)).not.toContain("FOREIGN_");
  expect(result.rows).toHaveLength(1);
  expect(dependencies.subjects).toHaveBeenCalledWith(actor, expect.arrayContaining(permissions.filter(p => p !== "hr.employees.view")));
  dependencies.subjects.mockResolvedValue({ ids: [], subjects: [] });
  await expect(revalidateScopedReportReadClient(client, actor)).rejects.toThrow("scope changed");
});
