import "server-only";
import parse from "pdf-parse/lib/pdf-parse.js";

export const MAX_RENDERED_PDF_BYTES = 32 * 1024 * 1024;
export const MAX_RENDERED_PDF_PAGES = 500;

/** Bounded transport read followed by an actual PDF parser, not just HTTP 200. */
export async function readValidatedPdfResponse(response: Response): Promise<Buffer> {
  if (!response.ok) {
    void response.body?.cancel().catch(() => {});
    throw new Error(`[Gotenberg] HTTP ${response.status}`);
  }
  if (response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/pdf") {
    void response.body?.cancel().catch(() => {});
    throw new Error("Renderer did not return an application/pdf document.");
  }
  const length = response.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_RENDERED_PDF_BYTES)) {
    void response.body?.cancel().catch(() => {});
    throw new Error("Rendered PDF exceeds the accepted size limit.");
  }
  if (!response.body) throw new Error("Renderer returned no PDF body.");
  const reader = response.body.getReader();
  let size = 0;
  const parts: Buffer[] = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RENDERED_PDF_BYTES) throw new Error("Rendered PDF exceeds the accepted size limit.");
      parts.push(Buffer.from(value));
    }
  } catch (error) {
    void reader.cancel().catch(() => {});
    throw error;
  } finally { reader.releaseLock(); }
  const buffer = Buffer.concat(parts);
  if (!/^%PDF-(?:1\.[0-9]|2\.0)/.test(buffer.subarray(0, 8).toString("ascii")) ||
      !/%%EOF\s*$/.test(buffer.subarray(-1024).toString("ascii"))) {
    throw new Error("Renderer returned an incomplete or invalid PDF.");
  }
  try {
    // Internal entry avoids pdf-parse's package-entry debug fixture side effect.
    // No page text is extracted or logged by this integrity check.
    const parsed = await parse(buffer, { max: MAX_RENDERED_PDF_PAGES + 1, pagerender: async () => "" });
    if (!Number.isSafeInteger(parsed.numpages) || parsed.numpages < 1 || parsed.numpages > MAX_RENDERED_PDF_PAGES) {
      throw new Error("Invalid page count");
    }
  } catch {
    throw new Error("Rendered PDF could not be validated within the accepted page contract.");
  }
  return buffer;
}
