import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as readOutput } from "@/app/api/integrated-outputs/[kind]/[id]/route";
import { tripOrder } from "@/lib/fleet/operations-contract";
import { renderTripOrderPdf } from "@/server/fleet/trip-order-pdf";
import { operationalOutput, outputPath } from "./operational-output";
import { renderOperationalOutputHtml, renderOperationalOutputPdf } from "./operational-output-renderer";

const { rpc, currentActor } = vi.hoisted(() => ({ rpc: vi.fn(), currentActor: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc }) }));
vi.mock("@/lib/rbac/check", () => ({ getAuthContext: currentActor, canUseApplication: Boolean }));

const snapshot = {
  kind: "timesheet",
  source: 45,
  title: "Customer equipment timesheet",
  reference: "Work interval #45",
  company: "Synthetic Logistics LLC",
  company_ar: "شركة تجريبية",
  branch: "Abu Dhabi Operations",
  revision: "Review #6",
  as_of: "2026-11-20 11:14",
  source_checksum: "0".repeat(64),
  rows: [
    ["Work date", "2026-11-19"],
    ["Recorded minutes", "0"],
    ["Matched minutes", null],
    ["Work location", "<Depot & yard> عبد الله"],
  ],
  evidence: [{
    document: 10, version: 11, file: 12, label: "Reconciled signed customer sheet",
    reference: "SHEET-1", checksum: "a".repeat(64), current: false,
  }],
};

describe("scoped operational output", () => {
  it("validates bounded identifiers and renders the exact accessible evidence", () => {
    const data = operationalOutput.parse(snapshot);
    expect(outputPath(data.kind, data.source)).toBe("/api/integrated-outputs/timesheet/45");
    expect(operationalOutput.safeParse({ ...snapshot, source: 0 }).success).toBe(false);
    const html = renderOperationalOutputHtml(data);
    expect(html).toContain("Synthetic Logistics LLC");
    expect(html).toContain('lang="ar" dir="rtl">شركة تجريبية');
    expect(html).toContain("&lt;Depot &amp; yard&gt;");
    expect(html).toContain("/api/dms/file?fileId=12&amp;disposition=inline");
    expect(html).toContain("Historical version");
    expect(html).toContain("Unrecorded");
    expect(html).toContain("Internal working copy");
    expect(html).not.toContain("<Depot & yard>");
  });

  it("creates deterministic offline PDF bytes with page numbers and Arabic font coverage", () => {
    const data = operationalOutput.parse(snapshot);
    const bytes = renderOperationalOutputPdf(data);
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
    expect(bytes.toString("latin1")).toContain("NotoSansArabic");
    expect(createHash("sha256").update(renderOperationalOutputPdf(data)).digest("hex")).toBe(
      createHash("sha256").update(bytes).digest("hex"),
    );
    const long = renderOperationalOutputPdf({ ...data, rows: Array.from({ length: 90 }, () => ["Note", "Long synthetic record"]) });
    expect([...long.toString("latin1").matchAll(/\/Type \/Page\b/g)].length).toBeGreaterThan(2);
  });

  it("renders an older Trip Order snapshot and a new bilingual issue through the offline renderer", () => {
    const order = tripOrder.parse({
      issue: "FOP-000045-P4", issued: "2026-11-20T10:14:00+04:00", ready: false, can_finalize: true,
      snapshot: {
        order_no: "FOP-000045", subject: "Synthetic operation", reference: "Job 451",
        authorization: "Synthetic LPO", employer: "Synthetic Logistics LLC", branch: "Abu Dhabi Operations",
        customer: null, assignments: [], legs: [{
          sequence: 1, origin: "Depot A", destination: "Depot B", load: "empty", cargo: null,
          pickup_contact: null, pickup_phone: null, delivery_contact: "Dispatch", delivery_phone: "0500000000",
          instructions: null,
        }],
      },
    });
    expect(renderTripOrderPdf(order).subarray(0, 5).toString()).toBe("%PDF-");
    const bilingual = renderTripOrderPdf({
      ...order, snapshot: { ...order.snapshot, employer_ar: "شركة تجريبية",
        legs: [{ ...order.snapshot.legs[0], delivery_address: "Delivery gate 2" }] },
    });
    expect(bilingual.toString("latin1")).toContain("NotoSansArabic");
    expect(createHash("sha256").update(bilingual).digest("hex")).not.toBe(
      createHash("sha256").update(renderTripOrderPdf(order)).digest("hex"),
    );
  });
});

describe("operational print route", () => {
  const params = { params: Promise.resolve({ kind: "timesheet", id: "45" }) };
  const request = new Request("https://example.test/api/integrated-outputs/timesheet/45?format=pdf");

  beforeEach(() => {
    rpc.mockReset();
    currentActor.mockReset().mockResolvedValue({ profile: 12 });
  });

  it("serves scoped printable bytes and rejects record mismatches", async () => {
    rpc.mockResolvedValueOnce({ data: snapshot, error: null });
    const pdf = await readOutput(request, params);
    expect(rpc).toHaveBeenCalledWith("t19_operational_output", { p_kind: "timesheet", p_id: 45 });
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get("Cache-Control")).toBe("private, no-store");
    expect(pdf.headers.get("Content-Type")).toBe("application/pdf");
    expect(Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).toString()).toBe("%PDF-");

    rpc.mockResolvedValueOnce({ data: { ...snapshot, source: 46 }, error: null });
    expect((await readOutput(request, params)).status).toBe(503);
  });

  it("returns a scoped denial or a read failure without returning a packet", async () => {
    currentActor.mockResolvedValueOnce(null);
    expect((await readOutput(request, params)).status).toBe(404);
    expect(rpc).not.toHaveBeenCalled();
    rpc.mockResolvedValueOnce({ data: null, error: null });
    expect((await readOutput(request, params)).status).toBe(404);
    rpc.mockResolvedValueOnce({ data: null, error: { code: "57014" } });
    expect((await readOutput(request, params)).status).toBe(503);
  });
});
