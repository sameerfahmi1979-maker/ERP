import { installJsPdfShaper } from "bidi-shaper/jspdf";
import { jsPDF } from "jspdf";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { PAYSLIP_RENDERER_VERSION, renderPayslipPdf, type PayslipSnapshot } from "@/lib/official-documents/payslip-pdf";

const snapshot: PayslipSnapshot = {
  sequence: 6114,
  report_on: "2026-11-20",
  company: "Synthetic Alliance Transport LLC",
  branch: "Abu Dhabi Operations",
  employee: "Sameer Sample",
  employee_code: "EMP-09002",
  month: "2026-11-01",
  currency: "AED",
  gross: "5015.25",
  deductions: "100.25",
  net: "4915.00",
  trip_total: "375.25",
  components: [
    { category: "basic", kind: "earning", amount: "4500.00" },
    { category: "fleet-overtime", kind: "earning", amount: "115.00" },
    { category: "trip-allowance", kind: "earning", amount: "400.25" },
    { category: "trip-allowance-adjustment", kind: "deduction", amount: "25.00" },
    { category: "recovery", kind: "deduction", amount: "75.25" },
  ],
  late_overtime: [
    { month: "2026-09-01", hours: "2.25", amount: "50.00" },
    { month: "2026-10-01", hours: "3.50", amount: "65.00" },
  ],
  trips: [
    { day: "2026-09-28", reference: "TRIP-602/A", direction: "Mussafah to Ruwais", truck_type: "Flatbed", amount: "240.25" },
    { day: "2026-10-29", reference: "TRIP-615/B", direction: "Ruwais to Al Ain", truck_type: "Tanker", amount: "160.00" },
    { day: "2026-10-29", reference: "TRIP-615/B correction", direction: "Ruwais to Al Ain", truck_type: "Tanker", amount: "-25.00" },
  ],
};

const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const pageCount = (bytes: Buffer) => [...bytes.toString("latin1").matchAll(/\/Type \/Page\b/g)].length;

describe("offline official payslip PDF", () => {
  it("retains byte-identical approved output on retry and starts trips on the second page", () => {
    const first = renderPayslipPdf(snapshot);
    expect(PAYSLIP_RENDERER_VERSION).toMatch(/^t17-payslip-v\d+$/);
    expect(first.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pageCount(first)).toBe(2);
    expect(hash(renderPayslipPdf({ ...snapshot }))).toEqual(hash(first));
    expect(hash(renderPayslipPdf({ ...snapshot, sequence: 6115 }))).not.toEqual(hash(first));
  });

  it("retains at least three pages for an allowance history that exceeds the detail page", () => {
    const trips = Array.from({ length: 55 }, (_, index) => ({
      ...snapshot.trips[0], reference: "TRIP-" + String(index + 1).padStart(3, "0"),
      direction: "Abu Dhabi Logistics Terminal to Ruwais Industrial Loading Area",
      amount: "7.00",
    }));
    const long = {
      ...snapshot, gross: "5000.00", deductions: "75.25", net: "4924.75", trip_total: "385.00", trips,
      components: [
        snapshot.components[0], snapshot.components[1],
        { ...snapshot.components[2], amount: "385.00" }, snapshot.components[4],
      ],
    };
    expect(pageCount(renderPayslipPdf(long))).toBeGreaterThanOrEqual(3);
  });

  it("keeps a single first page when there are no trip payments or late overtime", () => {
    const noTrips = {
      ...snapshot, gross: "4500.00", deductions: "0.00", net: "4500.00",
      trip_total: "0.00", components: [snapshot.components[0]], trips: [], late_overtime: [],
    };
    expect(pageCount(renderPayslipPdf(noTrips))).toBe(1);
  });

  it("rejects inconsistent signed trip totals and unbalanced approved payroll", () => {
    expect(() => renderPayslipPdf({ ...snapshot, trip_total: "400.25" })).toThrow(/trip allowance/i);
    expect(() => renderPayslipPdf({ ...snapshot, net: "4900.00" })).toThrow(/payroll totals/i);
    expect(() => renderPayslipPdf({ ...snapshot, gross: "4.99e3" })).toThrow(/approved amount/i);
  });

  it("retains literal large approved amounts and an Arabic employee name", () => {
    const large: PayslipSnapshot = {
      ...snapshot, employee: "سمير فهمي", gross: "90071992547409.99", deductions: "0.00",
      net: "90071992547409.99", trip_total: "0.00", trips: [], late_overtime: [],
      components: [{ category: "basic", kind: "earning", amount: "90071992547409.99" }],
    };
    expect(pageCount(renderPayslipPdf(large))).toBe(1);
    const expected = hash(renderPayslipPdf(large));
    const api = jsPDF.API as Parameters<typeof installJsPdfShaper>[0];
    installJsPdfShaper(api);
    try {
      expect(hash(renderPayslipPdf(large))).toBe(expected);
    } finally {
      api.events.pop();
    }
  });
});
