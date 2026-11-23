// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DmsAiIntakeMetadataSection } from "@/features/dms/intake/dms-ai-intake-metadata-section";
import { MetadataField } from "@/features/dms/documents/sections/dms-document-metadata-section";
import { mapMetadataDefinitionRow, type DmsMetadataDefinitionBase } from "@/lib/dms/metadata/metadata-definition-shared";
import { validateMetadataEntry } from "@/lib/dms/metadata/review-validation";
import { savedIntakeValuesSchema } from "@/lib/dms/saved-intake";

const fixture = vi.hoisted(() => ({ definitions: [] as DmsMetadataDefinitionBase[] }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: fixture.definitions }),
  useQueryClient: vi.fn(),
}));
vi.mock("@/server/actions/dms/document-metadata-values", () => ({ getMetadataDefinitionsForType: vi.fn(), saveDmsDocumentMetadataValues: vi.fn() }));
vi.mock("@/features/dms/intake/dms-ai-intake-zero-definitions-notice", () => ({ DmsAiIntakeZeroDefinitionsNotice: () => null }));
vi.mock("@/features/dms/documents/section-activity", () => ({ useDmsSectionQuery: vi.fn() }));
vi.mock("@/features/dms/documents/section-read", () => ({ readDmsSection: vi.fn() }));
vi.mock("@/features/dms/documents/section-read-boundary", () => ({ ERPChildDialogForm: () => null }));

afterEach(cleanup);

const makeDefinition = (id: number, code: string, label: string, type: string, options: unknown = null) =>
  mapMetadataDefinitionRow({ id, document_type_id: 7, field_code: code, field_label_en: label, field_type: type, options_json: options, sort_order: id });

const optionDefinitions = [
  { name: "registered label map", options: { values: ["completed"], labels: { completed: "Completed" } }, label: "Completed" },
  { name: "labeled option objects", options: [{ value: "completed", label: "Completed" }], label: "Completed" },
  { name: "legacy wrapped strings", options: { values: ["completed"] }, label: "completed" },
  { name: "legacy flat strings", options: ["completed"], label: "completed" },
];

describe("intake metadata field types", () => {
  it.each(["fresh", "saved"] as const)("keeps select, date and text values keyed by definition ID in %s review", mode => {
    const outcome = makeDefinition(15, "printed_outcome", "Completion Outcome", "select", optionDefinitions[0].options);
    const issueDate = makeDefinition(9, "issue_date", "Issue Date", "date");
    const number = makeDefinition(6, "certificate_number", "Certificate Number", "text");
    fixture.definitions = [outcome, issueDate, number];

    const extracted = { printed_outcome: "completed", issue_date: "2026-01-02", certificate_number: "0007353" };
    const values = {
      15: { fieldType: "select", rawValue: "completed" },
      9: { fieldType: "date", rawValue: "2026-01-02" },
      6: { fieldType: "text", rawValue: "0007353" },
    };
    const seed = vi.fn();
    const change = vi.fn();
    render(<DmsAiIntakeMetadataSection documentTypeId={7} fieldConfidenceJson={null}
      extractedFieldsJson={mode === "fresh" ? extracted : null}
      values={mode === "saved" ? values : {}}
      onChange={change} onBulkSeed={seed} />);

    const choice = screen.getByRole<HTMLSelectElement>("combobox", { name: "Completion Outcome" });
    expect(choice.value).toBe("completed");
    expect(choice.selectedOptions[0]?.textContent).toBe("Completed");
    fireEvent.change(choice, { target: { value: "" } });
    expect(change).toHaveBeenLastCalledWith(15, "select", "");

    const date = screen.getByLabelText<HTMLInputElement>("Issue Date");
    expect(date.type).toBe("date");
    expect(date.value).toBe("2026-01-02");
    fireEvent.change(date, { target: { value: "2026-02-03" } });
    expect(change).toHaveBeenLastCalledWith(9, "date", "2026-02-03");

    const identifier = screen.getByRole<HTMLInputElement>("textbox", { name: "Certificate Number" });
    expect(identifier.type).toBe("text");
    expect(identifier.value).toBe("0007353");

    if (mode === "fresh") expect(seed).toHaveBeenCalledWith(values);
  });

  it("retains optional induction date and the separately supplied date when present", () => {
    const induction = makeDefinition(2, "induction_date", "Induction Date", "date");
    fixture.definitions = [induction];
    const change = vi.fn();
    render(<DmsAiIntakeMetadataSection documentTypeId={7} fieldConfidenceJson={null}
      extractedFieldsJson={null} values={{}} onChange={change} />);
    const date = screen.getByLabelText<HTMLInputElement>("Induction Date");
    expect(date.required).toBe(false);
    expect(date.value).toBe("");
    fireEvent.change(date, { target: { value: "2026-06-24" } });
    expect(change).toHaveBeenCalledWith(2, "date", "2026-06-24");
  });

  it("retains exact CICPA whitespace and zero-padded company number in the saved payload", () => {
    const cardText = "جميع مواقع الاختبار /موقع التدريب\n/محطة الاختبار\n/موقع إضافي";
    const values = savedIntakeValuesSchema.parse({
      title: "CICPA pass", standardFileName: "CICPA.pdf", documentTypeId: 7, categoryId: null,
      description: "", issueDate: "", expiryDate: "", confidentialityLevel: "internal",
      owningCompanyId: null, owningBranchId: null, tagIds: [],
      metadataValues: {
        315: { fieldType: "textarea", rawValue: cardText },
        316: { fieldType: "text", rawValue: "007353" },
      },
    });
    expect(values.metadataValues["315"].rawValue).toBe(cardText);
    expect(values.metadataValues["316"].rawValue).toBe("007353");
  });
});

describe("document catalog choices", () => {
  it.each(optionDefinitions)("keeps $name compatible with validation and standalone metadata review", ({ options, label }) => {
    const outcome = makeDefinition(15, "printed_outcome", "Completion Outcome", "select", options);
    expect(validateMetadataEntry(outcome, "completed")).toBeNull();
    expect(validateMetadataEntry(outcome, "reviewed")).toBe("Choose an available option.");
    render(<MetadataField id="completion" def={outcome} value="completed" onChange={vi.fn()} />);
    const choice = screen.getByRole("combobox", { name: "Completion Outcome" });
    expect(choice.textContent).toContain(label);
  });
});
