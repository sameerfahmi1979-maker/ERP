import "server-only";

import { createHash } from "node:crypto";
import { rtlText } from "bidi-shaper/jspdf";
import { jsPDF } from "jspdf";
import { getArabicFontBase64 } from "./fonts";

const arabic = /\p{Script=Arabic}/u;
const unicode = /[^\x20-\x7e]/u;

interface PrintPacket {
  title: string;
  company: string;
  companyArabic?: string | null;
  reference: string;
  timestamp: string;
  status: string;
  lines: string[];
}

export function renderOfflinePrintPdf(packet: PrintPacket): Buffer {
  const pdf = new jsPDF({ format: "a4", compress: true, putOnlyUsedFonts: true });
  const events = pdf.internal.events;
  for (const hook of Object.keys(events.getTopics().preProcessText ?? {})) events.unsubscribe(hook);
  pdf.setFileId(createHash("sha256").update(JSON.stringify(packet)).digest("hex").slice(0, 32));
  pdf.setCreationDate("D:20000101000000+00'00'");
  pdf.setProperties({ title: packet.title + " " + packet.reference, subject: packet.status });

  let hasFont = false;
  const margin = 16;
  const maxWidth = 178;
  let y = 0;

  function withFont(text: string, size: number, bold: boolean) {
    if (unicode.test(text)) {
      if (!hasFont) {
        const font = getArabicFontBase64();
        if (!font) throw new Error("The required print font is unavailable.");
        pdf.addFileToVFS("NotoSansArabic.ttf", font);
        pdf.addFont("NotoSansArabic.ttf", "NotoSansArabic", "normal");
        hasFont = true;
      }
      pdf.setFont("NotoSansArabic", "normal");
    } else {
      pdf.setFont("helvetica", bold ? "bold" : "normal");
    }
    pdf.setFontSize(size);
  }

  function write(line: string, size: number, bold = false, wrap = true) {
    const text = line.replace(/\p{Cc}+/gu, " ").trim();
    withFont(text, size, bold);
    const chunks = pdf.splitTextToSize(text, maxWidth) as string[];
    for (const chunk of chunks) {
      if (wrap && y > 272) {
        pdf.addPage();
        header();
      }
      const shaped = arabic.test(chunk) ? rtlText(chunk) : chunk;
      withFont(shaped, size, bold);
      if (unicode.test(shaped)) {
        const current = pdf.getFont() as unknown as { metadata: { characterToGlyph(code: number): number } };
        if (Array.from(shaped).some(character => !current.metadata.characterToGlyph(character.codePointAt(0)!))) {
          throw new Error("The embedded print font cannot render the exact source text.");
        }
      }
      const rightAligned = !!text && /^\p{Script=Arabic}/u.test(text);
      pdf.text(shaped, rightAligned ? margin + maxWidth : margin, y, {
        align: rightAligned ? "right" : "left",
        // RTL shaping already produced the sequence that a left-to-right
        // drawing surface needs. Keep that order through jsPDF's bidi pass.
        isInputVisual: true, isOutputVisual: true, isInputRtl: false, isOutputRtl: false,
      });
      y += size >= 16 ? 8 : 5.5;
    }
  }

  function header() {
    y = 18;
    pdf.setTextColor("#17324D");
    write(packet.company, 12, true, false);
    if (packet.companyArabic) write(packet.companyArabic, 12, false, false);
    write(packet.title, 17, true, false);
    write(packet.reference, 10, true, false);
    write(packet.timestamp, 9, false, false);
    write(packet.status, 10, true, false);
    pdf.setDrawColor("#B7C6D4");
    pdf.line(margin, y, margin + maxWidth, y);
    y += 6;
    pdf.setTextColor("#24374B");
  }

  header();
  for (const line of packet.lines) write(line, 10);
  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    pdf.setPage(page);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor("#4A6278");
    pdf.text(`Page ${page} of ${pages}`, margin + maxWidth, 284, { align: "right" });
  }
  return Buffer.from(pdf.output("arraybuffer"));
}
