import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { jsPDF } from "jspdf";
import { expect, it } from "vitest";
import { createSharePointConnection } from "../../../workers/sharepoint-agent/connection.mjs";
import { assessPacketAdmission } from "../../../workers/sharepoint-agent/packet-admission.mjs";
import { analyzePhase2Source, type SourcePage } from "@/lib/dms/phase2/batch";

const require = createRequire(import.meta.url);
type PdfPage = { pageNumber: number; getTextContent(): Promise<{ items: { str: string }[] }> };
const parsePdf = require("pdf-parse/lib/pdf-parse.js") as (
  bytes: Uint8Array,
  options: { max: number; pagerender: (page: PdfPage) => Promise<string> },
) => Promise<{ numpages: number }>;

function createSyntheticPacket(pageLines: string[][]) {
  const pdf = new jsPDF();
  for (const [index, lines] of pageLines.entries()) {
    if (index) pdf.addPage();
    pdf.text(lines, 10, 20);
  }
  const bytes = Buffer.from(pdf.output("arraybuffer"));
  const item = { item_id: "synthetic-packet", version: "c:fixture" };
  return { item, bytes };
}

async function readOriginal(item: { item_id: string; version: string }, bytes: Buffer, max = 0) {
  const pages: SourcePage[] = [];
  const { numpages } = await parsePdf(new Uint8Array(bytes), {
    max,
    async pagerender(page) {
      const text = (await page.getTextContent()).items.map(item => item.str).join("\n");
      pages.push({ page: page.pageNumber, method: "pdf-embedded-text", text });
      return text;
    },
  });
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const sourceReview = analyzePhase2Source({
    sourceId: item.item_id,
    relativePath: "synthetic-packet.pdf",
    sha256,
    status: pages.length === numpages ? "readable" : "partial",
    pages,
  });
  return {
    pages,
    proof: { itemId: item.item_id, sourceVersion: item.version, sourceSha256: sha256,
      pageCount: numpages, inspectedPages: pages.map(page => page.page), sourceReview },
  };
}

async function readSyntheticPacket(pageLines: string[][], max = 0) {
  const packet = createSyntheticPacket(pageLines);
  return { ...packet, ...await readOriginal(packet.item, packet.bytes, max) };
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

const medicalCertificate = ["Medical Fitness Certificate", "Clinic: Top Care Medical Centre", "Patient Name: Example Holder",
  "Work Scope: offshore", "Signed Fitness Conclusion: fit", "Assessment ID: AS-7634", "Patient ID: PT-0213"];
const bloodTest = ["Blood Test Report", "Assessment ID: AS-7634", "Patient ID: PT-0213", "Test: Complete blood count"];
const audiometry = ["Audiometry Report", "Assessment ID: AS-7634", "Patient ID: PT-0213", "Test: Pure-tone audiometry"];

async function readMedicalTestPacket(packet: ReturnType<typeof createSyntheticPacket>, verifiedFixtureLines: string[][]) {
  const config = { tenantId: "fixture", clientId: "fixture", clientSecret: "fixture", driveId: "drive", sourceId: "source", indexId: "index" };
  const graphItem = `https://graph.microsoft.com/v1.0/drives/${config.driveId}/items/${packet.item.item_id}`;
  const eTag = "approved-metadata";
  const graph = createSharePointConnection(config, { fetch: async input => {
    const url = String(input);
    if (url.startsWith("https://login.microsoftonline.com/")) {
      return Response.json({ access_token: "fixture", token_type: "Bearer", expires_in: 3600 });
    }
    if (url === `${graphItem}/content`) return new Response(new Uint8Array(packet.bytes));
    if (url.startsWith(`${graphItem}?`)) {
      return Response.json({ id: packet.item.item_id, name: "synthetic-packet.pdf", file: { mimeType: "application/pdf" },
        eTag, cTag: "fixture", size: packet.bytes.length, parentReference: { id: config.sourceId, driveId: config.driveId } });
    }
    return new Response(null, { status: 404 });
  } });
  const download = await graph.readDiscoveredPdf(packet.item.item_id, packet.item.version, undefined, eTag);
  const { pages, proof } = await readOriginal(packet.item, download.bytes);
  expect(proof.sourceSha256).toBe(createHash("sha256").update(packet.bytes).digest("hex"));
  expect(proof.sourceReview.packet).toEqual({ certificatePages: [2], supportingPages: [1, 3] });
  // This fixture's lines are authored above and independently checked after PDF parsing.
  // A production text layer alone cannot establish a verified transcription.
  const expectedHeadings = [bloodTest[0], medicalCertificate[0], audiometry[0]];
  const medicalPageEvidence = pages.map(({ page, text }) => {
    const lines = text.split("\n");
    expect(lines).toEqual(verifiedFixtureLines[page - 1]);
    expect(lines[0]).toBe(expectedHeadings[page - 1]);
    return { page, text, method: "verified-transcription", kind: lines[0] === medicalCertificate[0] ? "certificate" : "supporting-test" };
  });
  const admission = assessPacketAdmission({ item: packet.item, bytes: download.bytes, proof: { ...proof, medicalPageEvidence } });
  return { admission, downloadedBytes: download.bytes };
}

it("admits one byte-identical medical original with independently identified supporting tests before and after the certificate", async () => {
  const lines = [bloodTest, medicalCertificate, audiometry];
  const packet = createSyntheticPacket(lines);
  const { admission, downloadedBytes } = await readMedicalTestPacket(packet, lines);
  expect(admission.status).toBe("ready");
  expect("bytes" in admission && admission.bytes).toBe(downloadedBytes);
  expect(downloadedBytes).toEqual(packet.bytes);
  expect("bytes" in admission && createHash("sha256").update(admission.bytes).digest("hex")).toBe(createHash("sha256").update(packet.bytes).digest("hex"));
});

it("holds the whole medical original if one supporting test belongs to another exact assessment", async () => {
  const otherAssessment = audiometry.map(line => line.replace("AS-7634", "AS-7635"));
  const lines = [bloodTest, medicalCertificate, otherAssessment];
  const { admission } = await readMedicalTestPacket(createSyntheticPacket(lines), lines);
  expect(admission).toEqual({ status: "held", reason: "medical_packet_evidence_incomplete" });
});
