import "server-only";
import type { ERPExportOptions } from "./export-types";
import { generateAttachmentByType, generatePDFAttachment } from "./generate-attachment";
import { getArabicFontBase64 } from "@/lib/official-documents/layout/fonts";

/** Resource adapter only. Does not schedule, queue or send anything. */
export async function generateServerAttachmentByType<T>(type: "csv" | "excel" | "pdf", options: ERPExportOptions<T>) {
  if (type !== "pdf") return generateAttachmentByType(type, options);
  const font = getArabicFontBase64();
  if (!font) throw new Error("The server PDF font is unavailable. Restore the bundled font before generating output.");
  return generatePDFAttachment(options, { arabicFontBase64: font });
}
