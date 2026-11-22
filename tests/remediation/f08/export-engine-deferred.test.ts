import { expect, it, vi } from "vitest";
import type { ERPExportOptions } from "@/lib/export/export-types";

const engineLoads = vi.hoisted(() => ({ excel: 0, pdf: 0 }));
vi.mock("exceljs", async importOriginal => {
  engineLoads.excel++;
  return importOriginal();
});
vi.mock("jspdf", async importOriginal => {
  engineLoads.pdf++;
  return importOriginal();
});

it("loads neither heavy engine for import or CSV, then loads only the requested output engine", async () => {
  const exporter = await import("@/lib/export");
  expect(engineLoads).toEqual({ excel: 0, pdf: 0 });
  const options: ERPExportOptions<{ label: string }> = {
    title: "Synthetic report",
    filename: "synthetic-report",
    columns: [{ key: "label", header: "Label" }],
    data: [{ label: "Synthetic row" }],
  };

  expect(exporter.generateCSVAttachment(options).contentType).toContain("text/csv");
  expect(engineLoads).toEqual({ excel: 0, pdf: 0 });

  const workbook = await exporter.generateExcelAttachment(options);
  expect(workbook.contentType).toContain("spreadsheetml");
  expect(engineLoads).toEqual({ excel: 1, pdf: 0 });

  const pdf = await exporter.generatePDFAttachment(options);
  expect(Buffer.from(pdf.base64Content, "base64").subarray(0, 4).toString()).toBe("%PDF");
  expect(engineLoads).toEqual({ excel: 1, pdf: 1 });
}, 25000);
