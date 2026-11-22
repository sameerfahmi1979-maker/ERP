
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { preparePayslipEmail, type PayslipDeliveryClaim } from "@/lib/hr/payroll/payslip-delivery";
import { processOneEmail } from "@/lib/email/queue/worker";
import { renderPayslipPdf } from "@/lib/official-documents/payslip-pdf";
import { createEmailQueueStore } from "@/lib/email/queue/rpc-store";

import { changePayslipDelivery, issuePayslip } from "@/server/actions/hr/payslips";
import { refreshPayrollWorkspace } from "@/server/actions/hr/payroll-workspace-refresh";

const actions = vi.hoisted(() => ({ auth: vi.fn(), rpc: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/rbac/check", async () => ({ ...await import("@/lib/rbac/scope"), getAuthContext: actions.auth }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: actions.rpc }) }));
vi.mock("next/cache", () => ({ revalidatePath: actions.revalidate }));

const bytes = renderPayslipPdf({
  sequence: 22, report_on: "2026-11-20", company: "Synthetic ERP Employer", branch: "Synthetic Branch",
  employee: "Synthetic Employee", employee_code: "TEST-22", month: "2026-11-01", currency: "AED",
  gross: "5000.00", deductions: "10.00", net: "4990.00", trip_total: "50.00",
  components: [
    { category: "basic", kind: "earning", amount: "4950.00" },
    { category: "trip-allowance", kind: "earning", amount: "50.00" },
    { category: "recovery", kind: "deduction", amount: "10.00" },
  ],
  late_overtime: [],
  trips: [{ day: "2026-11-06", reference: "TEST-TRIP", direction: "Yard to site", truck_type: "Flatbed", amount: "50.00" }],
});
const claim: PayslipDeliveryClaim = {
  id: 22, source_module: "HR_PAYSLIP", source_entity_type: "t17_payslip_deliveries",
  lease_owner: "91919000-0000-4000-8000-000000000001",
  lease_token: "91919000-0000-4000-8000-000000000002", attempt_count: 1, max_attempts: 3,
};
const source = {
  recipient: "recipient@example.test", storage_path: "hr/payslips/1/2026-11/private.pdf",
  file_name: "Payslip_2026_11.pdf", size_bytes: bytes.length,
  checksum: createHash("sha256").update(bytes).digest("hex"),
};

describe("T17 retained payslip delivery", () => {
  it("sends one verified original PDF through a synthetic F09 transport", async () => {
    const load = vi.fn().mockResolvedValue(source);
    const download = vi.fn().mockResolvedValue(bytes);
    const send = vi.fn().mockResolvedValue({ kind: "accepted" });
    const finish = vi.fn().mockResolvedValue(true);
    const result = await processOneEmail({
      claim: vi.fn().mockResolvedValue(claim), beginDispatch: vi.fn().mockResolvedValue(true), finish,
    }, async (job, signal) => {
      const message = await preparePayslipEmail(job, signal, { load, download });
      return { ready: true, send: (s, correlation) => send(message, s, correlation) };
    });
    expect(result).toBe("accepted");
    expect(load).toHaveBeenCalledWith(claim);
    expect(download).toHaveBeenCalledWith(source.storage_path);
    expect(send.mock.calls[0][0]).toEqual({
      to: ["recipient@example.test"],
      subject: "Your ERP payslip",
      textBody: "Your payslip is attached.",
      attachments: [{
        filename: source.file_name, contentType: "application/pdf",
        base64Content: bytes.toString("base64"), sizeBytes: bytes.length,
      }],
    });
    expect(finish).toHaveBeenCalledWith(claim, { kind: "accepted" });
  });

  it("cancels a prepared message if final payroll admission changed", async () => {
    const send = vi.fn();
    const rpc = vi.fn(async (method: string) => {
      if (method === "f09_claim_email") return { data: [claim], error: null };
      if (method === "f09_admit_email_dispatch") return { data: null, error: { code: "P1710" } };
      return { data: true, error: null };
    });
    const result = await processOneEmail(createEmailQueueStore({ rpc }, claim.lease_owner),
      async () => ({ ready: true, send, provider: { id: 1, expected: {} } }));
    expect(result).toBe("cancelled");
    expect(send).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenLastCalledWith("f09_finish_provider_email", expect.objectContaining({ p_outcome: "cancelled" }));
  });

  it("refuses when payment, mailbox, sender authority or claim cannot be revalidated", async () => {
    const download = vi.fn();
    await expect(preparePayslipEmail(claim, new AbortController().signal, {
      load: vi.fn().mockResolvedValue(null), download,
    })).rejects.toThrow();
    expect(download).not.toHaveBeenCalled();
  });

  it("refuses tampered output and adjacent queue types", async () => {
    const load = vi.fn().mockResolvedValue(source);
    const download = vi.fn().mockResolvedValue(Buffer.alloc(bytes.length, 1));
    await expect(preparePayslipEmail(claim, new AbortController().signal, { load, download })).rejects.toThrow();
    load.mockClear();
    await expect(preparePayslipEmail({ ...claim, source_module: "HR" }, new AbortController().signal, {
      load, download,
    })).rejects.toThrow();
    expect(load).not.toHaveBeenCalled();
  });
});

it("preserves confirmed issuance and delivery when the payslip invalidation fails", async () => {
  actions.auth.mockReset().mockResolvedValue({ isAccountActive: true, profile: {}, roleAssignments: [] });
  actions.rpc.mockReset();
  actions.revalidate.mockReset().mockImplementationOnce(() => { throw new Error("Payslip refresh failed"); })
    .mockImplementationOnce(() => { throw new Error("Payslip refresh failed"); });
  const operation = "f032161d-3bee-4c28-bc18-5e66e017edda";
  const batch = "6371156a-70da-4044-a9c2-d17f1287678a";
  const delivery = { id: 92, slip: 73, channel: "print", state: "print_ready" };
  actions.rpc.mockResolvedValueOnce({ data: {
    id: 73, finalized: true, can_deliver: true, snapshot: null, renderer: "retained", proof: null, path: null,
  }, error: null }).mockResolvedValue({ data: delivery, error: null });

  const issued = await issuePayslip({ operation, batch, employee: 41 });
  const printOperation = "cbf37a14-a1ce-45d3-9e6a-b8ed3915dbb7";
  const routed = await changePayslipDelivery({
    operation: printOperation, slip: 73, action: "print", data: { reason: "Route to verified print." },
  });
  expect(issued).toEqual({ ok: true, receipt: { id: 73, routed: true }, refreshRequired: true });
  expect(routed).toEqual({ ok: true, receipt: delivery, refreshRequired: true });
  expect(actions.rpc.mock.calls.map(([rpc]) => rpc)).toEqual([
    "t17_issue_prepare", "t17_delivery_command", "t17_delivery_command",
  ]);

  expect(actions.rpc.mock.calls[1][1]).toEqual({ p_operation: operation, p_slip: 73, p_action: "initial", p_data: {} });
  expect(actions.rpc.mock.calls[2][1]).toMatchObject({ p_operation: printOperation, p_slip: 73, p_action: "print" });

  await expect(refreshPayrollWorkspace("payslips")).resolves.toBe(true);
  expect(actions.rpc).toHaveBeenCalledTimes(3);
  expect(actions.revalidate.mock.calls).toEqual(Array.from({ length: 3 }, () => ["/admin/hr/payroll/payslips"]));
});
