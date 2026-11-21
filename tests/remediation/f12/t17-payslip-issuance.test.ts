
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { issueRetainedPayslip, type PayslipIssuancePorts } from "@/lib/official-documents/payslip-issuance";

const facts = {
  sequence: 17, report_on: "2026-11-20", company: "Synthetic Employer", branch: "Synthetic branch",
  employee: "Sample Person", employee_code: "EMP-17", month: "2026-11-01", currency: "AED",
  gross: "450.00", deductions: "15.00", net: "435.00", trip_total: "0.00",
  components: [], late_overtime: [], trips: [],
};
const path = "hr/payslips/1/2/00000000-0000-4000-8000-000000000017.pdf";
const identity = { id: "00000000-0000-4000-8000-000000000017", version: "v1", lastModified: "2026-11-20T09:00:00.000Z" };
const bytes = Buffer.from("%PDF-1.7\n" + "A".repeat(180));
const input = { operation: "00000000-0000-4000-8000-000000000017", employee: 17, batch: "00000000-0000-4000-8000-000000000027" };

function ports() {
  return {
    begin: vi.fn(async () => ({ id: 17, finalized: false, can_deliver: false, snapshot: facts, path, renderer: "t17-payslip-v1", proof: null as Awaited<ReturnType<PayslipIssuancePorts["begin"]>>["proof"] })),
    attest: vi.fn(async () => {}),
    finalize: vi.fn(async () => ({ can_deliver: true })),
    render: vi.fn(() => bytes),
    put: vi.fn(async () => {}),
    get: vi.fn(async () => ({ bytes, identity })),
    routeInitial: vi.fn(async () => {}),
  };
}

describe("T17 retained payslip issuance", () => {
  it("verifies the actual retained original before finalization and routing", async () => {
    const io = ports();
    await expect(issueRetainedPayslip(input, io)).resolves.toEqual({ id: 17, routed: true });
    expect(io.put).toHaveBeenCalledWith(path, bytes);
    expect(io.attest).toHaveBeenCalledWith(17, expect.stringMatching(/^[0-9a-f]{64}$/), bytes.length, identity, "t17-payslip-v1");
    expect(io.get.mock.invocationCallOrder[0]).toBeLessThan(io.attest.mock.invocationCallOrder[0]);
    expect(io.finalize.mock.invocationCallOrder[0]).toBeLessThan(io.routeInitial.mock.invocationCallOrder[0]);
  });

  it("recovers an uncertain upload by verifying the already stored bytes", async () => {
    const io = ports();
    io.put.mockRejectedValueOnce(new Error("Timed out"));
    await expect(issueRetainedPayslip(input, io)).resolves.toEqual({ id: 17, routed: true });
    expect(io.put).toHaveBeenCalledTimes(1);
  });

  it("holds mismatched stored bytes without attesting, overwriting or routing", async () => {
    const io = ports();
    io.get.mockResolvedValueOnce({ bytes: Buffer.from("%PDF-1.7\n" + "Z".repeat(180)), identity });
    await expect(issueRetainedPayslip(input, io)).rejects.toThrow(/retained original/i);
    expect(io.put).toHaveBeenCalledTimes(1);
    expect(io.attest).not.toHaveBeenCalled();
    expect(io.routeInitial).not.toHaveBeenCalled();
  });

  it("reverifies an existing bound proof without rendering or uploading again", async () => {
    const io = ports();
    const first = await io.begin();
    io.begin.mockResolvedValueOnce({
      ...first,
      proof: { checksum: createHash("sha256").update(bytes).digest("hex"), size: bytes.length,
        object_id: identity.id, version: identity.version },
    });
    await expect(issueRetainedPayslip(input, io)).resolves.toEqual({ id: 17, routed: true });
    expect(io.render).not.toHaveBeenCalled();
    expect(io.put).not.toHaveBeenCalled();
    expect(io.attest).not.toHaveBeenCalled();
    expect(io.finalize).toHaveBeenCalledOnce();
  });

  it("keeps issued payslips available for an authorised routing retry without re-rendering", async () => {
    const io = ports();
    io.begin.mockResolvedValueOnce({ id: 17, finalized: true, can_deliver: true, snapshot: facts, path, renderer: "t17-payslip-v1", proof: null });
    await expect(issueRetainedPayslip(input, io)).resolves.toEqual({ id: 17, routed: true });
    expect(io.render).not.toHaveBeenCalled();
    expect(io.put).not.toHaveBeenCalled();
    expect(io.routeInitial).toHaveBeenCalledWith(17, input.operation);
  });

  it("leaves an auditable retained issue when automatic routing needs a retry", async () => {
    const io = ports();
    io.routeInitial.mockRejectedValueOnce(new Error("Delivery queue not reachable"));
    await expect(issueRetainedPayslip(input, io)).rejects.toMatchObject({ issued: true });
    expect(io.finalize).toHaveBeenCalledOnce();
    expect(io.put).toHaveBeenCalledOnce();
  });

  it("honours a final denial after storage verification", async () => {
    const io = ports();
    io.finalize.mockRejectedValueOnce(new Error("Payment reversed"));
    await expect(issueRetainedPayslip(input, io)).rejects.toThrow(/payment reversed/i);
    expect(io.routeInitial).not.toHaveBeenCalled();
  });
});
