import { beforeEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { jsPDF } from "jspdf";
import { pdfTextNeedsVisualOcr } from "../pdf-text-quality";
const render = vi.hoisted(() => vi.fn(async () => [{ fileName: "page-1.png", base64: "synthetic", mimeType: "image/png" }]));
vi.mock("../pdf-to-images", () => ({ convertPdfPagesToImages: render,
  isPdfTextEmpty: (text: string) => text.replace(/\s+/g, " ").trim().length < 30 }));
import { extractFileContent } from "../file-content-extractor";

// Actual generated PDF and the existing redistributable Arabic font; no customer fixture.
function pdf(arabic: boolean) {
  const doc=new jsPDF(); doc.text("ALGT synthetic reference TEST-6101 amount 125.50 AED",10,20);
  doc.addFileToVFS("Arabic.ttf",readFileSync(resolve("public/fonts/noto-sans-arabic-400.ttf")).toString("base64"));
  doc.addFont("Arabic.ttf","Arabic","normal");
  if(arabic) {
    doc.setFont("Arabic");doc.text("اختبار العربية",10,40);
  }
  return Buffer.from(doc.output("arraybuffer"));
}
beforeEach(() => render.mockClear());
it("keeps clean English, numbers and ordinary whitespace on the local path", () => {
  expect(pdfTextNeedsVisualOcr("Company TEST-6101\nInvoice 125.50 AED\t2026")).toBe(false);
});
it.each(["العربية", "English with العربية", "\uFE8D\uFEDF", "broken\uFFFD", "font\uE012", "null\u0000glyph"])("requires visual verification for %s", text => {
  expect(pdfTextNeedsVisualOcr(text)).toBe(true);
});
it("extracts a real synthetic English PDF without rendering", async () => {
  const result = await extractFileContent(pdf(false),"application/pdf","synthetic.pdf");
  expect(result.method).toBe("pdf-text-layer"); expect(result.text).toContain("TEST-6101"); expect(render).not.toHaveBeenCalled();
});
it("rejects a real PDF's Arabic glyph mapping and returns images, not unverified text", async () => {
  const result = await extractFileContent(pdf(true),"application/pdf","synthetic.pdf");
  expect(result).toMatchObject({ text:"", pdfTextRejected:true, method:"pdf-rendered-images" }); expect(result.images).toHaveLength(1);
});
it("supports explicit page-image OCR even for English PDFs", async () => {
  const result=await extractFileContent(pdf(false),"application/pdf","synthetic.pdf",{forcePdfVision:true});
  expect(result.text).toBe(""); expect(result.method).toBe("pdf-rendered-images");
});
it("defers Arabic rendering for a configured raw-PDF OCR provider", async () => {
  const result=await extractFileContent(pdf(true),"application/pdf","synthetic.pdf",{skipPdfPageRendering:true});
  expect(result.method).toBe("pdf-scanned-render-deferred");expect(result.text).toBe("");expect(render).not.toHaveBeenCalled();
});
it("does not publish rejected text if PDF rendering fails", async () => {
  render.mockResolvedValueOnce([]);
  const result=await extractFileContent(pdf(true),"application/pdf","synthetic.pdf");
  expect(result).toMatchObject({hasContent:false,text:"",method:"pdf-no-content"});
});
