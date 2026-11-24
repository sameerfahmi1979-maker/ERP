import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { jsPDF } from "jspdf";
import { expect, it } from "vitest";
import { assessPacketAdmission } from "../../../../../workers/sharepoint-agent/packet-admission.mjs";
import { analyzePhase2Source, type SourcePage } from "../batch";

const require = createRequire(import.meta.url);
type PdfPage = { pageNumber: number; getTextContent(): Promise<{ items: { str: string }[] }> };
const parsePdf = require("pdf-parse/lib/pdf-parse.js") as (
  bytes: Uint8Array,
  options: { max: number; pagerender: (page: PdfPage) => Promise<string> },
) => Promise<{ numpages: number }>;

async function readSyntheticPacket(pageLines: string[][], max = 0) {
  const pdf = new jsPDF();
  for (const [index, lines] of pageLines.entries()) {
    if (index) pdf.addPage();
    pdf.text(lines, 10, 20);
  }
  const bytes = Buffer.from(pdf.output("arraybuffer"));
  const pages: SourcePage[] = [];
  const { numpages } = await parsePdf(new Uint8Array(bytes), {
    max,
    async pagerender(page) {
      const text = (await page.getTextContent()).items.map(item => item.str).join("\n");
      pages.push({ page: page.pageNumber, method: "pdf-embedded-text", text });
      return text;
    },
  });
  const item = { item_id: "synthetic-packet", version: "c:fixture" };
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const sourceReview = analyzePhase2Source({
    sourceId: item.item_id,
    relativePath: "synthetic-packet.pdf",
    sha256,
    status: pages.length === numpages ? "readable" : "partial",
    pages,
  });
  return {
    item, bytes,
    proof: { itemId: item.item_id, sourceVersion: item.version, sourceSha256: sha256,
      pageCount: numpages, inspectedPages: pages.map(page => page.page), sourceReview },
  };
}

const passport = [
  "Passport", "Republic of India", "Holder Name: Example Holder", "Nationality: Pakistan",
  "Passport Number: L898902C3", "Date of Birth: 12/08/1974", "Date of Expiry: 15/04/2012",
  "P<INDERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<", "L898902C36PAK7408122F1204159ZE184226B<<<<<10",
];
const emiratesId = ["Emirates ID", "784-1990-0000001-0"];

it("asks for a corrected identity packet after reading both credentials from the original PDF", async () => {
  const packet = await readSyntheticPacket([passport, emiratesId]);
  expect(packet.proof.inspectedPages).toEqual([1, 2]);
  expect(assessPacketAdmission(packet)).toEqual({
    status: "correction_required", reason: "mixed_passport_and_emirates_id",
  });
});

it("holds a mixed identity PDF when the parser reached only two of its three pages", async () => {
  const packet = await readSyntheticPacket([passport, emiratesId, ["Other page"]], 2);
  expect(packet.proof.sourceReview.reasons).toContain("mixed_passport_and_emirates_id");
  expect(assessPacketAdmission(packet)).toEqual({
    status: "held", reason: "packet_inspection_incomplete",
  });
});

it("returns the original bytes of a standalone passport with a second page", async () => {
  const packet = await readSyntheticPacket([passport, ["Observations"]]);
  expect(packet.proof.sourceReview.profileId).toBe("passport-in");
  const admission = assessPacketAdmission(packet);
  expect(admission.status).toBe("ready");
  expect("bytes" in admission && admission.bytes).toBe(packet.bytes);
});

it("holds a medical packet whose support page was listed without an assessment link", async () => {
  const packet = await readSyntheticPacket([
    ["Supporting blood test", "Patient Name: Another Patient", "Result: follow-up required"],
    ["Medical Fitness Certificate", "Clinic: Top Care Medical Centre", "Patient Name: Example Holder",
      "Work Scope: offshore", "Signed Fitness Conclusion: fit"],
  ]);
  expect(packet.proof.sourceReview.packet).toEqual({ certificatePages: [2], supportingPages: [1] });
  expect(assessPacketAdmission(packet)).toEqual({
    status: "held", reason: "medical_packet_evidence_incomplete",
  });
});
