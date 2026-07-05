"use client";

/**
 * Report Designer — Key-Value Section Block
 * Phase: REPORT DESIGNER.3 (UX.2 update — grouped field picker)
 * Security: binding paths validated against field registry
 */

import { useState, useCallback } from "react";
import type { ComponentConfig } from "@puckeditor/core";
import { getReportFieldByPath } from "@/lib/report-designer/field-registry/registry-utils";
import { ReportFieldPicker } from "@/features/report-designer/field-picker/report-field-picker";
import { ReportFieldBadge } from "@/features/report-designer/field-picker/report-field-badge";
import { cn } from "@/lib/utils";

export interface KeyValueFieldRow {
  label: string;
  binding: string;
  emphasized: boolean;
  isSubHeader: boolean;
}

export interface KeyValueSectionBlockProps {
  title: string;
  fields: KeyValueFieldRow[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Custom binding selector for Puck array fields
// ─────────────────────────────────────────────────────────────────────────────

function BindingPickerField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const entry = getReportFieldByPath(value);

  const handleInsert = useCallback(
    (path: string) => {
      onChange(path);
      setPickerOpen(false);
    },
    [onChange]
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      {/* Current value display */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          padding: "4px 8px",
          background: "#f9fafb",
          border: "1px solid #e5e7eb",
          borderRadius: "4px",
          minHeight: "32px",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          {entry ? (
            <div>
              <div style={{ fontSize: "0.78rem", fontWeight: 600, color: "#111827", lineHeight: 1.3 }}>
                {entry.fieldLabel}
              </div>
              <div style={{ fontSize: "0.68rem", color: "#6b7280", fontFamily: "monospace", lineHeight: 1.2 }}>
                {"{{" + entry.fieldPath + "}}"}
              </div>
            </div>
          ) : (
            <div style={{ fontSize: "0.78rem", color: value ? "#dc2626" : "#9ca3af" }}>
              {value ? `Unknown: {{${value}}}` : "No field selected"}
            </div>
          )}
        </div>
        {entry && (
          <ReportFieldBadge
            sensitivity={entry.sensitivityLevel}
            isPlanned={entry.isPlanned}
          />
        )}
      </div>

      {/* Toggle picker */}
      <button
        type="button"
        onClick={() => setPickerOpen((v) => !v)}
        style={{
          padding: "4px 8px",
          fontSize: "0.75rem",
          background: pickerOpen ? "#ede9fe" : "#f9fafb",
          border: "1px solid",
          borderColor: pickerOpen ? "#a78bfa" : "#d1d5db",
          borderRadius: "4px",
          color: pickerOpen ? "#5b21b6" : "#374151",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        {pickerOpen ? "▲ Close picker" : "▼ Choose field..."}
      </button>

      {/* Field picker panel */}
      {pickerOpen && (
        <div
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: "4px",
            padding: "8px",
            background: "#fff",
            maxHeight: "240px",
            overflowY: "auto",
          }}
        >
          <ReportFieldPicker onInsert={handleInsert} showLocked />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Block render component
// ─────────────────────────────────────────────────────────────────────────────

function KeyValueSectionBlockRender({ title, fields }: KeyValueSectionBlockProps) {
  return (
    <div
      style={{
        padding: "6px 0",
        border: "1px solid #e5e7eb",
        borderRadius: "4px",
        overflow: "hidden",
      }}
    >
      {title && (
        <div
          style={{
            padding: "6px 12px",
            background: "#f3f4f6",
            fontWeight: 600,
            fontSize: "0.85rem",
            color: "#374151",
            borderBottom: "1px solid #e5e7eb",
          }}
        >
          {title}
        </div>
      )}
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <tbody>
          {fields && fields.length > 0 ? (
            fields.map((field, i) =>
              field.isSubHeader ? (
                <tr key={i}>
                  <td
                    colSpan={2}
                    style={{
                      padding: "5px 12px",
                      background: "#f9fafb",
                      fontWeight: 600,
                      fontSize: "0.8rem",
                      color: "#6b7280",
                      borderBottom: "1px solid #f3f4f6",
                    }}
                  >
                    {field.label}
                  </td>
                </tr>
              ) : (
                <tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}>
                  <td
                    style={{
                      padding: "5px 12px",
                      fontSize: "0.85rem",
                      color: "#6b7280",
                      width: "40%",
                      fontWeight: field.emphasized ? 600 : 400,
                    }}
                  >
                    {field.label || "Label"}
                  </td>
                  <td
                    style={{
                      padding: "5px 12px",
                      fontSize: "0.85rem",
                      color: "#1f2937",
                      fontWeight: field.emphasized ? 600 : 400,
                      fontStyle: "italic",
                    }}
                  >
                    {`{{${field.binding || "select.binding"}}}`}
                  </td>
                </tr>
              )
            )
          ) : (
            <tr>
              <td
                colSpan={2}
                style={{
                  padding: "10px 12px",
                  fontSize: "0.8rem",
                  color: "#9ca3af",
                  textAlign: "center",
                }}
              >
                Add fields using the property panel
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// Silence unused import warning
void cn;

// ─────────────────────────────────────────────────────────────────────────────
// Puck component config
// ─────────────────────────────────────────────────────────────────────────────

export const keyValueSectionBlockConfig: ComponentConfig<KeyValueSectionBlockProps> = {
  label: "Key-Value Section",
  fields: {
    title: { type: "text", label: "Section Title (optional)" },
    fields: {
      type: "array",
      label: "Fields",
      arrayFields: {
        label: { type: "text", label: "Display Label" },
        binding: {
          type: "custom",
          label: "Data Field",
          render: ({ value, onChange }) => (
            <BindingPickerField
              value={value as string}
              onChange={onChange as (v: string) => void}
            />
          ),
        },
        emphasized: {
          type: "radio",
          label: "Emphasize (bold)",
          options: [
            { value: true, label: "Yes" },
            { value: false, label: "No" },
          ],
        },
        isSubHeader: {
          type: "radio",
          label: "Sub-header row",
          options: [
            { value: true, label: "Yes" },
            { value: false, label: "No" },
          ],
        },
      },
      defaultItemProps: {
        label: "Field Label",
        binding: "employee.full_name_en",
        emphasized: false,
        isSubHeader: false,
      },
      getItemSummary: (item) =>
        item.label
          ? `${item.label} → ${item.binding || "(no binding)"}`
          : "(unnamed field)",
      min: 0,
      max: 20,
    },
  },
  defaultProps: {
    title: "Employee Details",
    fields: [
      { label: "Employee Name", binding: "employee.full_name_en", emphasized: false, isSubHeader: false },
      { label: "Designation", binding: "employee.designation", emphasized: false, isSubHeader: false },
      { label: "Department", binding: "employee.department", emphasized: false, isSubHeader: false },
    ],
  },
  render: KeyValueSectionBlockRender,
};
