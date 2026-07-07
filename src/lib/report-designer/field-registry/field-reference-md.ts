/**
 * Report Designer — Field Reference Markdown Generator
 *
 * Generates a structured Markdown file listing every available field
 * with its {{binding.path}} syntax, label, sample value, and description.
 * Intended to be downloaded by template designers and fed to ChatGPT so
 * it can write report content using the correct field placeholders.
 */

import { REPORT_FIELD_REGISTRY } from "./registry";
import type { ReportFieldRegistryEntry } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function sensitivityBadge(entry: ReportFieldRegistryEntry): string {
  switch (entry.sensitivityLevel) {
    case "public":      return "✅ Public";
    case "internal":    return "🔵 Internal";
    case "restricted":  return "🔒 Restricted";
    case "confidential":return "🔴 Confidential";
    default:            return entry.sensitivityLevel;
  }
}

function dataTypeBadge(entry: ReportFieldRegistryEntry): string {
  switch (entry.dataType) {
    case "date":   return "📅 Date";
    case "money":  return "💰 Money";
    case "number": return "🔢 Number";
    case "url":    return "🔗 URL";
    default:       return "📝 Text";
  }
}

function mdEscape(text: string): string {
  // Escape pipe characters so they don't break markdown tables
  return (text ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
}

// ─────────────────────────────────────────────────────────────────────────────
// Generator
// ─────────────────────────────────────────────────────────────────────────────

export function generateFieldReferenceMd(): string {
  const lines: string[] = [];

  lines.push("# ERP Report Designer — Field Reference");
  lines.push("");
  lines.push(
    "Use the `{{field.path}}` syntax as-is inside your report text. " +
    "When the report is generated, each placeholder is replaced with the employee's or company's real data."
  );
  lines.push("");
  lines.push(
    "> **Sensitivity levels:** ✅ Public — \\🔵 Internal — 🔒 Restricted (requires approval to publish) — 🔴 Confidential (restricted + approval)"
  );
  lines.push("");
  lines.push("---");
  lines.push("");

  // Group by module then entity
  const byModule = new Map<string, Map<string, ReportFieldRegistryEntry[]>>();
  for (const entry of REPORT_FIELD_REGISTRY) {
    if (!entry.isActive) continue; // skip inactive/placeholder entries
    if (!byModule.has(entry.moduleCode)) byModule.set(entry.moduleCode, new Map());
    const moduleMap = byModule.get(entry.moduleCode)!;
    if (!moduleMap.has(entry.entityCode)) moduleMap.set(entry.entityCode, []);
    moduleMap.get(entry.entityCode)!.push(entry);
  }

  for (const [, entityMap] of byModule) {
    let moduleHeaderWritten = false;

    for (const [, fields] of entityMap) {
      if (fields.length === 0) continue;

      // Write module + entity header once
      if (!moduleHeaderWritten) {
        lines.push(`## ${fields[0].moduleLabel}`);
        lines.push("");
        moduleHeaderWritten = true;
      }
      lines.push(`### ${fields[0].entityLabel}`);
      lines.push("");

      // Table header
      lines.push("| Field | Binding | Type | Sensitivity | Sample Value | Description |");
      lines.push("|-------|---------|------|-------------|--------------|-------------|");

      for (const entry of fields) {
        const binding = `\`{{${entry.fieldPath}}}\``;
        const sample = entry.isPlanned
          ? "_Coming soon_"
          : mdEscape(entry.sampleValue.replace(/^\[SAMPLE\] ?/, ""));
        const description = mdEscape(entry.description ?? "");
        const planned = entry.isPlanned ? " _(planned)_" : "";
        lines.push(
          `| ${mdEscape(entry.fieldLabel)}${planned} | ${binding} | ${dataTypeBadge(entry)} | ${sensitivityBadge(entry)} | ${sample} | ${description} |`
        );
      }

      lines.push("");
    }
  }

  // ChatGPT usage instructions at the end
  lines.push("---");
  lines.push("");
  lines.push("## How to Use This Reference");
  lines.push("");
  lines.push(
    "Copy the binding codes from the **Binding** column directly into your report text. Examples:"
  );
  lines.push("");
  lines.push("```");
  lines.push("This letter certifies that {{employee.full_name_en}} is employed as");
  lines.push("{{employee.designation}} at {{company.legal_name_en}}.");
  lines.push("Their joining date was {{employee.joining_date}}.");
  lines.push("```");
  lines.push("");
  lines.push("```");
  lines.push("To Whom It May Concern,");
  lines.push("");
  lines.push("We confirm that {{employee.full_name_en}} ({{employee.employee_code}}),");
  lines.push("{{employee.nationality}}, holds the position of {{employee.designation}}");
  lines.push("in the {{employee.department}} department at {{company.legal_name_en}}.");
  lines.push("```");
  lines.push("");
  lines.push(
    "> **Note:** Restricted 🔒 and Confidential 🔴 fields (salary, IBAN, passport, etc.) " +
    "are shown in previews as masked placeholders. They resolve to real values only " +
    "in approved official output."
  );

  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Browser download helper (client-safe)
// ─────────────────────────────────────────────────────────────────────────────

export function downloadFieldReferenceMd(): void {
  const md = generateFieldReferenceMd();
  const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "erp-report-field-reference.md";
  a.click();
  URL.revokeObjectURL(url);
}
