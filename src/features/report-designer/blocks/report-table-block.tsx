"use client";

/**
 * Report Designer — Report Table Block
 * Phase: REPORT DESIGNER.8 — Runtime UAT Closure & Advanced Table Designer
 *
 * A safe tabular data block that renders report preview row data.
 *
 * Security rules:
 *  - dataSource is locked to "report.preview_rows" only
 *  - Column keys are plain identifiers (no HTML, no expressions)
 *  - No dangerouslySetInnerHTML — all values rendered as text nodes
 *  - No external URLs, scripts, or event handler props
 *  - No sensitive field keys (salary, IBAN, bank, etc.)
 */

import type { ComponentConfig } from "@puckeditor/core";
import {
  REPORT_TABLE_MAX_ROWS,
  REPORT_TABLE_DEFAULT_MAX_ROWS,
} from "@/lib/report-designer/constants";

export interface ReportTableColumnRow {
  key: string;
  label: string;
  align: "left" | "center" | "right";
  format: "text" | "date" | "number" | "money" | "badge";
}

export interface ReportTableBlockProps {
  title: string;
  dataSource: "report.preview_rows";
  columns: ReportTableColumnRow[];
  maxRows: number;
  showRowNumbers: boolean;
  showHeader: boolean;
  emptyText: string;
  density: "compact" | "normal";
}

function ReportTableBlockRender({
  title,
  columns,
  maxRows,
  showRowNumbers,
  showHeader,
  emptyText,
  density,
}: ReportTableBlockProps) {
  const rowPad = density === "compact" ? "3px 8px" : "6px 12px";
  const fontSize = density === "compact" ? "0.78rem" : "0.85rem";
  const sampleRowCount = Math.min(maxRows || REPORT_TABLE_DEFAULT_MAX_ROWS, 3);

  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 4, overflow: "hidden" }}>
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
      <div
        style={{
          padding: "6px 10px",
          background: "#eff6ff",
          fontSize: "0.72rem",
          color: "#1d4ed8",
          borderBottom: "1px solid #dbeafe",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span>📊</span>
        <span>
          Table block — shows up to{" "}
          <strong>{maxRows || REPORT_TABLE_DEFAULT_MAX_ROWS}</strong> rows from{" "}
          <code style={{ background: "#dbeafe", padding: "1px 4px", borderRadius: 2 }}>
            report.preview_rows
          </code>{" "}
          (Report Filters test mode)
        </span>
      </div>
      {columns && columns.length > 0 ? (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize }}>
            {showHeader !== false && (
              <thead>
                <tr style={{ background: "#f9fafb" }}>
                  {showRowNumbers && (
                    <th
                      style={{
                        padding: rowPad,
                        textAlign: "center",
                        fontWeight: 600,
                        color: "#9ca3af",
                        borderBottom: "1px solid #e5e7eb",
                        width: 32,
                        fontSize,
                      }}
                    >
                      #
                    </th>
                  )}
                  {columns.map((col) => (
                    <th
                      key={col.key}
                      style={{
                        padding: rowPad,
                        textAlign: col.align ?? "left",
                        fontWeight: 600,
                        color: "#374151",
                        borderBottom: "1px solid #e5e7eb",
                        whiteSpace: "nowrap",
                        fontSize,
                      }}
                    >
                      {col.label || col.key}
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {Array.from({ length: sampleRowCount }).map((_, ri) => (
                <tr
                  key={ri}
                  style={{
                    borderBottom: "1px solid #f3f4f6",
                    background: ri % 2 === 0 ? "#fff" : "#fafafa",
                  }}
                >
                  {showRowNumbers && (
                    <td
                      style={{
                        padding: rowPad,
                        textAlign: "center",
                        color: "#9ca3af",
                        fontSize,
                      }}
                    >
                      {ri + 1}
                    </td>
                  )}
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      style={{
                        padding: rowPad,
                        textAlign: col.align ?? "left",
                        color: "#6b7280",
                        fontStyle: "italic",
                        fontSize,
                      }}
                    >
                      {`[${col.key}]`}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div
          style={{
            padding: "12px 16px",
            color: "#9ca3af",
            fontSize: "0.82rem",
            textAlign: "center",
          }}
        >
          {emptyText || "Add columns using the property panel →"}
        </div>
      )}
    </div>
  );
}

export const reportTableBlockConfig: ComponentConfig<ReportTableBlockProps> = {
  label: "Report Table",
  fields: {
    title: { type: "text", label: "Section Title (optional)" },
    dataSource: {
      type: "select",
      label: "Data Source",
      options: [{ value: "report.preview_rows", label: "Report Preview Rows" }],
    },
    columns: {
      type: "array",
      label: "Columns",
      arrayFields: {
        key: { type: "text", label: "Field Key (from report data)" },
        label: { type: "text", label: "Column Header Label" },
        align: {
          type: "select",
          label: "Alignment",
          options: [
            { value: "left", label: "Left" },
            { value: "center", label: "Center" },
            { value: "right", label: "Right" },
          ],
        },
        format: {
          type: "select",
          label: "Format",
          options: [
            { value: "text", label: "Text" },
            { value: "date", label: "Date" },
            { value: "number", label: "Number" },
            { value: "money", label: "Money" },
            { value: "badge", label: "Badge" },
          ],
        },
      },
      defaultItemProps: {
        key: "column_key",
        label: "Column",
        align: "left",
        format: "text",
      },
      getItemSummary: (item) =>
        item.label ? `${item.label} [${item.key || "?"}]` : "(unnamed column)",
      min: 0,
      max: 20,
    },
    maxRows: {
      type: "number",
      label: `Max Rows (1–${REPORT_TABLE_MAX_ROWS})`,
      min: 1,
      max: REPORT_TABLE_MAX_ROWS,
    },
    showRowNumbers: {
      type: "radio",
      label: "Show Row Numbers",
      options: [
        { value: true, label: "Yes" },
        { value: false, label: "No" },
      ],
    },
    showHeader: {
      type: "radio",
      label: "Show Column Headers",
      options: [
        { value: true, label: "Yes" },
        { value: false, label: "No" },
      ],
    },
    density: {
      type: "select",
      label: "Row Density",
      options: [
        { value: "normal", label: "Normal" },
        { value: "compact", label: "Compact" },
      ],
    },
    emptyText: { type: "text", label: "Empty State Message" },
  },
  defaultProps: {
    title: "Report Data",
    dataSource: "report.preview_rows",
    columns: [
      { key: "name", label: "Name", align: "left", format: "text" },
      { key: "status", label: "Status", align: "left", format: "badge" },
    ],
    maxRows: REPORT_TABLE_DEFAULT_MAX_ROWS,
    showRowNumbers: false,
    showHeader: true,
    emptyText: "No data available",
    density: "normal",
  },
  render: ReportTableBlockRender,
};
