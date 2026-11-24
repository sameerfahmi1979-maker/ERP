// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DmsAiIntakeMetadataSection } from "@/features/dms/intake/dms-ai-intake-metadata-section";

const fixture = vi.hoisted(() => ({ locationType: "textarea" }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({
    data: [
      { id: 71, field_code: "cicpa_locations_arabic", field_label_en: "CICPA Location",
        field_type: fixture.locationType, is_required: false, sort_order: 1 },
      { id: 72, field_code: "company_registration_number", field_label_en: "Reverse-side Company Number",
        field_type: "text", is_required: false, sort_order: 2 },
    ],
  }),
}));
vi.mock("@/server/actions/dms/document-metadata-values", () => ({ getMetadataDefinitionsForType: vi.fn() }));
vi.mock("@/features/dms/intake/dms-ai-intake-zero-definitions-notice", () => ({ DmsAiIntakeZeroDefinitionsNotice: () => null }));

afterEach(cleanup);

it.each([
  ["fresh", "textarea"],
  ["saved", "textarea"],
  ["fresh", "text"],
  ["saved", "text"],
] as const)("preserves multiline locations and a separate company number in %s review (%s catalog)", (source, locationType) => {
  fixture.locationType = locationType;
  const cardText = "جميع مواقع الاختبار /موقع التدريب\n/محطة الاختبار";
  const companyNumber = "007353";
  const change = vi.fn();
  const aiFields = { cicpa_locations_arabic: cardText, company_registration_number: companyNumber };
  const savedValues = {
    71: { fieldType: locationType, rawValue: cardText },
    72: { fieldType: "text", rawValue: companyNumber },
  };

  render(<DmsAiIntakeMetadataSection documentTypeId={7} fieldConfidenceJson={null}
    extractedFieldsJson={source === "fresh" ? aiFields : null}
    values={source === "saved" ? savedValues : {}}
    onChange={change} />);

  const location = screen.getByRole<HTMLTextAreaElement>("textbox", { name: "CICPA Location" });
  expect(location.tagName).toBe("TEXTAREA");
  expect(location.dir).toBe("rtl");
  expect(location.lang).toBe("ar");
  expect(location.value).toBe(cardText);
  const reverseNumber = screen.getByRole<HTMLInputElement>("textbox", { name: "Reverse-side Company Number" });
  expect(reverseNumber.type).toBe("text");
  expect(reverseNumber.value).toBe(companyNumber);

  const edited = cardText + "\n/موقع إضافي";
  fireEvent.change(location, { target: { value: edited } });
  expect(change).toHaveBeenLastCalledWith(71, locationType, edited);
  fireEvent.change(reverseNumber, { target: { value: "00048" } });
  expect(change).toHaveBeenLastCalledWith(72, "text", "00048");
});
