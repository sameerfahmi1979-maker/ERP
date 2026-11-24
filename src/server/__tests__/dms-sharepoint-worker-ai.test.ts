import { createHash } from "node:crypto";
import { jsPDF } from "jspdf";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DmsAiOutput, DmsExtractedField } from "@/lib/dms/ai/types";
import { analyzeSharePointWorkPermit } from "@/server/dms-sharepoint-worker-ai";

const mocks = vi.hoisted(() => ({ extract: vi.fn(), candidates: vi.fn(), fields: vi.fn(), provider: vi.fn(), analyze: vi.fn() }));
vi.mock("@/lib/dms/file-content-extractor", () => ({ extractFileContent: mocks.extract }));
vi.mock("@/lib/dms/ai/classification-candidate-builder", () => ({ buildClassificationCandidates: mocks.candidates }));
vi.mock("@/lib/dms/ai/load-metadata-fields", () => ({ loadMetadataFieldsForDocumentType: mocks.fields }));
vi.mock("@/lib/dms/ai/factory", () => ({ getDmsAiProvider: mocks.provider }));

const ocrText = [
  "Ministry of Human Resources and Emiratisation",
  "Electronic Work Permit Information",
  "Card Number", "00001234", "رقم البطاقة", "00001234",
  "Person Name", "LAB TEST", "WORKER", "اسم الشخص", "اسم اختبار",
  "Card Issuance Date", "01/11/2026", "تاريخ الإصدار",
  "Card Expiry Date", "31/10/2028", "تاريخ الانتهاء",
  "Passport Number", "SYN00009999", "Passport Expiry Date", "17/12/2030",
].join("\n");

function createPdf(pageLines: string[][], format: number[] = [210, 297]) {
  const pdf = new jsPDF({ format });
  for (const [index, lines] of pageLines.entries()) {
    if (index) pdf.addPage();
    if (lines.length) pdf.text(lines, 10, 20);
  }
  return Buffer.from(pdf.output("arraybuffer"));
}

const bytes = createPdf([["Synthetic Work Permit", "Passport Number: SYN00009999"]]);
const sha256 = createHash("sha256").update(bytes).digest("hex");
const reserveProviderAttempt = vi.fn();
const input = { client: {} as SupabaseClient, bytes, sha256, filename: "BR1 synthetic permit.pdf", reserveProviderAttempt };

function originalInput(bytes: Buffer) {
  return { ...input, bytes, sha256: createHash("sha256").update(bytes).digest("hex") };
}

function pdfOriginal(pageLines: string[][]) {
  return originalInput(createPdf(pageLines));
}

function densePdfOriginal() {
  const pdf = new jsPDF().setFontSize(2).setLineHeightFactor(0.6);
  pdf.text(Array.from({ length: 510 }, () => "A".repeat(200)), 10, 20);
  return originalInput(Buffer.from(pdf.output("arraybuffer")));
}

function field(fieldCode: string, value: string, sourceSnippet: string): DmsExtractedField {
  return { fieldCode, value, sourceSnippet, confidenceScore: 0.97, confidenceLabel: "high" };
}

function modelOutput(): DmsAiOutput {
  return {
    classification: { suggestedTypeCode: "LABOUR_CARD", suggestedTypeId: null, confidenceScore: 0.97, confidenceLabel: "high", reason: "Work permit", needsHumanReview: true },
    extraction: {
      fields: [field("full_name_en", "LAB TEST WORKER", "Person Name: LAB TEST WORKER"),
        field("labour_card_number", "00001234", "Card Number: 00001234"),
        field("expiry_date", "2028-10-31", "Card Expiry Date: 31/10/2028"),
        field("passport_number", "UNVERIFIED", "Unverified model suggestion")],
      additionalFields: [], suggestedTitle: null, suggestedDescription: "Fixture work permit",
      issueDateSuggestion: "2026-11-01", expiryDateSuggestion: "2028-10-31", fullTextTranscription: null,
    },
    suggestedLinks: [], detectedEntities: [], warnings: [], preparation: { summary: null, tagNames: [], bundle: "single" },
    rawResponse: { untrusted_extra: "excluded" },
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.extract.mockResolvedValue({ text: "", pdfEmbeddedText: ocrText, images: [{ fileName: "page.png", mimeType: "image/png", base64: "c3ludGhldGlj" }], pageCount: 1 });
  mocks.candidates.mockResolvedValue({
    packets: [],
    typeCandidates: [{ typeCode: "LABOUR_CARD", nameEn: "Labour Card", description: null, categoryName: "HR" }],
    scoredTypes: [{ id: 16, type_code: "LABOUR_CARD", name_en: "Labour Card" }],
  });
  mocks.fields.mockResolvedValue(["full_name_en", "labour_card_number", "expiry_date"].map(fieldCode => ({ fieldCode, isRequired: true })));
  mocks.provider.mockResolvedValue({ configId: 3, configCode: "DEFAULT_DMS_CLASSIFIER", configUpdatedAt: "2026-11-23T00:00:00Z", provider: {
    providerCode: "openai", modelId: "gpt-6.1-sol", isConfigured: () => true, analyze: mocks.analyze,
  } });
  mocks.analyze.mockResolvedValue(modelOutput());
});

describe("SharePoint Work Permit AI Fill", () => {
  it.each([
    { kind: "mixed credentials on one page", candidate: pdfOriginal([["Synthetic Work Permit", "P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<", "Emirates ID", "784-1990-0000001-0"]]), message: /separate pdfs/iu },
    { kind: "actual multiple pages", candidate: pdfOriginal([["Synthetic Work Permit"], ["Another page"]]), message: /single.page/iu },
    { kind: "malformed exact bytes", candidate: originalInput(Buffer.from("%PDF-1.7\nsynthetic-verified-input\n%%EOF\n")), message: /original pdf could not be fully read/iu },
    { kind: "truncated exact bytes", candidate: originalInput(bytes.subarray(0, 100)), message: /original pdf could not be fully read/iu },
    { kind: "blank page", candidate: pdfOriginal([[]]), message: /original pdf could not be fully read/iu },
    { kind: "excessive page dimensions", candidate: originalInput(createPdf([["Synthetic Work Permit"]], [900, 900])), message: /original pdf could not be fully read/iu },
    { kind: "excessive embedded text", candidate: densePdfOriginal(), message: /original pdf could not be fully read/iu },
  ])("holds $kind before classifier setup or provider spend", async ({ candidate, message }) => {
    await expect(analyzeSharePointWorkPermit(candidate)).rejects.toThrow(message);
    expect(mocks.extract).not.toHaveBeenCalled();
    expect(mocks.candidates).not.toHaveBeenCalled();
    expect(mocks.provider).not.toHaveBeenCalled();
    expect(reserveProviderAttempt).not.toHaveBeenCalled();
    expect(mocks.analyze).not.toHaveBeenCalled();
  });

  it("waits for a durable reservation for the exact provider configuration and prompt before dispatching", async () => {
    reserveProviderAttempt.mockImplementation(async () => {
      expect(mocks.analyze).not.toHaveBeenCalled();
      throw Error("Operator allowance exhausted");
    });

    await expect(analyzeSharePointWorkPermit(input)).rejects.toThrow("Operator allowance exhausted");
    expect(reserveProviderAttempt).toHaveBeenCalledExactlyOnceWith({
      provider: "openai", model: "gpt-6.1-sol", configId: 3, configUpdatedAt: "2026-11-23T00:00:00Z",
      promptVersion: "v3.7-source-dates",
    });
    expect(mocks.analyze).not.toHaveBeenCalled();
  });

  it("binds three labelled values, dates and canonical officer review to the exact original", async () => {
    const output = await analyzeSharePointWorkPermit(input);
    expect(mocks.analyze).toHaveBeenCalledOnce();
    expect(mocks.analyze).toHaveBeenCalledWith(expect.objectContaining({
      dateEvidenceMode: "source_roles", imageFiles: [expect.objectContaining({ fileName: "page.png" })], ocrText: "",
    }));
    expect(output.job).toMatchObject({ provider: "openai", model: "gpt-6.1-sol", providerConfigId: 3 });
    expect(output.result.extractedFields).toStrictEqual({ full_name_en: "LAB TEST WORKER", labour_card_number: "00001234", expiry_date: "2028-10-31" });
    expect(output.result.fieldConfidence.expiry_date).toMatchObject({ source_page: 1, source_snippet: "Card Expiry Date\n31/10/2028" });
    expect(output.result).toMatchObject({ issueDate: "2026-11-01", expiryDate: "2028-10-31", rawResponse: { preparation: { typeCode: "LABOUR_CARD", sourceHash: sha256, state: "review_required", bundle: "single", split: "not_requested" } } });
    expect(output.result.rawResponse).not.toHaveProperty("untrusted_extra");
  });

  it.each(["ISSUE DATE", "EXPIRY DATE", "ISSUE\nDATE", "EXPIRY\nDATE", "TRANSACTION NO", "ELECTRONIC WORK PERMIT INFORMATION"])(
    "stops the printed holder name before the %s label",
    async caption => {
      const text = ocrText.replace("LAB TEST\nWORKER", `LAB TEST WORKER\n${caption}`);
      mocks.extract.mockResolvedValue({ text, images: [], pageCount: 1 });
      const output = await analyzeSharePointWorkPermit(input);
      expect(output.result.extractedFields.full_name_en).toBe("LAB TEST WORKER");
      expect(output.result.fieldConfidence.full_name_en.source_snippet).toBe("Person Name\nLAB TEST WORKER");
    },
  );

  it.each([
    { form: "detached", printed: "Person Name\nISSUE DATE", value: "ISSUE DATE" },
    { form: "inline", printed: "Person Name: ISSUE DATE", value: "ISSUE DATE" },
    { form: "split", printed: "Person Name\nEXPIRY\nDATE", value: "EXPIRY DATE" },
  ])("rejects an $form caption masquerading as the holder name", async ({ printed, value }) => {
    const text = ocrText.replace("Person Name\nLAB TEST\nWORKER", printed);
    mocks.extract.mockResolvedValue({ text, images: [], pageCount: 1 });
    const model = modelOutput();
    model.extraction.fields[0] = field("full_name_en", value, `Person Name: ${value}`);
    mocks.analyze.mockResolvedValue(model);

    await expect(analyzeSharePointWorkPermit(input)).rejects.toThrow(/source evidence/i);
    expect(mocks.analyze).not.toHaveBeenCalled();
  });

  it.each([
    { form: "detached", printed: "Person Name\nCARD PATEL", value: "CARD PATEL" },
    { form: "inline", printed: "Person Name: CARD PATEL", value: "CARD PATEL" },
    { form: "detached", printed: "Person Name\nPASSPORT PATEL", value: "PASSPORT PATEL" },
  ])("verifies the $form holder name $value", async ({ printed, value }) => {
    const text = ocrText.replace("Person Name\nLAB TEST\nWORKER", printed);
    mocks.extract.mockResolvedValue({ text, images: [], pageCount: 1 });
    const model = modelOutput();
    model.extraction.fields[0] = field("full_name_en", value, `Person Name: ${value}`);
    mocks.analyze.mockResolvedValue(model);

    const output = await analyzeSharePointWorkPermit(input);
    expect(output.result.extractedFields.full_name_en).toBe(value);
    expect(output.result.fieldConfidence.full_name_en.source_snippet).toBe(`Person Name\n${value}`);
  });

  it("rejects a model that reads the passport expiry rather than the card expiry", async () => {
    const output = modelOutput();
    output.extraction.fields[2] = field("expiry_date", "2030-12-17", "Passport Expiry Date: 17/12/2030");
    output.extraction.expiryDateSuggestion = "2030-12-17";
    mocks.analyze.mockResolvedValue(output);
    await expect(analyzeSharePointWorkPermit(input)).rejects.toThrow(/source evidence/i);
  });

  it("refuses competing types, mixed packets and missing model field evidence", async () => {
    const wrong = modelOutput();
    wrong.classification.suggestedTypeCode = "HSE_PERMIT_AR";
    const mixed = modelOutput();
    mixed.preparation = { summary: null, tagNames: [], bundle: "possibly_multiple" };
    const unreadable = modelOutput();
    unreadable.extraction.fields.shift();
    mocks.analyze.mockResolvedValueOnce(wrong).mockResolvedValueOnce(mixed).mockResolvedValueOnce(unreadable);
    await expect(analyzeSharePointWorkPermit(input)).rejects.toThrow(/classification/i);
    await expect(analyzeSharePointWorkPermit(input)).rejects.toThrow(/classification/i);
    await expect(analyzeSharePointWorkPermit(input)).rejects.toThrow(/source evidence/i);
  });

  it("refuses a changed hash, multiple pages and a generic expiry caption before the provider", async () => {
    await expect(analyzeSharePointWorkPermit({ ...input, sha256: "0".repeat(64) })).rejects.toThrow(/fingerprint/i);
    expect(mocks.extract).not.toHaveBeenCalled();
    mocks.extract.mockResolvedValueOnce({ text: ocrText, images: [], pageCount: 2 });
    await expect(analyzeSharePointWorkPermit(input)).rejects.toThrow(/single.page/i);
    mocks.extract.mockResolvedValueOnce({ text: ocrText.replace("Card Expiry Date", "Expiry Date"), images: [], pageCount: 1 });
    await expect(analyzeSharePointWorkPermit(input)).rejects.toThrow(/layout/i);
    expect(reserveProviderAttempt).not.toHaveBeenCalled();
    expect(mocks.analyze).not.toHaveBeenCalled();
  });
});
