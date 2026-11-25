// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { expect, it } from "vitest";
import {
  DmsMetadataDefinitionFormBody,
  emptyMetadataDefinitionForm,
} from "@/features/dms/admin/dms-metadata-definition-form-body";

function EditingMetadata() {
  const [form, setForm] = useState({
    ...emptyMetadataDefinitionForm, document_type_id: "12", field_label_en: "Original label",
  });
  return <DmsMetadataDefinitionFormBody
    form={form}
    setForm={setForm}
    editing
    documentTypes={[]}
    retainedDocumentType="Synthetic Registration"
  />;
}

it("keeps the saved type read-only while other metadata fields remain editable", () => {
  render(<EditingMetadata />);
  const type = screen.getByRole<HTMLInputElement>("textbox", { name: "Document Type" });
  expect(type.value).toBe("Synthetic Registration");
  expect(type.readOnly).toBe(true);
  expect(screen.queryByRole("combobox", { name: "Document Type" })).toBeNull();
  const label = screen.getByRole<HTMLInputElement>("textbox", { name: "Label (English)" });
  fireEvent.change(label, {
    target: { value: "Changed label" },
  });
  expect(label.value).toBe("Changed label");
});
