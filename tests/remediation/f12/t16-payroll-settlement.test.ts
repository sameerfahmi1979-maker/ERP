import { createHash } from "node:crypto";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { GET } from "@/app/api/hr/payroll/wps/[fileId]/route";
import { PayrollSettlementWorkspace } from "@/features/hr/payroll-settlement/payroll-settlement-workspace";
import { payrollSettlementRequest, payrollSettlementWorkspace } from "@/lib/hr/payroll/settlement-contract";
import { listPayrollEvidenceOptions, savePayrollSettlementCommand } from "@/server/actions/hr/payroll-settlement";

const mock = vi.hoisted(() => ({ auth: vi.fn(), rpc: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/rbac/check", async () => ({ ...await import("@/lib/rbac/scope"), getAuthContext: mock.auth }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: mock.rpc }) }));
vi.mock("next/cache", () => ({ revalidatePath: mock.revalidate }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const company = 17;
const branch = 22;
const scope = { company, branch };
const params = { company: String(company), branch: String(branch), month: "2026-11", employee: "44" };
const scopes = [{ company_id: company, branch_id: branch, company: "Test employer", branch: "Test branch" }];
const operation = "d7163da7-dde0-48f4-b782-5aacaa112da8";
const review = "d9eae01a-f579-4b1f-834c-d9828ea452c7";
const version = "6af4d725-aa13-42b5-888a-872c581f56c4";
const batch = "6371156a-70da-4044-a9c2-d17f1287678a";
const file = "ba596e40-5823-4f01-b0c0-c88c224536ef";
const payment = "3f0b8056-db99-43c7-addb-0767068c2831";
const line = "4d7b2841-3765-47f7-99fb-28cbc2d875c1";
const digest = "5".repeat(64);
const issue = { action: "issue", ...scope, operation, data: { review, version, digest } } as const;
const receipt = { action: "receipt", ...scope, operation, data: {
  batch, employee: 44, channel: "wps", reference: " test-cash ", amount: "31.10", currency: "AED", paid_on: "2026-11-20",
  outcome: "partial", document: 81, version: 82, file: 83,
} } as const;
const batchFile = {
  id: file, establishment: "Test establishment", filename: "payroll.sif", sha256: digest, count: 1, total: "101.02", currency: "AED", downloadable: true,
  state: "accepted", actions: [], reference: "RUN-WPS-2026-11",
};
const result = {
  employee: 44, name: "Test employee", currency: "AED", net: "101.02", channel: "wps", state: "partial", can_record: true,
  verified_cash: "31.10", applied_wages: "29.10", applied_deductions: "0.00", unallocated: "2.00",
  lines: [{ id: line, category: "basic", kind: "earning", amount: "101.02" }],
  payments: [{ id: payment, amount: "31.10", currency: "AED", outcome: "partial", allocation_revision: 1, reversed: false, can_allocate: true, can_reverse: true }],
};
const workspace = {
  selected_review: review, next_after: null,
  access: { issue: true, reconcile: true },
  reviews: [{ review, version, digest, number: 2, month: "2026-11-01", can_issue: false, batch: {
    id: batch, state: "accepted", files: [batchFile], alternate: [], results: [result],
    history: [{ kind: "accept", at: "2026-11-20T10:02:00+00:00" }],
  } }],
};

function read(data: unknown) {
  return { data, error: null };
}

function renderWorkspace(data: unknown, query = params) {
  mock.rpc.mockResolvedValueOnce(read(scopes)).mockResolvedValueOnce(read(data));
  return PayrollSettlementWorkspace({ params: query }).then(renderToStaticMarkup);
}

function download(id = file) {
  return GET(new Request("http://localhost/api/hr/payroll/wps/" + id), { params: Promise.resolve({ fileId: id }) });
}

beforeEach(() => {
  mock.auth.mockReset().mockResolvedValue({ isAccountActive: true, profile: {}, roleAssignments: [] });
  mock.rpc.mockReset();
  mock.revalidate.mockReset();
});

it("pins generation to one exact approval and keeps payment cents as decimal text", () => {
  expect(payrollSettlementRequest.parse(issue)).toEqual(issue);
  expect(payrollSettlementRequest.safeParse({ ...issue, data: { ...issue.data, amount: "1.00" } }).success).toBe(false);
  expect(payrollSettlementRequest.parse(receipt)).toMatchObject({ data: { amount: "31.10", reference: "test-cash" } });
  expect(payrollSettlementRequest.safeParse({ ...receipt, data: { ...receipt.data, amount: "31.101" } }).success).toBe(false);
  expect(payrollSettlementRequest.safeParse({ ...receipt, data: { ...receipt.data, amount: 31.10 } }).success).toBe(false);
  const proof = { document: 81, version: 82, file: 83 };
  const submission = { action: "record-submission", ...scope, operation, data: { batch, reference: "RUN-NOV", ...proof } };
  expect(payrollSettlementRequest.safeParse(submission).success).toBe(false);
  expect(payrollSettlementRequest.safeParse({ ...submission, data: { ...submission.data, wps_file: file } }).success).toBe(true);
  expect(payrollSettlementRequest.safeParse({ ...submission, action: "correct-file", data: { ...submission.data, wps_file: file } }).success).toBe(true);
  expect(payrollSettlementRequest.safeParse({ ...submission, action: "authorize-zero" }).success).toBe(true);
});

it("requires unique exact payroll lines and complete deduction evidence", () => {
  const allocation = { action: "allocate", ...scope, operation, data: { batch, payment, revision: 1, lines: [{ line, amount: "11.01" }] } };
  expect(payrollSettlementRequest.parse(allocation)).toEqual(allocation);
  expect(payrollSettlementRequest.safeParse({ ...allocation, data: { ...allocation.data, lines: [{ line, amount: "11.01" }, { line, amount: "1.00" }] } }).success).toBe(false);
  expect(payrollSettlementRequest.safeParse({ ...allocation, data: { ...allocation.data, reason: "Finance proof" } }).success).toBe(false);
  expect(payrollSettlementRequest.parse({ ...allocation, data: { ...allocation.data, reason: "Finance proof", document: 81, version: 82, file: 83 } }).data)
    .toMatchObject({ document: 81, version: 82, file: 83, reason: "Finance proof" });
  const closeOnly = { ...allocation, data: { ...allocation.data, lines: [], close_recoveries: [{ line, amount: "0.00" }] } };
  expect(payrollSettlementRequest.safeParse(closeOnly).success).toBe(false);
  expect(payrollSettlementRequest.safeParse({ ...closeOnly, data: {
    ...closeOnly.data, document: 81, version: 82, file: 83, reason: "Verified shortfall",
  } }).success).toBe(true);
});

it("sends an identical operation and payload after an uncertain response", async () => {
  mock.rpc.mockRejectedValueOnce(new Error("lost response"))
    .mockResolvedValueOnce(read({ batch, payment, state: "partial" }));
  await expect(savePayrollSettlementCommand(receipt)).resolves.toMatchObject({ ok: false, uncertain: true });
  await expect(savePayrollSettlementCommand(receipt)).resolves.toMatchObject({ ok: true });
  expect(mock.rpc.mock.calls[0]).toEqual(mock.rpc.mock.calls[1]);
  expect(mock.rpc.mock.calls[0]).toEqual(["t16_payroll_payment_command", {
    p_operation: operation, p_company: company, p_branch: branch, p_action: "receipt",
    p_data: { ...receipt.data, reference: "test-cash" },
  }]);
});

it.each(["allocate", "reverse"])("accepts exactly 500 characters for a %s reason", action => {
  const base = { batch, payment, revision: 1, document: 81, version: 82, file: 83,
    ...(action === "allocate" && { lines: [{ line, amount: "11.01" }] }) };
  const request = { action, ...scope, operation };
  for (const character of ["a", "م", "𐐀"]) {
    const reason = character.repeat(500);
    expect(payrollSettlementRequest.safeParse({ ...request, data: { ...base, reason } }).success).toBe(true);
    expect(payrollSettlementRequest.safeParse({ ...request, data: { ...base, reason: reason + character } }).success).toBe(false);
  }
});

it("halts inactive accounts and hides rejected RPC details", async () => {
  mock.auth.mockResolvedValueOnce({ isAccountActive: false, profile: {} });
  await expect(savePayrollSettlementCommand(issue)).resolves.toMatchObject({ ok: false, uncertain: false });
  expect(mock.rpc).not.toHaveBeenCalled();
  mock.rpc.mockResolvedValue(read({ batch, state: "prepared", base64: "FINANCIAL_SENTINEL" }));
  await expect(savePayrollSettlementCommand(issue)).resolves.toEqual({ ok: true, receipt: { batch, state: "prepared" } });
  mock.rpc.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "FINANCIAL_SENTINEL" } });
  expect(await savePayrollSettlementCommand(receipt)).toEqual({ ok: false, uncertain: false,
    error: "You need settlement access for this employer and branch." });
});

it("reads only whitelisted evidence labels and exact identities", async () => {
  mock.rpc.mockResolvedValueOnce(read([{ document: 81, version: 82, file: 83, label: "Test bank statement", path: "FINANCIAL_SENTINEL" }]));
  await expect(listPayrollEvidenceOptions({ ...scope, search: "  statement  " })).resolves.toEqual([
    { document: 81, version: 82, file: 83, label: "Test bank statement" },
  ]);
  expect(mock.rpc).toHaveBeenCalledWith("t16_payroll_evidence_options", { p_company: company, p_branch: branch, p_search: "statement" });
});

it("shows bank reconciliation only in authorized scope with permitted actions", async () => {
  mock.rpc.mockResolvedValueOnce(read(scopes));
  const sibling = renderToStaticMarkup(await PayrollSettlementWorkspace({ params: { ...params, branch: "23" } }));
  expect(sibling).toContain("Choose an employer and branch from the available list.");
  expect(mock.rpc).toHaveBeenCalledTimes(1);
  const html = await renderWorkspace(workspace);
  expect(html).toContain("Download WPS file");
  expect(html).toContain("Record employee payment");
  expect(html).toContain("Allocate verified payment");
  expect(html).toContain("Reverse recorded payment");
  expect(html).toContain(`id="payment-${payment}"`);
  expect(html).toContain("500 characters maximum");
  expect(html).toContain("101.02");
  expect(html).toContain("2.00");
  const issueOnly = await renderWorkspace({ ...workspace, access: { issue: true, reconcile: false } });
  expect(issueOnly).toContain("Download WPS file");
  expect(issueOnly).not.toContain("Record employee payment");
  const reconcileOnly = await renderWorkspace({ ...workspace, access: { issue: false, reconcile: true } });
  expect(reconcileOnly).not.toContain("Download WPS file");
  expect(reconcileOnly).toContain("Record employee payment");
});

it("shows handoff before download and preserves the files without exposing raw identifiers", async () => {
  const preparing = { ...workspace, reviews: [{ ...workspace.reviews[0], batch: {
    ...workspace.reviews[0].batch, state: "mixed",
    files: [{ ...batchFile, state: "prepared", actions: ["start-handoff"], downloadable: false }],
    alternate: [{ channel: "zero", state: "prepared", actions: ["authorize-zero"] }],
  } }] };
  const html = await renderWorkspace(preparing);
  expect(html).toContain("Start handoff");
  expect(html).toContain("Authorize zero net settlement");
  expect(html).not.toContain("Download WPS file");
  const parsed = payrollSettlementWorkspace.parse({
    ...workspace, reviews: [{ ...workspace.reviews[0], batch: {
      ...workspace.reviews[0].batch, files: [{ ...batchFile, base64: "PRIVATE_BYTES" }],
      results: [{ ...result, iban: "PRIVATE_BANK_IDENTIFIER", payments: [{ ...result.payments[0], reference: "PRIVATE_REFERENCE" }] }],
    } }],
  });
  expect(JSON.stringify(parsed)).not.toMatch(/PRIVATE_/);
});

it("serves unchanged file bytes only with an exact protected RPC and archive checksum", async () => {
  const bytes = Buffer.from("TEST,fixture\r\n");
  const checksum = createHash("sha256").update(bytes).digest("hex");
  mock.rpc.mockResolvedValueOnce(read({ filename: "payroll.sif", sha256: checksum, base64: bytes.toString("base64") }));
  const response = await download();
  expect(response.status).toBe(200);
  expect(response.headers.get("content-disposition")).toBe('attachment; filename="payroll.sif"');
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
  expect(mock.rpc).toHaveBeenCalledWith("t16_wps_download", { p_file: file });
});

it("denies unauthorized, modified and malformed downloads without leaking bytes", async () => {
  mock.auth.mockResolvedValueOnce({ isAccountActive: false, profile: {} });
  expect((await download()).status).toBe(401);
  expect((await download("wrong-id")).status).toBe(404);
  expect(mock.rpc).not.toHaveBeenCalled();
  mock.rpc.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "FINANCIAL_SENTINEL" } });
  const denied = await download();
  expect(denied.status).toBe(404);
  expect(await denied.text()).not.toContain("FINANCIAL_SENTINEL");
  mock.rpc.mockResolvedValueOnce(read({ filename: "payroll.sif", sha256: digest, base64: Buffer.from("WRONG_BYTES").toString("base64") }));
  const corrupt = await download();
  expect(corrupt.status).toBe(409);
  expect(await corrupt.text()).not.toContain("WRONG_BYTES");
});

it("connects the corrected WPS file to its retained rejected original", async () => {
  const replacementId = "2690990c-600d-49d6-ac0a-e666b1ef83d0";
  const corrected = { ...workspace, reviews: [{ ...workspace.reviews[0], batch: {
    ...workspace.reviews[0].batch,
    files: [
      { ...batchFile, state: "rejected", actions: [], downloadable: false, superseded: true },
      { ...batchFile, id: replacementId, filename: "corrected.sif", state: "prepared", actions: ["start-handoff"], replaces: file, downloadable: false },
    ],
  } }] };
  const html = await renderWorkspace(corrected);
  expect(html).toContain("Replaces payroll.sif");
  expect(html).toContain("Rejected");
  expect(html).toContain("Start handoff");
  expect(html).not.toContain("Download WPS file");
});

it("paginates the exact approved review and resets the cursor between versions", async () => {
  const earlier = { ...workspace.reviews[0], review: batch, number: 1, batch: null };
  const second = { ...workspace, reviews: [...workspace.reviews, earlier], next_after: 87 };
  const html = await renderWorkspace(second, { ...params, review, after: "65" } as typeof params);
  expect(mock.rpc).toHaveBeenLastCalledWith("t16_payroll_workspace_summary", {
    p_company: company, p_branch: branch, p_month: "2026-11-01", p_after: 65, p_selected_review: review,
  });
  expect(html).toContain("Next employees");
  expect(html).toContain("after=87");
  expect(html).toContain("First employees");
  expect(html).toContain("review=" + batch + '"');
});

it("loads bank events only for an explicitly opened, scoped history page", async () => {
  const summarized = { ...workspace, reviews: [{ ...workspace.reviews[0], batch: {
    ...workspace.reviews[0].batch, history: [], history_count: 75,
  } }] };
  mock.rpc.mockResolvedValueOnce(read(scopes)).mockResolvedValueOnce(read(summarized));
  const closed = renderToStaticMarkup(await PayrollSettlementWorkspace({ params }));
  expect(closed).toContain("Bank file history (75)");
  expect(mock.rpc.mock.calls.map(([method]) => method)).toEqual(["t16_payroll_scopes", "t16_payroll_workspace_summary"]);

  mock.rpc.mockResolvedValueOnce(read(scopes)).mockResolvedValueOnce(read(summarized)).mockResolvedValueOnce(read({
    rows: [{ sequence: 66, kind: "accepted", at: "2026-11-19T06:00:00Z", channel: "cheque" }],
    count: 75, next_after: 66,
  }));
  const opened = renderToStaticMarkup(await PayrollSettlementWorkspace({ params: { ...params, bank_history: "65" } }));
  expect(opened).toContain("Bank accepted");
  expect(opened).toContain("bank_history=66");
  expect(mock.rpc).toHaveBeenLastCalledWith("t16_payroll_bank_history", {
    p_company: company, p_branch: branch, p_month: "2026-11-01", p_review: review, p_after: 65,
  });
});
