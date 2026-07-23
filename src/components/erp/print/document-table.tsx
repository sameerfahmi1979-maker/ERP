/**
 * DocumentTable — print-safe data table with column definitions.
 * Supports bilingual headers, numeric alignment, and wide landscape mode.
 */
import React from "react";

export interface DocumentTableColumn<T = Record<string, unknown>> {
  key: string;
  header: string;
  headerAr?: string;
  /** Cell render function */
  render?: (row: T, index: number) => React.ReactNode;
  align?: "left" | "right" | "center";
  width?: string;
  numeric?: boolean;
}

interface DocumentTableProps<T = Record<string, unknown>> {
  columns: DocumentTableColumn<T>[];
  data: T[];
  /** Show row numbers in first column */
  showRowNumbers?: boolean;
  /** Empty state message */
  emptyMessage?: string;
}

export function DocumentTable<T = Record<string, unknown>>({
  columns,
  data,
  showRowNumbers = false,
  emptyMessage = "No records",
}: DocumentTableProps<T>) {
  return (
    <table className="print-table">
      <thead>
        <tr>
          {showRowNumbers && (
            <th style={{ width: "8mm", textAlign: "center" }}>#</th>
          )}
          {columns.map((col) => (
            <th
              key={col.key}
              style={{
                textAlign: col.align ?? (col.numeric ? "right" : "left"),
                width: col.width,
              }}
            >
              {col.header}
              {col.headerAr && (
                <>
                  {" / "}
                  <span
                    lang="ar"
                    dir="rtl"
                    style={{ fontFamily: "'Noto Sans Arabic', Arial, sans-serif" }}
                  >
                    {col.headerAr}
                  </span>
                </>
              )}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.length === 0 ? (
          <tr>
            <td
              colSpan={columns.length + (showRowNumbers ? 1 : 0)}
              style={{ textAlign: "center", color: "#9e9e9e", fontStyle: "italic", padding: "6mm" }}
            >
              {emptyMessage}
            </td>
          </tr>
        ) : (
          data.map((row, i) => (
            <tr key={i}>
              {showRowNumbers && (
                <td style={{ textAlign: "center", color: "#9e9e9e", fontSize: "8pt" }}>
                  {i + 1}
                </td>
              )}
              {columns.map((col) => {
                const value = col.render
                  ? col.render(row, i)
                  : (row as Record<string, unknown>)[col.key];
                return (
                  <td
                    key={col.key}
                    className={col.numeric ? "cell-numeric" : undefined}
                    style={{ textAlign: col.align ?? (col.numeric ? "right" : "left") }}
                  >
                    {value as React.ReactNode}
                  </td>
                );
              })}
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}
