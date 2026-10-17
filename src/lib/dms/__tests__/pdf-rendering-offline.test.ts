import { expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { jsPDF } from "jspdf";
import type { IDmsAiProvider } from "../ai/types";
import { convertPdfPagesToImages } from "../pdf-to-images";
import { routeOcr } from "../ocr/ocr-router";

function syntheticPdf() {
  const doc = new jsPDF({ format: [100, 120] });
  doc.setFontSize(12);doc.text("SYNTHETIC TEST-6101 125.50 AED", 8, 15);
  doc.addFileToVFS("Arabic.ttf", readFileSync(resolve("public/fonts/noto-sans-arabic-400.ttf")).toString("base64"));
  doc.addFont("Arabic.ttf", "Arabic", "normal");doc.setFont("Arabic");doc.text("اختبار مستند تجريبي", 8, 35);
  return Buffer.from(doc.output("arraybuffer"));
}

it("renders a generated bilingual PDF with actual local PDF.js/font resources and page coverage, without an API", async () => {
  const images = await convertPdfPagesToImages(syntheticPdf());
  expect(images).toHaveLength(1);expect(images[0]).toMatchObject({ pageNumber: 1, totalPages: 1, mimeType: "image/png" });
  const png = Buffer.from(images[0].base64, "base64");
  expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");expect(png.byteLength).toBeGreaterThan(1000);
}, 30000);

it("feeds actual generated PDF page images into the router while leaving the provider transport mocked and Azure unused", async () => {
  const analyze = vi.fn(async () => ({ extraction: { fullTextTranscription: "SYNTHETIC MOCK RESULT" } }));
  const provider = { isConfigured: () => true, modelId: "gpt-6.1-sol", analyze } as unknown as IDmsAiProvider;
  const azure = { isConfigured: () => true, supports: () => true, extractText: vi.fn() };
  const result = await routeOcr({ buffer: syntheticPdf(), mimeType: "application/pdf", fileName: "synthetic-only.pdf",
    featureFlags: { dmsOcr: true, dmsOcrRouter: true, dmsOcrAzure: false, dmsOcrGptVisionFallback: true },
    gptProvider: provider, azureProvider: azure as never });
  expect(result).toMatchObject({ providerCode: "vision", model: "gpt-6.1-sol", sourceKind: "digital" });
  expect(analyze).toHaveBeenCalledOnce();expect(azure.extractText).not.toHaveBeenCalled();
  const input = analyze.mock.calls[0] as unknown as [{ocrText:string;imageFiles:{base64:string}[]}];
  expect(input[0].ocrText).toBe("");expect(input[0].imageFiles).toHaveLength(1);
  expect(Buffer.from(input[0].imageFiles[0].base64,"base64").subarray(0,8).toString("hex")).toBe("89504e470d0a1a0a");
}, 30000);
