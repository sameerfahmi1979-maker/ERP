"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  FileText,
  ArrowLeft,
  AlertCircle,
  Bookmark,
  BookmarkCheck,
  ChevronDown,
  Save,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { ReportFilterPanel } from "./report-filter-panel";
import { ReportResultsTable } from "./report-results-table";
import { ReportExportToolbar } from "./report-export-toolbar";
import { ReportPreviewHeader } from "@/components/report-center/report-preview-header";
import { ReportTemplateSelectDialog } from "@/components/report-center/report-template-select-dialog";
import { runReportAction } from "@/server/actions/reports/runner";
import {
  listSavedFilters,
  createSavedFilter,
  deleteSavedFilter,
  setDefaultSavedFilter,
  type SavedFilter,
} from "@/server/actions/reports/saved-filters";
import { getReportFilterLookups } from "@/server/actions/reports/filter-lookups";
import type { FilterLookupMap } from "./report-filter-panel";

const ENTITY_FILTER_KEYS = [
  "employee_id",
  "owner_company_id",
  "department_id",
  "branch_id",
  "designation_id",
  "work_site_id",
] as const;
type FilterLookupKey = (typeof ENTITY_FILTER_KEYS)[number];
import type { ReportRegistryEntry, ReportDataResult, ReportRunResult } from "@/lib/report-center/types";
import { exportToPDF } from "@/lib/export/pdf";
import { exportToExcel } from "@/lib/export/excel";
import { exportToPrint } from "@/lib/export/print";
import type { ExportBrandingContext } from "@/lib/export/export-types";

const LARGE_EXPORT_PDF_THRESHOLD = 500;

interface ReportRunPageProps {
  registryEntry: ReportRegistryEntry;
  initialFilters?: Record<string, string>;
}

export function ReportRunPage({ registryEntry, initialFilters = {} }: ReportRunPageProps) {
  const router = useRouter();
  const [filters, setFilters] = useState<Record<string, string>>(initialFilters);
  const [isRunning, setIsRunning] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [runResult, setRunResult] = useState<ReportRunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [pendingExportFormat, setPendingExportFormat] = useState<"pdf" | "excel" | "csv" | "print" | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | undefined>(undefined);
  const [resolvedBranding, setResolvedBranding] = useState<ExportBrandingContext | undefined>(undefined);

  // Saved filters
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([]);
  const [showSaveFilterDialog, setShowSaveFilterDialog] = useState(false);
  const [saveFilterName, setSaveFilterName] = useState("");
  const [isSavingFilter, setIsSavingFilter] = useState(false);

  // Column visibility
  const [visibleColumns, setVisibleColumns] = useState<string[] | null>(null);

  // Entity lookup data for filter comboboxes
  const [lookups, setLookups] = useState<FilterLookupMap>({});
  const [lookupsLoading, setLookupsLoading] = useState(false);

  const loadSavedFilters = useCallback(async () => {
    const result = await listSavedFilters(registryEntry.report_code);
    if (result.success && result.data) {
      setSavedFilters(result.data);
    }
  }, [registryEntry.report_code]);

  useEffect(() => {
    loadSavedFilters();
  }, [loadSavedFilters]);

  // Load entity lookups for filter fields that need them
  useEffect(() => {
    const schema = registryEntry.filter_schema_json as { filters?: string[] };
    const filterKeys = schema.filters ?? [];
    const entityKeys = ENTITY_FILTER_KEYS.filter((k) =>
      filterKeys.includes(k)
    ) as FilterLookupKey[];
    if (entityKeys.length === 0) return;

    setLookupsLoading(true);
    getReportFilterLookups(entityKeys).then((result) => {
      if (result.success && result.data) {
        const map: FilterLookupMap = {};
        const d = result.data;
        if (d.employees) map.employee_id = d.employees;
        if (d.ownerCompanies) map.owner_company_id = d.ownerCompanies;
        if (d.departments) map.department_id = d.departments;
        if (d.branches) map.branch_id = d.branches;
        if (d.designations) map.designation_id = d.designations;
        if (d.workSites) map.work_site_id = d.workSites;
        setLookups(map);
      }
      setLookupsLoading(false);
    });
  }, [registryEntry.filter_schema_json]);

  const handleFilterChange = useCallback((key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleReset = useCallback(() => {
    setFilters(initialFilters);
    setRunResult(null);
    setError(null);
    setVisibleColumns(null);
  }, [initialFilters]);

  const handleApplySavedFilter = (filter: SavedFilter) => {
    const f = filter.filters_json as Record<string, string>;
    setFilters(f);
    toast.success(`Loaded filter: ${filter.filter_name}`);
  };

  const handleSaveFilter = async () => {
    if (!saveFilterName.trim()) { toast.error("Filter name is required."); return; }
    setIsSavingFilter(true);
    try {
      const result = await createSavedFilter({
        reportCode: registryEntry.report_code,
        filterName: saveFilterName.trim(),
        filtersJson: filters as Record<string, unknown>,
        isDefault: false,
        isShared: false,
      });
      if (result.success) {
        toast.success("Filter saved.");
        setSaveFilterName("");
        setShowSaveFilterDialog(false);
        loadSavedFilters();
      } else {
        toast.error(result.error ?? "Save failed.");
      }
    } finally {
      setIsSavingFilter(false);
    }
  };

  const handleDeleteSavedFilter = async (id: number) => {
    const result = await deleteSavedFilter(id);
    if (result.success) {
      toast.success("Filter deleted.");
      loadSavedFilters();
    } else {
      toast.error(result.error ?? "Delete failed.");
    }
  };

  const handleSetDefaultFilter = async (id: number) => {
    const result = await setDefaultSavedFilter(id);
    if (result.success) {
      toast.success("Default filter set.");
      loadSavedFilters();
    } else {
      toast.error(result.error ?? "Failed.");
    }
  };

  const runReport = async () => {
    setIsRunning(true);
    setError(null);
    try {
      const cleanFilters: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(filters)) {
        if (v !== "" && v !== null && v !== undefined) {
          cleanFilters[k] = v;
        }
      }

      const result = await runReportAction({
        reportCode: registryEntry.report_code,
        outputFormat: "screen",
        filters: cleanFilters,
        templateId: selectedTemplateId,
      });

      if (!result.success) {
        setError(result.error ?? "Failed to run report");
        return;
      }

      const runResult = result.data as ReportRunResult;

      if (runResult.requiresManualTemplateSelection) {
        setPendingExportFormat(null);
        setShowTemplateDialog(true);
        return;
      }

      setRunResult(runResult);
      setVisibleColumns(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setIsRunning(false);
    }
  };

  const handleExport = async (format: "pdf" | "excel" | "csv" | "print") => {
    if (!runResult?.data) {
      toast.error("Run the report first before exporting.");
      return;
    }

    if (runResult.requiresManualTemplateSelection && !selectedTemplateId) {
      setPendingExportFormat(format);
      setShowTemplateDialog(true);
      return;
    }

    const rowCount = runResult.data.rows.length;

    if ((format === "pdf" || format === "print") && rowCount > LARGE_EXPORT_PDF_THRESHOLD) {
      toast.warning(
        `This report has ${rowCount.toLocaleString()} rows. PDF/Print may be slow or incomplete. Consider exporting to Excel or CSV instead.`,
        { duration: 6000 }
      );
    }

    setIsExporting(true);
    try {
      const { columns, rows } = runResult.data;

      const activeColumns = visibleColumns
        ? columns.filter((col) => visibleColumns.includes(col))
        : columns;

      const exportColumns = activeColumns.map((col) => ({
        key: col,
        header: col.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      }));
      const exportData = rows.map((row) =>
        Object.fromEntries(activeColumns.map((col) => [col, row[col] ?? ""]))
      );
      const dateStr = new Date().toISOString().split("T")[0];

      if (format === "excel") {
        exportToExcel({
          title: registryEntry.report_name_en,
          filename: `${registryEntry.report_code}_${dateStr}`,
          columns: exportColumns,
          data: exportData,
          orientation: registryEntry.default_orientation,
          branding: resolvedBranding,
        });
      } else if (format === "pdf") {
        exportToPDF({
          title: registryEntry.report_name_en,
          filename: `${registryEntry.report_code}_${dateStr}`,
          columns: exportColumns,
          data: exportData,
          orientation: registryEntry.default_orientation,
          branding: resolvedBranding,
        });
      } else if (format === "print") {
        exportToPrint({
          title: registryEntry.report_name_en,
          filename: `${registryEntry.report_code}_${dateStr}`,
          columns: exportColumns,
          data: exportData,
          orientation: registryEntry.default_orientation,
          branding: resolvedBranding,
        });
      }
      if (format !== "csv") {
        toast.success(`Exporting ${format.toUpperCase()}...`);
      }
    } catch (err) {
      toast.error("Export failed: " + (err instanceof Error ? err.message : "Unknown error"));
    } finally {
      setIsExporting(false);
    }
  };

  const handleTemplateSelected = (templateId: number) => {
    setSelectedTemplateId(templateId);
    setShowTemplateDialog(false);
    if (pendingExportFormat) {
      handleExport(pendingExportFormat);
    } else {
      runReport();
    }
  };

  // Build filter fields from registry schema
  const filterFields = (() => {
    try {
      const schema = registryEntry.filter_schema_json as { filters?: string[] };
      return (schema.filters ?? []).map((key) => ({
        key,
        label: key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
        type: key.includes("date") || key === "expiry_from" || key === "expiry_to"
          ? ("date" as const)
          : ("text" as const),
      }));
    } catch {
      return [
        { key: "date_from", label: "Date From", type: "date" as const },
        { key: "date_to", label: "Date To", type: "date" as const },
      ];
    }
  })();

  const rowCount = runResult?.data?.rows.length ?? 0;
  const allColumns = runResult?.data?.columns ?? [];

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-muted-foreground"
          onClick={() => router.back()}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg font-semibold text-foreground">{registryEntry.report_name_en}</h1>
            <Badge variant="outline" className="text-[10px] font-mono">{registryEntry.report_code}</Badge>
            <Badge variant="secondary" className="text-[10px]">{registryEntry.report_category}</Badge>
            {registryEntry.sensitive_profile !== "normal" && (
              <Badge variant="destructive" className="text-[10px]">
                <AlertCircle className="h-2.5 w-2.5 mr-1" />
                {registryEntry.sensitive_profile}
              </Badge>
            )}
          </div>
          {registryEntry.description_en && (
            <p className="text-xs text-muted-foreground mt-0.5">{registryEntry.description_en}</p>
          )}
        </div>
      </div>

      {/* Branding preview */}
      {runResult && resolvedBranding && (
        <ReportPreviewHeader
          branding={resolvedBranding}
          reportCode={registryEntry.report_code}
          reportTitle={registryEntry.report_name_en}
        />
      )}

      {/* Filters with saved filter controls */}
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <ReportFilterPanel
            filters={filters}
            onFilterChange={handleFilterChange}
            onRun={runReport}
            onReset={handleReset}
            isLoading={isRunning}
            fields={filterFields}
            lookups={lookups}
            lookupsLoading={lookupsLoading}
          />
        </div>

        {/* Saved filters dropdown */}
        <div className="flex items-center gap-1.5 mb-0 shrink-0">
          {savedFilters.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 h-8 text-sm font-medium hover:bg-muted/50 transition-colors">
                <BookmarkCheck className="h-3.5 w-3.5" />
                Saved Filters
                <ChevronDown className="h-3.5 w-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="text-xs">Saved Filters</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {savedFilters.map((sf) => (
                    <DropdownMenuItem
                      key={sf.id}
                      className="flex items-center justify-between gap-2 cursor-pointer"
                      onClick={() => handleApplySavedFilter(sf)}
                    >
                      <span className="text-sm">
                        {sf.filter_name}
                        {sf.is_default && <span className="ml-1 text-[10px] text-primary">(default)</span>}
                      </span>
                      <div className="flex items-center gap-0.5">
                        <button
                          className="p-0.5 hover:text-primary text-muted-foreground"
                          onClick={(e) => { e.stopPropagation(); handleSetDefaultFilter(sf.id); }}
                          title="Set as default"
                        >
                          <Bookmark className="h-3 w-3" />
                        </button>
                        <button
                          className="p-0.5 hover:text-destructive text-muted-foreground"
                          onClick={(e) => { e.stopPropagation(); handleDeleteSavedFilter(sf.id); }}
                          title="Delete"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setShowSaveFilterDialog(!showSaveFilterDialog)}
            title="Save current filters"
          >
            <Save className="h-3.5 w-3.5" />
            Save
          </Button>
        </div>
      </div>

      {/* Save filter inline form */}
      {showSaveFilterDialog && (
        <div className="flex items-center gap-2 bg-muted/30 border rounded-lg px-3 py-2">
          <Input
            className="h-7 text-sm max-w-xs"
            placeholder="Filter name..."
            value={saveFilterName}
            onChange={(e) => setSaveFilterName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSaveFilter(); if (e.key === "Escape") setShowSaveFilterDialog(false); }}
            autoFocus
          />
          <Button size="sm" className="h-7" onClick={handleSaveFilter} disabled={isSavingFilter}>
            Save
          </Button>
          <Button variant="ghost" size="sm" className="h-7" onClick={() => setShowSaveFilterDialog(false)}>
            Cancel
          </Button>
        </div>
      )}

      {/* Results */}
      {runResult?.data && (
        <>
          {/* Large export warning */}
          {rowCount > LARGE_EXPORT_PDF_THRESHOLD && (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2 flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {rowCount.toLocaleString()} rows returned. PDF and Print may be slow or truncated. Prefer Excel or CSV for large exports.
            </div>
          )}

          {/* Column visibility controls */}
          {allColumns.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground">Columns:</span>
              {allColumns.map((col) => {
                const isVisible = !visibleColumns || visibleColumns.includes(col);
                return (
                  <button
                    key={col}
                    onClick={() => {
                      setVisibleColumns((prev) => {
                        const current = prev ?? allColumns;
                        if (isVisible && current.length <= 1) return current;
                        return isVisible
                          ? current.filter((c) => c !== col)
                          : [...current, col];
                      });
                    }}
                    className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                      isVisible
                        ? "bg-primary/10 border-primary/30 text-primary"
                        : "bg-muted/30 border-input text-muted-foreground"
                    }`}
                  >
                    {col.replace(/_/g, " ")}
                  </button>
                );
              })}
              {visibleColumns && (
                <button
                  className="text-[10px] text-muted-foreground hover:text-foreground underline"
                  onClick={() => setVisibleColumns(null)}
                >
                  Show all
                </button>
              )}
            </div>
          )}

          <ReportExportToolbar
            registryEntry={registryEntry}
            data={runResult.data}
            onExport={handleExport}
            rowCount={rowCount}
            isExporting={isExporting}
            runId={runResult.runId}
            resolvedBranding={resolvedBranding}
          />
          {runResult.redactionSummary?.wasRedacted && (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2 flex items-center gap-2">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {runResult.redactionSummary.totalFieldsRedacted} field(s) were redacted based on your permissions.
            </div>
          )}
          <ReportResultsTable
            data={{
              ...runResult.data,
              columns: visibleColumns
                ? allColumns.filter((c) => visibleColumns.includes(c))
                : allColumns,
              rows: runResult.data.rows,
            }}
            isLoading={false}
          />
        </>
      )}

      {!runResult && !isRunning && !error && (
        <div className="border rounded-lg bg-muted/20 p-12 text-center">
          <FileText className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Set filters above and click <strong>Run Report</strong> to see results.</p>
        </div>
      )}

      {error && (
        <div className="border border-destructive/20 bg-destructive/5 rounded-lg p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      <ReportTemplateSelectDialog
        open={showTemplateDialog}
        onOpenChange={setShowTemplateDialog}
        ownerCompanyIds={[]}
        onSelect={(templateId) => handleTemplateSelected(templateId)}
      />
    </div>
  );
}
