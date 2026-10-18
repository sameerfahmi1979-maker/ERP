import { describe, it, expect } from "vitest";
import jsPDF from "jspdf";
import { readValidatedPdfResponse, MAX_RENDERED_PDF_BYTES } from "@/lib/pdf/validate-response";

describe("F08 actual PDF transport contract", () => {
  it("accepts actual parseable PDF bytes unchanged", async () => {
    const doc = new jsPDF(); doc.text("F08 SYNTHETIC", 15, 15);
    const bytes = doc.output("arraybuffer");
    const accepted = await readValidatedPdfResponse(new Response(bytes, { headers: { "content-type": "application/pdf; charset=binary" } }));
    expect(accepted.equals(Buffer.from(bytes))).toBe(true);
  });
  it.each(["text/html", "application/json", ""])("rejects HTTP200 with content type %j", async type => {
    await expect(readValidatedPdfResponse(new Response("<html>not PDF</html>", { headers: { "content-type": type } }))).rejects.toThrow("application/pdf");
  });
  it.each(["", "%PDF-1.7 invalid", "%PDF-1.7\ninvalid\n%%EOF"])("rejects invalid structure %j", async body => {
    await expect(readValidatedPdfResponse(new Response(body, { headers: { "content-type": "application/pdf" } }))).rejects.toThrow();
  });
  it("rejects oversized content-length without buffering its body", async () => {
    await expect(readValidatedPdfResponse(new Response("x", { headers: { "content-type": "application/pdf", "content-length": String(MAX_RENDERED_PDF_BYTES + 1) } }))).rejects.toThrow("size limit");
  });
  it("bounds an undeclared streamed body", async () => {
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(MAX_RENDERED_PDF_BYTES + 1)); controller.close(); } });
    await expect(readValidatedPdfResponse(new Response(stream, { headers: { "content-type": "application/pdf" } }))).rejects.toThrow("size limit");
  });
});
