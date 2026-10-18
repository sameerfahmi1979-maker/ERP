import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { generateServerAttachmentByType } from "@/lib/export/server-attachment";
import { generatePDFAttachment } from "@/lib/export/generate-attachment";
import { officialTemplateCatalogue } from "@/lib/official-documents/catalogue";
import type { ERPExportOptions } from "@/lib/export/export-types";

const captured = vi.hoisted(() => ({ document: null as null | { output(type: string): ArrayBuffer; getNumberOfPages(): number } }));
vi.mock("jspdf", async original => {
  const actual = await original<typeof import("jspdf")>();
  const wrapped = new Proxy(actual.default, { construct(target, args) {
    const doc = Reflect.construct(target, args);
    doc.save = () => {};
    captured.document = doc;
    return doc;
  } });
  return { ...actual, default: wrapped };
});
import { exportToPDF } from "@/lib/export/pdf";

const parse = require("pdf-parse/lib/pdf-parse.js") as (bytes: Buffer) => Promise<{ numpages: number; text: string }>;
const evidence = process.env.F08_EVIDENCE_DIR;
function retain(name: string, bytes: Buffer) {
  if (!evidence) return;
  const folder = path.resolve(evidence);
  if (!/^C:\\dev\\/i.test(folder)) throw new Error("Evidence must be under C:/dev.");
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, name), bytes);
}
function options(arabic: boolean, count: number): ERPExportOptions<{ name: string; code: string }> {
  return {
    filename: "F08-SYNTHETIC", title: arabic ? "تقرير اختباري / Synthetic data extract" : "F08 Synthetic data extract",
    subtitle: "NOT AN OFFICIAL DOCUMENT",
    columns: [{ key: "code", header: "Code" }, { key: "name", header: arabic ? "الاسم / Name" : "Name" }],
    data: Array.from({ length: count }, (_, n) => ({ code: `000${n}`, name: arabic ? "موظف اختباري / Synthetic employee" : "Synthetic employee " + n })),
    branding: { companyNameEn: arabic ? "شركة تجريبية / QA Company" : "QA Company", footerTextEn: "F08 SYNTHETIC - NOT ISSUED" },
  };
}
afterEach(() => vi.unstubAllGlobals());

describe("F08 actual non-browser PDF files", () => {
  it.each([[false, 1], [false, 240], [true, 1], [true, 240]] as const)("server PDF arabic=%s rows=%s uses local resources and final page totals", async (arabic, count) => {
    const fetch = vi.fn(() => { throw new Error("Server PDF must not fetch a browser-relative resource"); });
    vi.stubGlobal("fetch", fetch);
    const output = await generateServerAttachmentByType("pdf", options(arabic, count));
    const bytes = Buffer.from(output.base64Content, "base64");
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
    const parsed = await parse(bytes);
    if (count > 100) expect(parsed.numpages).toBeGreaterThan(1);
    else expect(parsed.numpages).toBe(1);
    for (let page = 1; page <= parsed.numpages; page++) expect(parsed.text).toContain(`Page ${page} of ${parsed.numpages}`);
    expect(fetch).not.toHaveBeenCalled();
    retain(`server-${arabic ? "bilingual" : "en"}-${count}.pdf`, bytes);
  }, 25000);

  it("client-export implementation produces a real PDF without invoking a browser/download", async () => {
    // Only the app's font resource response is supplied; no browser exists here.
    const font = fs.readFileSync("public/fonts/noto-sans-arabic-400.ttf");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(font, { headers: { "content-type": "font/ttf" } })));
    const result = await exportToPDF(options(true, 240));
    expect(result.success).toBe(true);
    const bytes = Buffer.from(captured.document!.output("arraybuffer"));
    const parsed = await parse(bytes);
    expect(parsed.numpages).toBeGreaterThan(1);
    for (let page = 1; page <= parsed.numpages; page++) expect(parsed.text).toContain(`Page ${page} of ${parsed.numpages}`);
    retain("client-bilingual-240.pdf", bytes);
  }, 25000);

  it("records the truthful fixed catalogue without treating actual data PDFs as official-template acceptance", () => {
    const catalogue = Buffer.from(JSON.stringify({ catalogue: officialTemplateCatalogue(), scope: "SPECIFICATION_ONLY_NOT_FINAL_OFFICIAL_PDF_ACCEPTANCE" }, null, 2));
    expect(createHash("sha256").update(catalogue).digest("hex")).toHaveLength(64);
    retain("catalogue.json", catalogue);
  });

  it("Arabic export refuses missing fonts rather than silently rendering corrupt fallback glyphs", async () => {
    vi.resetModules();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("missing", { status: 404 })));
    const fresh = await import("@/lib/export/generate-attachment");
    await expect(fresh.generatePDFAttachment(options(true, 1))).rejects.toThrow("Arabic font");
    const font = fs.readFileSync("public/fonts/noto-sans-arabic-400.ttf");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(font)));
    expect((await fresh.generatePDFAttachment(options(true, 1))).contentType).toBe("application/pdf");
  });
});
