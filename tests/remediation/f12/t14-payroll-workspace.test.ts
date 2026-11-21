import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PayrollRunWorkspace } from "@/features/hr/payroll-runs/payroll-workspace";
import { RecoveryWorkspace } from "@/features/hr/recoveries/recovery-workspace";
import { parsePayrollCommand, payrollQuery, payrollWorkspace } from "@/lib/hr/payroll/run-contract";
import { listPayrollRunScopes, readPayrollRun, savePayrollCommand } from "@/server/actions/hr/payroll-runs";

const mock = vi.hoisted(() => ({ auth: vi.fn(), rpc: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/rbac/check", async () => ({
  ...await import("@/lib/rbac/scope"),
  getAuthContext: mock.auth,
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: mock.rpc }) }));
vi.mock("next/cache", () => ({ revalidatePath: mock.revalidate }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

const operation = "d7163da7-dde0-48f4-b782-5aacaa112da8";
const version = "d9eae01a-f579-4b1f-834c-d9828ea452c7";
const run = "ba596e40-5823-4f01-b0c0-c88c224536ef";
const versionTwo = "6371156a-70da-4044-a9c2-d17f1287678a";
const scope = { company_id: 9, branch_id: 2, company: "Test employer", branch: "Test branch", can_calculate: true, can_policy: false };
const selection = { company: 9, branch: 2, month: "2026-11-01" };
const empty = {
  can_calculate: true, can_policy: false, run: null, version: null, versions: [],
  employees: [], detail: null, rules: [], groups: [], adjustments: [], evidence: [], next_before: null,
};
const cutoff = "2026-11-30T15:45:00+00:00";
const draft = {
  id: version, number: 1, month: "2026-11-01", cutoff,
  digest: "5".repeat(64), exception_count: 1,
  totals: [{ currency: "AED", gross: "335000.29", deductions: "2.72", net: "334997.57", employees: 26 }],
};

function calculation(cutoff = "2026-11-30T19:45") {
  const data = new FormData();
  data.set("month", "2026-11");
  data.set("cutoff", cutoff);
  data.set("expected_version", version);
  data.set("reason", "Check the verified inputs after cutoff.");
  return data;
}

beforeEach(() => {
  mock.auth.mockReset().mockResolvedValue({ isAccountActive: true, profile: {}, roleAssignments: [] });
  mock.rpc.mockReset();
  mock.revalidate.mockReset();
});

it("shows payment-owned recovery history and retains direct reconciliation for authorized legacy movements", async () => {
  const payroll = { kind: "payroll", destination: { company: 9, branch: 2, month: "2026-10-01", review: version, employee: 44, payment: run } };
  const exit = { kind: "exit", destination: { company: 9, branch: 2, eos: 76, payment: versionTwo } };
  const recovery = { kind: "recovery", can_reconcile: true };
  const totals = {
    authority_payable: 100, principal: 100, collected: 60, outstanding: 40, remaining: 40, disputed: 0, refund_due: 0,
    reconciled_cost: 100, employee_cash_received: 0, employee_cash_allocated: 0, unallocated: false,
    current_review: true, current_cost: true, current_finance: true, unallocated_deduction: 0, unallocated_refund: 0,
  };
  const receipt = { pin: 31, amount: 30, final: false, schedule: 19, month: "2026-10-01", line: operation, approved: 30 };
  const allocation = { pin: 31, amount: 30, reverses: null };
  const record = {
    id: 56, source_kind: "fine", source_status: "open", subject_status: "confirmed", occurred_at: cutoff,
    currency: "AED", employee_id: 44, incident_id: null, source_amount: 100, empl_company_id: 9, operating_branch: 2,
    hr_basis: null, accounts_basis: null, reviews: [], disputes: [], evidence: [], totals,
    receipts: [
      { ...receipt, id: 101, owner: payroll }, { ...receipt, id: 102, owner: exit },
      { ...receipt, id: 103, owner: { kind: "payroll", destination: null } }, { ...receipt, id: 104, owner: recovery },
      { ...receipt, id: 105 }, { ...receipt, id: 106, owner: { kind: "recovery", can_reconcile: false } },
    ],
    allocations: [
      { ...allocation, id: 201, receipt: 101, owner: payroll }, { ...allocation, id: 202, receipt: 102, owner: exit },
      { ...allocation, id: 203, receipt: 101, reverses: 201, owner: payroll },
      { ...allocation, id: 204, receipt: 104, owner: recovery },
    ],
  };
  mock.rpc.mockResolvedValueOnce({ data: [{ id: 2, branch: "Test branch", company: "Test company" }], error: null })
    .mockResolvedValueOnce({ data: { cases: [], case: record, policies: [], can_review: false, can_reconcile: true, can_manage_policy: false }, error: null });
  const html = renderToStaticMarkup(await RecoveryWorkspace({ query: { branch: "2", month: "2026-11", case: "56" } }));
  expect(html).toContain(`/admin/hr/payroll/settlement?scope=9.2&amp;month=2026-10&amp;review=${version}&amp;employee=44&amp;after=43#payment-${run}`);
  expect(html).toContain(`/admin/hr/actions/final-settlement?scope=9.2&amp;eos=76#payment-${versionTwo}`);
  expect(html).toContain('Reversal #203');
  expect(html).toContain('Reverses allocation #201');
  expect(html.match(/Allocate to this approved line/g)).toHaveLength(1);
  expect(html.match(/Reverse this allocation/g)).toHaveLength(1);
  expect(html.match(/Open WPS &amp; Payments/g)).toHaveLength(3);
});

describe("monthly payroll workspace", () => {
  it("sends a Dubai cutoff as a timestamp with its original offset", () => {
    expect(parsePayrollCommand("calculate", calculation())).toEqual({
      month: "2026-11-01", cutoff: "2026-11-30T19:45:00+04:00", expected_version: version,
      reason: "Check the verified inputs after cutoff.",
    });
    expect(parsePayrollCommand("calculate", calculation("2026-11-31T19:45"))).toBeNull();
  });

  it("reuses the precise retained cutoff when calculating a new draft version", () => {
    const retainedCutoff = "2026-11-30T15:45:02.123456+00:00";
    expect(parsePayrollCommand("calculate", calculation(retainedCutoff))).toMatchObject({
      cutoff: retainedCutoff, expected_version: version,
    });
  });

  it("starts and ends approved calculation rules at monthly boundaries", () => {
    const rule = new FormData();
    for (const [name, value] of Object.entries({
      from: "2026-11", until: "2027-01", proration: "calendar-days", absence: "unpaid-only",
      leave_wage_basis: "basic", daily_recovery_basis: "basic", recovery_fraction: "0.25",
      net_floor: "1600", reason: "Test monthly policy.",
    })) rule.set(name, value);
    expect(parsePayrollCommand("prepare-rule", rule)).toMatchObject({ from: "2026-11-01", until: "2027-01-01" });
    rule.set("until", "2026-11");
    expect(parsePayrollCommand("prepare-rule", rule)).toBeNull();
  });

  it("requires retained version, source and exact DMS evidence for a positive adjustment", () => {
    const data = new FormData();
    for (const [key, value] of Object.entries({
      month: "2026-11", employee: "44", version, source_key: "fleet-overtime:42", kind: "earning",
      amount: "20.15", currency: "AED", evidence: "102/117/123", reason: "Verified signed amount.",
    })) data.set(key, value);
    expect(parsePayrollCommand("prepare-adjustment", data)).toMatchObject({
      amount: "20.15", version, employee: 44, source_key: "fleet-overtime:42",
      evidence: { document: 102, version: 117, file: 123 },
    });
    data.set("evidence", "102/117");
    expect(parsePayrollCommand("prepare-adjustment", data)).toBeNull();
    data.set("evidence", "102/117/123");
    data.set("amount", "0.00");
    expect(parsePayrollCommand("prepare-adjustment", data)).toBeNull();
  });

  it("keeps exact amounts and rejects invalid record selection before reading", () => {
    const data = { ...empty, run, version: {
      id: version, number: 1, month: "2026-11-01", cutoff: "2026-11-30T15:45:00+00:00",
      digest: "5".repeat(64), exception_count: 0,
      totals: [{ currency: "AED", gross: "335000.29", deductions: "2.72", net: "334997.57", employees: 26 }],
    } };
    expect(payrollWorkspace.parse(data).version?.totals[0].net).toBe("334997.57");
    expect(payrollQuery.safeParse({ ...selection, before: -2 }).success).toBe(false);
    expect(payrollQuery.safeParse({ ...selection, version: "fake" }).success).toBe(false);
  });

  it("uses protected POST reads with exact company, branch, period and cursor", async () => {
    mock.rpc.mockResolvedValueOnce({ error: null, data: [scope] })
      .mockResolvedValueOnce({ error: null, data: empty });
    await expect(listPayrollRunScopes()).resolves.toEqual([scope]);
    await expect(readPayrollRun({ ...selection, before: 51 })).resolves.toEqual(empty);
    await expect(readPayrollRun({ ...selection, before: 0 })).resolves.toBeNull();
    expect(mock.rpc.mock.calls).toEqual([
      ["t14_payroll_scopes", {}],
      ["t14_payroll_workspace", { p_company: 9, p_branch: 2, p_month: "2026-11-01", p_before: 51 }],
    ]);
  });

  it("does not expose or mutate payroll after a scoped database denial", async () => {
    mock.rpc.mockResolvedValue({ error: { code: "42501", message: "PRIVATE" } });
    await expect(readPayrollRun(selection)).resolves.toBeNull();
    await expect(savePayrollCommand("calculate", 9, 2, operation, calculation())).resolves.toMatchObject({
      ok: false, uncertain: false,
    });
    expect(mock.revalidate).not.toHaveBeenCalled();
  });

  it("uses the same operation ID after transport loss and confirms a replay", async () => {
    mock.rpc.mockRejectedValueOnce(new Error("test transport loss"))
      .mockResolvedValueOnce({ error: null, data: { id: version, replayed: true } });
    const input = calculation();
    await expect(savePayrollCommand("calculate", 9, 2, operation, input)).resolves.toMatchObject({ ok: false, uncertain: true });
    await expect(savePayrollCommand("calculate", 9, 2, operation, input)).resolves.toEqual({ ok: true });
    expect(mock.rpc.mock.calls[0]).toEqual(mock.rpc.mock.calls[1]);
    expect(mock.rpc.mock.calls[0][1].p_operation).toBe(operation);
    expect(mock.revalidate).toHaveBeenCalledWith("/admin/hr/payroll/runs");
  });

  it("does not load a sibling branch or silently substitute a different month", async () => {
    mock.rpc.mockResolvedValue({ error: null, data: [scope] });
    const invalidBranch = await PayrollRunWorkspace({ params: { company: "9", branch: "3" } });
    expect(renderToStaticMarkup(invalidBranch)).toContain("Choose an employer and branch");
    const invalidMonth = await PayrollRunWorkspace({ params: { company: "9", branch: "2", month: "2026-13" } });
    expect(renderToStaticMarkup(invalidMonth)).toContain("Choose a valid payroll month.");
    expect(mock.rpc.mock.calls).toEqual([["t14_payroll_scopes", {}], ["t14_payroll_scopes", {}]]);
  });

  it("explains a retained late earning and protects an earlier version from changes", async () => {
    const result = {
      ...empty, run, version: draft, versions: [
        { id: versionTwo, number: 2, cutoff, created_at: cutoff },
        { id: version, number: 1, cutoff, created_at: cutoff },
      ],
      employees: [{
        id: 44, name: "Test payee", employment_ids: [23], currency: "AED",
        gross: "100.85", deductions: "2.00", net: "98.85", state: "requires-review", exception_count: 1,
      }],
      detail: {
        id: 44, name: "Test payee",
        lines: [{
          key: "fleet-overtime:88", category: "fleet-overtime", kind: "earning", amount: "12.34", currency: "AED",
          quantity: "2", unit: "hours", rate: "6.17", original_on: "2026-10-30", available_at: "2026-11-01T17:00:00+04:00",
          source: { candidate_id: 77, internal_memo: "PRIVATE_MEMO_SENTINEL" }, reason: "Verified signed work.",
        }, {
          key: "recovery-deduction:56", category: "recovery-deduction", kind: "deduction", amount: "2.00", currency: "AED",
          quantity: null, unit: null, rate: null, original_on: "2026-10-15", available_at: null,
          source: { case: 56 }, reason: "Verified recovery schedule.",
        }],
        exceptions: [{ code: "awaiting-evidence", reason: "Signed evidence arrived after cutoff.", blocking: true, source: null }],
      },
    };
    mock.rpc.mockResolvedValueOnce({ error: null, data: [scope] }).mockResolvedValueOnce({ error: null, data: result });
    const page = await PayrollRunWorkspace({ params: { company: "9", branch: "2", month: "2026-11", version, employee: "44" } });
    const html = renderToStaticMarkup(page);
    expect(html).toContain("334,997.57");
    expect(html).toContain("Late input available from");
    expect(html).toContain("Signed evidence arrived after cutoff.");
    expect(html).toContain('/admin/hr/operations/recoveries?branch=2&amp;month=2026-11&amp;case=56');
    expect(html).toContain("Open the latest draft");
    expect(html).not.toContain("Save new draft version");
    expect(html).not.toContain("PRIVATE_MEMO_SENTINEL");
  });
});
