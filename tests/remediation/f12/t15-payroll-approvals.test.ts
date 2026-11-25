import { beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PayrollApprovalWorkspace } from "@/features/hr/payroll-approvals/payroll-approval-workspace";
import { parsePayrollReviewCommand } from "@/lib/hr/payroll/approval-contract";
import { listPayrollReviewScopes, readPayrollReview, savePayrollReviewCommand } from "@/server/actions/hr/payroll-approvals";

const mock = vi.hoisted(() => ({ auth: vi.fn(), rpc: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/rbac/check", async () => ({ ...await import("@/lib/rbac/scope"), getAuthContext: mock.auth }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: mock.rpc }) }));
vi.mock("next/cache", () => ({ revalidatePath: mock.revalidate }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

const operation = "d7163da7-dde0-48f4-b782-5aacaa112da8";
const version = "d9eae01a-f579-4b1f-834c-d9828ea452c7";
const run = "ba596e40-5823-4f01-b0c0-c88c224536ef";
const reviewId = "6371156a-70da-4044-a9c2-d17f1287678a";
const digest = "5".repeat(64);
const scheduleDigest = "8".repeat(64);
const cutoff = "2026-11-30T15:45:02.123456+00:00";
const selection = { company: 9, branch: 2, month: "2026-11-01" };
const params = { company: "9", branch: "2", month: "2026-11" };
const gmScope = { company_id: 9, branch_id: 2, company: "Test employer", branch: "Test branch", can_submit: false, can_approve: true };
const accountsScope = { ...gmScope, can_submit: true, can_approve: false };
const empty = {
  can_submit: false, can_approve: true, draft: null, reviews: [], review: null, employees: [], detail: null, next_before: null,
};
const draft = {
  run, version, number: 2, month: selection.month, cutoff, digest, source_digest: "a".repeat(64), rule_digest: "b".repeat(64),
  totals: [{ currency: "AED", gross: "100.85", deductions: "2.00", net: "98.85", employees: 1 }],
  exception_count: 1, blocking_count: 0, can_submit: true,
};
const review = {
  id: reviewId, run, version, number: 2, month: selection.month, cutoff, digest, state: "submitted",
  bank_state: "not-issued", submitted_at: cutoff, decision_at: null, source_digest: draft.source_digest, rule_digest: draft.rule_digest,
  totals: draft.totals, exception_count: 1, blocking_count: 0, submitter_label: "Accounts reviewer", approver_label: null,
  actions: ["approve", "reject"], claims_count: 0, events: [{ kind: "submitted", date: cutoff, reason: "Reviewed for approval" }],
};

function command(action: "submit" | "approve" = "approve") {
  const form = new FormData();
  form.set(action === "submit" ? "run" : "review", action === "submit" ? run : reviewId);
  form.set("version", version);
  form.set("digest", digest);
  form.set("reason", "  Verified against the signed exact totals.  ");
  return form;
}

beforeEach(() => {
  mock.auth.mockReset().mockResolvedValue({ isAccountActive: true, profile: {}, roleAssignments: [] });
  mock.rpc.mockReset();
  mock.revalidate.mockReset();
});

it("pins a submit or decision to one exact version and rejects ambiguous fields", () => {
  const form = command("submit");
  expect(parsePayrollReviewCommand("submit", form)).toEqual({
    run, version, digest, reason: "Verified against the signed exact totals.", acknowledge_exceptions: false,
  });
  form.set("acknowledge_exceptions", "true");
  expect(parsePayrollReviewCommand("submit", form)).toMatchObject({ acknowledge_exceptions: true });
  form.append("digest", "6".repeat(64));
  expect(parsePayrollReviewCommand("submit", form)).toBeNull();
  const decision = command();
  expect(parsePayrollReviewCommand("approve", decision)).toEqual({ review: reviewId, version, digest, reason: "Verified against the signed exact totals." });
  decision.set("digest", "not-a-version-digest");
  expect(parsePayrollReviewCommand("approve", decision)).toBeNull();
  expect(parsePayrollReviewCommand("record-bank-payment", command())).toBeNull();
});

it("loads authorized scope, exact review and cursor through default POST RPC", async () => {
  mock.rpc.mockResolvedValueOnce({ data: [gmScope], error: null }).mockResolvedValueOnce({ data: empty, error: null });
  await expect(listPayrollReviewScopes()).resolves.toEqual([gmScope]);
  await expect(readPayrollReview({ ...selection, review: reviewId, employee: 44, before: 67 })).resolves.toEqual(empty);
  await expect(readPayrollReview({ ...selection, month: "2026-11-30" })).resolves.toBeNull();
  expect(mock.rpc.mock.calls).toEqual([
    ["t15_payroll_review_scopes", {}],
    ["t15_payroll_review_workspace", { p_company: 9, p_branch: 2, p_month: "2026-11-01", p_review: reviewId, p_employee: 44, p_before: 67 }],
  ]);
});

it("submits one exact recovery schedule digest with the approve action", () => {
  const form = command();
  form.set("recovery_schedule_digest", scheduleDigest);
  expect(parsePayrollReviewCommand("approve", form)).toMatchObject({ recovery_schedule_digest: scheduleDigest });
  expect(parsePayrollReviewCommand("reject", form)).toBeNull();
  form.append("recovery_schedule_digest", scheduleDigest);
  expect(parsePayrollReviewCommand("approve", form)).toBeNull();
});

it("shows all retained instalments above the GM decision without selecting an employee", async () => {
  mock.rpc.mockResolvedValueOnce({ data: [gmScope], error: null }).mockResolvedValueOnce({ data: {
    ...empty, review: { ...review, recovery_schedule_snapshot: { digest: scheduleDigest, schedules: [{
      case: "32", schedule: "55", employee: "44", line: version, mode: "instalments", currency: "AED",
      principal: "300.00", period_deduction: "100.00", instalments: [
        { month: "2026-11-01", amount: "100.00" }, { month: "2026-12-01", amount: "200.00" },
      ],
    }] } },
  }, error: null });
  const html = renderToStaticMarkup(await PayrollApprovalWorkspace({ params: { ...params, review: reviewId } }));
  expect(html).toContain("Instalment schedule #55");
  expect(html).toContain("AED 300.00");
  expect(html).toContain("AED 200.00");
  expect(html).toContain(scheduleDigest);
});

it("directs a legacy open recovery review back to Accounts for recalculation", async () => {
  mock.rpc.mockResolvedValueOnce({ data: [gmScope], error: null }).mockResolvedValueOnce({ data: {
    ...empty, review: { ...review, recovery_schedule_required: true, recovery_schedule_snapshot: null },
  }, error: null });
  const html = renderToStaticMarkup(await PayrollApprovalWorkspace({ params: { ...params, review: reviewId } }));
  expect(html).toContain("Accounts must withdraw it, recalculate and submit a new version.");
  expect(html).toContain("Reject this version");
  expect(html).not.toContain("Approve exact version");
});

it("passes the identical exact approval on retry and limits invalidation to payroll", async () => {
  const receipt = { review: reviewId, run, version, digest, state: "approved", claims_count: 0, action: "approve" };
  mock.rpc.mockRejectedValueOnce(new Error("transport lost after operation"))
    .mockResolvedValueOnce({ data: { ...receipt, replayed: true }, error: null });
  const form = command();
  form.set("recovery_schedule_digest", scheduleDigest);
  await expect(savePayrollReviewCommand("approve", 9, 2, operation, form)).resolves.toMatchObject({ ok: false, uncertain: true });
  await expect(savePayrollReviewCommand("approve", 9, 2, operation, form)).resolves.toEqual({ ok: true, ...receipt });
  expect(mock.rpc.mock.calls[0]).toEqual(mock.rpc.mock.calls[1]);
  expect(mock.rpc.mock.calls[0]).toEqual(["t15_payroll_review_command", {
    p_operation: operation, p_company: 9, p_branch: 2, p_action: "approve",
    p_data: { review: reviewId, version, digest, recovery_schedule_digest: scheduleDigest, reason: "Verified against the signed exact totals." },
  }]);
  expect(mock.revalidate.mock.calls).toEqual([["/admin/hr/payroll/approvals"], ["/admin/hr/payroll/runs"]]);
});

it("stops inactive sessions and omits protected database denial details", async () => {
  mock.auth.mockResolvedValueOnce({ isAccountActive: false, profile: {}, roleAssignments: [] });
  await expect(savePayrollReviewCommand("approve", 9, 2, operation, command())).resolves.toMatchObject({ ok: false, uncertain: false });
  expect(mock.rpc).not.toHaveBeenCalled();
  mock.rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "CONFIDENTIAL PAYROLL" } });
  await expect(readPayrollReview(selection)).resolves.toBeNull();
  const denied = await savePayrollReviewCommand("approve", 9, 2, operation, command());
  expect(denied).toMatchObject({ ok: false, uncertain: false });
  expect(JSON.stringify(denied)).not.toContain("CONFIDENTIAL PAYROLL");
  expect(mock.revalidate).not.toHaveBeenCalled();
});

it("stops a sibling scope and only offers submission for eligible Accounts drafts", async () => {
  mock.rpc.mockResolvedValueOnce({ data: [accountsScope], error: null });
  const sibling = await PayrollApprovalWorkspace({ params: { ...params, branch: "3" } });
  expect(renderToStaticMarkup(sibling)).toContain("Choose an employer and branch from the available list.");
  expect(mock.rpc).toHaveBeenCalledTimes(1);
  mock.rpc.mockResolvedValueOnce({ data: [accountsScope], error: null }).mockResolvedValueOnce({ data: {
    ...empty, can_submit: true, can_approve: false, draft: { ...draft, blocking_count: 1, can_submit: false },
  }, error: null });
  const blocked = await PayrollApprovalWorkspace({ params });
  const html = renderToStaticMarkup(blocked);
  expect(html).toContain("1 blocking exception");
  expect(html).not.toContain("Submit exact version");
  mock.rpc.mockResolvedValueOnce({ data: [accountsScope], error: null }).mockResolvedValueOnce({ data: {
    ...empty, can_submit: true, can_approve: false, draft,
  }, error: null });
  const ready = renderToStaticMarkup(await PayrollApprovalWorkspace({ params }));
  expect(ready).toContain("Submit exact version");
  expect(ready).toContain("Acknowledge");
  expect(ready).toContain(digest);
  expect(ready).not.toContain("Open Payroll Runs");
});

it("links to T14 only for a submitter who can calculate in the selected branch", async () => {
  mock.auth.mockResolvedValue({ isAccountActive: true, profile: {}, roleAssignments: [
    { roleCode: "test_accountant", ownerCompanyId: 9, branchId: 2, permissionCodes: ["hr.payroll.run.manage"] },
  ] });
  mock.rpc.mockResolvedValueOnce({ data: [accountsScope], error: null }).mockResolvedValueOnce({ data: {
    ...empty, can_submit: true, can_approve: false,
  }, error: null }).mockResolvedValueOnce({ data: [
    { company_id: 9, branch_id: 2, company: "Test employer", branch: "Test branch", can_calculate: true, can_policy: false },
  ], error: null });
  const html = renderToStaticMarkup(await PayrollApprovalWorkspace({ params }));
  expect(html).toContain("Open Payroll Runs");
  expect(html).toContain("/admin/hr/payroll/runs?company=9&amp;branch=2&amp;month=2026-11");
});

it("shows pinned review details and hides actions when the server withholds them", async () => {
  const workspace = {
    ...empty, draft, reviews: [review], review,
    employees: [{ id: 44, name: "Test payee", employment_ids: [23], currency: "AED", gross: "100.85", deductions: "2.00",
      net: "98.85", state: "ready", exception_count: 1 }],
    detail: { id: 44, name: "Test payee", lines: [{
      key: "fleet-overtime:88", category: "fleet-overtime", kind: "earning", amount: "12.34", currency: "AED", quantity: "2",
      unit: "hours", rate: "6.17", original_on: "2026-10-30", available_at: "2026-11-01T17:00:00+04:00",
      source: { calculation_rule_id: 77, internal_memo: "PRIVATE_MEMO_SENTINEL" }, reason: "Verified signed work.",
    }], exceptions: [{ code: "next-period", reason: "Reconciled for a later month.", blocking: false, source: null }] },
  };
  mock.rpc.mockResolvedValueOnce({ data: [gmScope], error: null }).mockResolvedValueOnce({ data: workspace, error: null });
  const query = { ...params, review: reviewId, employee: "44" };
  const html = renderToStaticMarkup(await PayrollApprovalWorkspace({ params: query }));
  expect(html).toContain("Approve exact version");
  expect(html).toContain(digest);
  expect(html).toContain("98.85");
  expect(html).toContain("Verified signed work.");
  expect(html).toContain("Reconciled for a later month.");
  expect(html).toContain("Fleet overtime");
  expect(html).toContain("Source references");
  expect(html).toContain(draft.rule_digest);
  expect(html).not.toContain("Current draft");
  expect(html).not.toContain("PRIVATE_MEMO_SENTINEL");
  mock.rpc.mockResolvedValueOnce({ data: [gmScope], error: null }).mockResolvedValueOnce({ data: {
    ...workspace, review: { ...review, actions: [], state: "approved", bank_state: "unknown" },
  }, error: null });
  const earlier = renderToStaticMarkup(await PayrollApprovalWorkspace({ params: query }));
  expect(earlier).not.toContain("Approve exact version");
  expect(earlier).not.toContain("Release approval");
});
