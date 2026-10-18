import { describe, it, expect, vi, afterEach } from "vitest";
import ExcelJS from "exceljs";
import { generateCSVAttachment, generateExcelAttachment } from "@/lib/export/generate-attachment";
import { getTypedExportValue, escapeCsvField } from "@/lib/export/format-export-data";
import type { ERPExportOptions } from "@/lib/export/export-types";
import { exportToCSV } from "@/lib/export/csv";
import { exportToExcel } from "@/lib/export/excel";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
function captureDownload() {
  let blob: Blob | null = null;
  vi.spyOn(URL, "createObjectURL").mockImplementation(value => { blob = value as Blob; return "blob:f08-synthetic"; });
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.stubGlobal("document", { createElement: () => ({ style: {}, click() {} }), body: { appendChild() {}, removeChild() {} } });
  return () => blob!;
}

const options: ERPExportOptions<Record<string, unknown>> = {
  title: "Synthetic export", filename: "f08-synthetic",
  columns: [
    { key: "code", header: "Code" }, { key: "phone", header: "Phone" },
    { key: "long", header: "Long ID" }, { key: "text", header: "Text" },
    { key: "number", header: "Number" }, { key: "declared", header: "Declared", valueType: "number" },
  ],
  data: [{ code: "000001", phone: "+971501234567", long: "12345678901234567890", text: "  =SUM(A1)", number: -125.5, declared: "12.5" }],
};

describe("F08 typed spreadsheet and formula contract", () => {
  it.each(["=1+1", "+cmd", "@SUM(A1)", "-cmd", "\t=1", " \r\n+cmd", "\u0000@cmd", "\uFEFF=1"])("neutralizes untrusted formula text %j", value => {
    const encoded = escapeCsvField(value);
    expect(encoded.startsWith("'") || encoded.startsWith('"\'')).toBe(true);
  });
  it("does not turn genuine numeric negatives into formula-safe text", () => {
    expect(escapeCsvField(-12.5)).toBe("-12.5");
    expect(escapeCsvField("-12.5")).toBe("'-12.5");
    expect(escapeCsvField('a,"b"')).toBe('"a,""b"""');
  });
  it("CSV attachment uses the typed shared encoder, including headers", () => {
    const csv = generateCSVAttachment({ ...options, columns: [{ key: "text", header: "=Header" }, ...options.columns] });
    const text = Buffer.from(csv.base64Content, "base64").toString("utf8");
    expect(text).toContain("'=Header");
    expect(text).toContain("000001,'+971501234567,12345678901234567890,'  =SUM(A1),-125.5,12.5");
  });
  it("actual XLSX bytes reopen with strings unchanged and real amounts numeric", async () => {
    const attachment = await generateExcelAttachment(options);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(attachment.base64Content, "base64") as never);
    const sheet = workbook.getWorksheet("Data")!;
    const row = sheet.getRow(sheet.rowCount);
    expect(row.values).toEqual([undefined, "000001", "+971501234567", "12345678901234567890", "  =SUM(A1)", -125.5, 12.5]);
    expect(row.getCell(4).type).toBe(ExcelJS.ValueType.String);
  });
  it("client-export XLSX uses the same typing contract in actual file bytes", async () => {
    const download = captureDownload();
    expect((await exportToExcel(options)).success).toBe(true);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(await download().arrayBuffer()) as never);
    const sheet = workbook.getWorksheet("Data")!;
    expect(sheet.getRow(sheet.rowCount).values).toEqual([undefined, "000001", "+971501234567", "12345678901234567890", "  =SUM(A1)", -125.5, 12.5]);
  });
  it("client-export CSV produces neutralized text and genuine numeric negatives", async () => {
    const download = captureDownload();
    expect(exportToCSV(options).success).toBe(true);
    expect(await download().text()).toContain("000001,'+971501234567,12345678901234567890,'  =SUM(A1),-125.5,12.5");
  });
  it.each([Infinity, NaN, "not-a-number", "", "9007199254740993"])("rejects invalid declared numeric values %j", number => {
    expect(() => getTypedExportValue({ number }, { key: "number", header: "Amount", valueType: "number" })).toThrow();
  });
  it("keeps a numeric source as text when its declared type is text", () => {
    expect(getTypedExportValue({ code: 123 }, { key: "code", header: "Code", valueType: "text" })).toBe("123");
  });
});
