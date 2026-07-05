"use client";

/**
 * Report Designer — Test Report Panel
 * Phase: REPORT DESIGNER.5 — Live Report Test Execution with Real ERP Data
 * Phase: REPORT DESIGNER.6 — Safe Renderer and Production Output Integration
 *
 * DESIGNER.6 adds:
 *  - Company Context mode (company selector, no employee required)
 *  - Report Filters mode (report code + filters, no-write preview)
 *
 * Security:
 *  - HTML rendered in <iframe srcDoc={...}> — no dangerouslySetInnerHTML
 *  - No QR token creation, no report run writes, no emails, no mutations
 *  - Sensitive data never appears in binding registry or returned payload
 */

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Building2,
  CheckCircle2,
  ClipboardList,
  FlaskConical,
  Info,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  User,
} from "lucide-react";

import { runReportDesignerTest } from "@/server/actions/reports/report-designer-test";
import {
  searchReportDesignerTestEmployees,
  searchReportDesignerTestCompanies,
  type ReportDesignerTestEmployeeOption,
  type ReportDesignerTestCompanyOption,
} from "@/server/actions/reports/report-designer-test";
import { ERPCombobox } from "@/components/erp/combobox";
import type { ReportDesignerLayoutJson } from "@/lib/report-designer/types";

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

export interface ReportDesignerTestPanelProps {
  templateId: number;
  templateType: string;
  headerLayout: ReportDesignerLayoutJson;
  bodyLayout: ReportDesignerLayoutJson;
  footerLayout: ReportDesignerLayoutJson;
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type TestMode = "sample" | "employee_record" | "company_context" | "report_filters";

// ─────────────────────────────────────────────────────────────────────────────
// Inline style helpers
// ─────────────────────────────────────────────────────────────────────────────

const S = {
  root: {
    display: "flex",
    flexDirection: "column" as const,
    height: "100%",
    overflow: "hidden",
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontSize: "0.875rem",
  },
  safetyBanner: {
    display: "flex",
    alignItems: "flex-start",
    gap: 8,
    padding: "8px 16px",
    background: "#fff7ed",
    borderBottom: "1px solid #fed7aa",
    flexShrink: 0,
    color: "#92400e",
    fontSize: "0.8rem",
  },
  modeSelector: {
    display: "flex",
    gap: 6,
    padding: "8px 16px",
    borderBottom: "1px solid #e2e8f0",
    flexShrink: 0,
    alignItems: "center",
    flexWrap: "wrap" as const,
  },
  modeLabel: {
    fontSize: "0.78rem",
    color: "#6b7280",
    marginRight: 2,
    whiteSpace: "nowrap" as const,
  },
  modeBtn: (active: boolean) => ({
    display: "flex",
    alignItems: "center",
    gap: 5,
    padding: "5px 12px",
    borderRadius: 6,
    border: `1px solid ${active ? "#2563eb" : "#d1d5db"}`,
    background: active ? "#eff6ff" : "#fff",
    color: active ? "#1d4ed8" : "#374151",
    cursor: "pointer",
    fontWeight: active ? 600 : 400,
    fontSize: "0.78rem",
    transition: "all 0.12s",
    whiteSpace: "nowrap" as const,
  }),
  inputSection: {
    padding: "10px 16px",
    borderBottom: "1px solid #e2e8f0",
    flexShrink: 0,
  },
  sectionTitle: {
    fontWeight: 600,
    fontSize: "0.75rem",
    color: "#374151",
    marginBottom: 6,
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
  },
  textInput: {
    width: "100%",
    padding: "7px 10px",
    border: "1px solid #d1d5db",
    borderRadius: 6,
    fontSize: "0.85rem",
    outline: "none",
    boxSizing: "border-box" as const,
  },
  contextCard: (visible: boolean) => ({
    display: visible ? "flex" : "none",
    alignItems: "flex-start",
    gap: 8,
    padding: "8px 16px",
    background: "#f0fdf4",
    borderBottom: "1px solid #bbf7d0",
    flexShrink: 0,
    fontSize: "0.8rem",
    color: "#166534",
  }),
  actionBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
    padding: "8px 16px",
    background: "#f8fafc",
    borderBottom: "1px solid #e2e8f0",
    flexShrink: 0,
  },
  generateBtn: (loading: boolean, disabled: boolean) => ({
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "7px 16px",
    borderRadius: 6,
    border: "1px solid #2563eb",
    background: loading || disabled ? "#eff6ff" : "#2563eb",
    color: loading || disabled ? "#93c5fd" : "#fff",
    cursor: loading || disabled ? "not-allowed" : "pointer",
    fontSize: "0.85rem",
    fontWeight: 500,
    transition: "all 0.15s",
  }),
  warningsBanner: {
    background: "#fffbeb",
    borderBottom: "1px solid #fde68a",
    padding: "8px 16px",
    flexShrink: 0,
  },
  errorBanner: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 16px",
    background: "#fef2f2",
    borderBottom: "1px solid #fecaca",
    color: "#991b1b",
    fontSize: "0.85rem",
    flexShrink: 0,
  },
  contentArea: {
    flex: 1,
    overflow: "auto",
    position: "relative" as const,
  },
  emptyState: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    gap: 12,
    color: "#9ca3af",
    textAlign: "center" as const,
    padding: 32,
  },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function ReportDesignerTestPanel({
  templateId,
  templateType,
  headerLayout,
  bodyLayout,
  footerLayout,
}: ReportDesignerTestPanelProps) {
  const [testMode, setTestMode] = useState<TestMode>("sample");

  // Employee selection
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(null);
  const [selectedEmployeeLabel, setSelectedEmployeeLabel] = useState<string>("");
  const [employeeOptions, setEmployeeOptions] = useState<ReportDesignerTestEmployeeOption[]>([]);
  const [isLoadingEmployees, setIsLoadingEmployees] = useState(false);

  // Company selection
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [selectedCompanyLabel, setSelectedCompanyLabel] = useState<string>("");
  const [companyOptions, setCompanyOptions] = useState<ReportDesignerTestCompanyOption[]>([]);
  const [isLoadingCompanies, setIsLoadingCompanies] = useState(false);

  // Report filters
  const [reportCode, setReportCode] = useState<string>("");

  // Preview state
  const [html, setHtml] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [contextDescription, setContextDescription] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [isPending, startTransition] = useTransition();

  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const companySearchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Employee search ──────────────────────────────────────────────────────

  const handleEmployeeSearch = useCallback((query: string) => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(async () => {
      setIsLoadingEmployees(true);
      const result = await searchReportDesignerTestEmployees(query);
      setIsLoadingEmployees(false);
      if (result.success && result.data) setEmployeeOptions(result.data);
    }, 300);
  }, []);

  useEffect(() => {
    void searchReportDesignerTestEmployees("").then((r) => {
      if (r.success && r.data) setEmployeeOptions(r.data);
    });
  }, []);

  const employeeComboboxOptions = employeeOptions.map((e) => ({
    value: e.id,
    label: `${e.employee_code} — ${e.full_name_en}${e.designation ? ` — ${e.designation}` : ""}`,
  }));

  const handleEmployeeChange = useCallback(
    (val: string | number | null) => {
      if (!val) { setSelectedEmployeeId(null); setSelectedEmployeeLabel(""); return; }
      const id = Number(val);
      setSelectedEmployeeId(id);
      const emp = employeeOptions.find((e) => e.id === id);
      if (emp) setSelectedEmployeeLabel(`${emp.employee_code} — ${emp.full_name_en}${emp.designation ? ` — ${emp.designation}` : ""}`);
    },
    [employeeOptions]
  );

  // ── Company search ───────────────────────────────────────────────────────

  const handleCompanySearch = useCallback((query: string) => {
    if (companySearchDebounceRef.current) clearTimeout(companySearchDebounceRef.current);
    companySearchDebounceRef.current = setTimeout(async () => {
      setIsLoadingCompanies(true);
      const result = await searchReportDesignerTestCompanies(query);
      setIsLoadingCompanies(false);
      if (result.success && result.data) setCompanyOptions(result.data);
    }, 300);
  }, []);

  useEffect(() => {
    void searchReportDesignerTestCompanies("").then((r) => {
      if (r.success && r.data) setCompanyOptions(r.data);
    });
  }, []);

  const companyComboboxOptions = companyOptions.map((c) => ({
    value: c.id,
    label: `${c.company_code} — ${c.legal_name_en}${c.trade_name_en ? ` (${c.trade_name_en})` : ""}`,
  }));

  const handleCompanyChange = useCallback(
    (val: string | number | null) => {
      if (!val) { setSelectedCompanyId(null); setSelectedCompanyLabel(""); return; }
      const id = Number(val);
      setSelectedCompanyId(id);
      const co = companyOptions.find((c) => c.id === id);
      if (co) setSelectedCompanyLabel(`${co.company_code} — ${co.legal_name_en}`);
    },
    [companyOptions]
  );

  // ── Can generate? ────────────────────────────────────────────────────────

  const canGenerate = (() => {
    if (testMode === "sample") return true;
    if (testMode === "employee_record") return selectedEmployeeId !== null;
    if (testMode === "company_context") return selectedCompanyId !== null;
    if (testMode === "report_filters") return reportCode.trim().length >= 2;
    return false;
  })();

  // ── Generate preview ─────────────────────────────────────────────────────

  const handleGeneratePreview = useCallback(() => {
    if (!canGenerate) return;
    setError(null);

    startTransition(async () => {
      const testInput = (() => {
        const base = {
          templateId,
          templateType: templateType as "report" | "letter" | "certificate" | "form" | "external_submission" | "other",
          headerLayoutJson: headerLayout,
          bodyLayoutJson: bodyLayout,
          footerLayoutJson: footerLayout,
        };
        if (testMode === "sample") return { ...base, testMode: "sample" as const };
        if (testMode === "employee_record") return { ...base, testMode: "live_record" as const, employeeId: selectedEmployeeId! };
        if (testMode === "company_context") return { ...base, testMode: "live_record" as const, ownerCompanyId: selectedCompanyId! };
        // report_filters
        return {
          ...base,
          testMode: "report_filters" as const,
          reportCode: reportCode.trim().toUpperCase(),
        };
      })();

      const result = await runReportDesignerTest(testInput);

      if (!result.success || !result.data) {
        setError(result.error ?? "Test preview generation failed");
        setHtml(null);
      } else {
        const testResult = result.data;
        if (!testResult.success || !testResult.previewHtmlFragment) {
          setError(testResult.error ?? "Test preview returned no output");
          setHtml(null);
        } else {
          setHtml(testResult.previewHtmlFragment);
          setWarnings(testResult.validationWarnings ?? []);
          setContextDescription(testResult.context?.contextDescription ?? "");
          setError(null);
        }
      }
      setHasGenerated(true);
    });
  }, [canGenerate, templateId, templateType, testMode, selectedEmployeeId, selectedCompanyId, reportCode, headerLayout, bodyLayout, footerLayout]);

  // ── Derived state ────────────────────────────────────────────────────────

  const hasContext = hasGenerated && !!contextDescription && !isPending;
  const contextLabel = (() => {
    if (testMode === "employee_record" && selectedEmployeeLabel) return selectedEmployeeLabel;
    if (testMode === "company_context" && selectedCompanyLabel) return selectedCompanyLabel;
    if (testMode === "report_filters" && reportCode) return `Report: ${reportCode.toUpperCase()}`;
    return contextDescription;
  })();

  const emptyStateMsg = (() => {
    if (testMode === "sample") return "Click Generate Test Preview to render with placeholder sample values.";
    if (testMode === "employee_record") return selectedEmployeeId ? "Click Generate Test Preview to render with real employee data." : "Select an employee above, then click Generate Test Preview.";
    if (testMode === "company_context") return selectedCompanyId ? "Click Generate Test Preview to render with real company data." : "Select a company above, then click Generate Test Preview.";
    if (testMode === "report_filters") return reportCode.trim().length >= 2 ? `Click Generate Test Preview to preview report ${reportCode.toUpperCase()}.` : "Enter a report code (e.g. HR_EMPLOYEE_LIST), then click Generate.";
    return "Select a test mode to continue.";
  })();

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={S.root}>
      {/* Safety banner */}
      <div style={S.safetyBanner}>
        <ShieldAlert style={{ width: 15, height: 15, flexShrink: 0, marginTop: 1 }} />
        <div>
          <strong>Test Preview Only.</strong> No QR token, no email, no report run, and no official output is created. Layout changes are included automatically.
        </div>
      </div>

      {/* Mode selector */}
      <div style={S.modeSelector}>
        <span style={S.modeLabel}>Test data:</span>
        {(
          [
            { id: "sample", label: "Sample Data", Icon: Search },
            { id: "employee_record", label: "Employee Record", Icon: User },
            { id: "company_context", label: "Company Context", Icon: Building2 },
            { id: "report_filters", label: "Report Filters", Icon: ClipboardList },
          ] as const
        ).map(({ id, label, Icon }) => (
          <button key={id} onClick={() => setTestMode(id)} style={S.modeBtn(testMode === id)} aria-pressed={testMode === id}>
            <Icon style={{ width: 12, height: 12 }} />
            {label}
          </button>
        ))}
      </div>

      {/* Employee selector */}
      {testMode === "employee_record" && (
        <div style={S.inputSection}>
          <div style={S.sectionTitle}>Select employee</div>
          <ERPCombobox
            value={selectedEmployeeId}
            onValueChange={handleEmployeeChange}
            options={employeeComboboxOptions}
            placeholder="Search by code or name…"
            searchPlaceholder="Type 2+ characters to search…"
            loading={isLoadingEmployees}
            allowClear
            filterFn={() => true}
            onSearchQueryChange={handleEmployeeSearch}
            emptyText="No employees found"
            noResultsText="No results — try a different search"
          />
        </div>
      )}

      {/* Company selector */}
      {testMode === "company_context" && (
        <div style={S.inputSection}>
          <div style={S.sectionTitle}>Select company</div>
          <ERPCombobox
            value={selectedCompanyId}
            onValueChange={handleCompanyChange}
            options={companyComboboxOptions}
            placeholder="Search by code or name…"
            searchPlaceholder="Type 2+ characters to search…"
            loading={isLoadingCompanies}
            allowClear
            filterFn={() => true}
            onSearchQueryChange={handleCompanySearch}
            emptyText="No companies found"
            noResultsText="No results — try a different search"
          />
        </div>
      )}

      {/* Report filters */}
      {testMode === "report_filters" && (
        <div style={S.inputSection}>
          <div style={S.sectionTitle}>Report code</div>
          <input
            type="text"
            value={reportCode}
            onChange={(e) => setReportCode(e.target.value)}
            placeholder="e.g. HR_EMPLOYEE_LIST"
            style={S.textInput}
            aria-label="Report code for test"
          />
          <div style={{ fontSize: "0.73rem", color: "#9ca3af", marginTop: 4 }}>
            Enter the report code. A preview of up to 50 rows will be fetched. No run history is recorded.
          </div>
        </div>
      )}

      {/* Context card */}
      <div style={S.contextCard(hasContext)}>
        <CheckCircle2 style={{ width: 14, height: 14, flexShrink: 0, marginTop: 1 }} />
        <div><strong>Test data resolved:</strong> {contextLabel || contextDescription}</div>
      </div>

      {/* Action bar */}
      <div style={S.actionBar}>
        {!canGenerate && testMode !== "sample" && (
          <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "0.75rem", color: "#9ca3af" }}>
            <Info style={{ width: 13, height: 13 }} />
            {testMode === "employee_record" ? "Select an employee" : testMode === "company_context" ? "Select a company" : "Enter a report code"}
          </span>
        )}
        <button onClick={handleGeneratePreview} disabled={isPending || !canGenerate} aria-label={hasGenerated ? "Refresh test preview" : "Generate test preview"} style={S.generateBtn(isPending, !canGenerate)}>
          {isPending ? (
            <><Loader2 style={{ width: 14, height: 14, animation: "spin 1s linear infinite" }} />Running test…</>
          ) : (
            <>{hasGenerated ? <RefreshCw style={{ width: 14, height: 14 }} /> : <FlaskConical style={{ width: 14, height: 14 }} />}{hasGenerated ? "Refresh Test Preview" : "Generate Test Preview"}</>
          )}
        </button>
      </div>

      {/* Warnings */}
      {warnings.length > 0 && html && !isPending && (
        <div style={S.warningsBanner} role="alert">
          <div style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: "0.78rem", color: "#92400e" }}>
            <AlertTriangle style={{ width: 13, height: 13, flexShrink: 0, marginTop: 1 }} />
            <div>{warnings.map((w, i) => <div key={i}>{w}</div>)}</div>
          </div>
        </div>
      )}

      {/* Error */}
      {error && !isPending && (
        <div style={S.errorBanner} role="alert">
          <AlertCircle style={{ width: 16, height: 16, flexShrink: 0 }} />
          {error}
        </div>
      )}

      {/* Content area */}
      <div style={S.contentArea}>
        {!hasGenerated && !isPending && (
          <div style={S.emptyState}>
            <FlaskConical style={{ width: 40, height: 40, opacity: 0.25 }} />
            <div style={{ fontSize: "0.95rem", fontWeight: 500, color: "#6b7280" }}>Test Report Preview</div>
            <div style={{ fontSize: "0.8rem", maxWidth: 380, lineHeight: 1.5 }}>{emptyStateMsg}</div>
          </div>
        )}
        {isPending && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 12 }}>
            <Loader2 style={{ width: 32, height: 32, color: "#2563eb", animation: "spin 1s linear infinite" }} />
            <div style={{ fontSize: "0.85rem", color: "#6b7280" }}>Rendering test preview…</div>
          </div>
        )}
        {html && !isPending && (
          <iframe
            srcDoc={html}
            title="Test Report Preview"
            aria-label="Test Report Preview — Executive Ledger rendered output"
            style={{ width: "100%", height: "100%", border: "none", background: "#e5e7eb", display: "block" }}
            sandbox="allow-same-origin"
          />
        )}
      </div>
    </div>
  );
}
