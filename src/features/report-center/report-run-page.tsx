"use client";
import {reportCriteriaIdentity} from "@/lib/reads/report-criteria-schema";
import {useReportViewState} from "./use-report-view-state";
import {useReportSavedFilters} from "@/hooks/use-report-saved-filters";
import type {ReportSavedFilterRow} from "@/lib/reads/report-saved-filters-schema";
import { usePersistentUiState } from "@/hooks/use-persistent-ui-state";
import { useWorkspaceFormOwner } from "@/hooks/use-workspace-form-owner";

import { ReportPreviewHeader } from "@/components/report-center/report-preview-header";
import { ReportTemplateSelectDialog } from "@/components/report-center/report-template-select-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { exportToExcel } from "@/lib/export/excel";
import { exportToPDF } from "@/lib/export/pdf";
import { exportToPrint } from "@/lib/export/print";
import type { ReportRegistryEntry, ReportRunResult } from "@/lib/report-center/types";
import type {AuthContext} from "@/lib/rbac/check";
import {useReportCriteria} from "@/hooks/use-report-criteria";
import { runReportAction } from "@/server/actions/reports/runner";
import {
  createSavedFilter,
  deleteSavedFilter,
  setDefaultSavedFilter,
} from "@/server/actions/reports/saved-filters";
import { resolveTemplatePreview } from "@/server/actions/reports/templates";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Bookmark,
  BookmarkCheck,
  ChevronDown,
  FileText,
  Save,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ReportExportToolbar } from "./report-export-toolbar";
import { ReportFilterPanel } from "./report-filter-panel";
import { ReportResultsTable } from "./report-results-table";

const ENTITY_FILTER_KEYS = [
  "employee_id",
  "owner_company_id",
  "department_id",
  "branch_id",
  "designation_id",
  "work_site_id",
] as const;
type FilterLookupKey = (typeof ENTITY_FILTER_KEYS)[number];

const LARGE_EXPORT_PDF_THRESHOLD = 500;

interface ReportRunPageProps {
  authContext: AuthContext;
  registryEntry: ReportRegistryEntry;
  initialFilters?: Record<string, string>;
}

export function ReportRunPage({ authContext, registryEntry, initialFilters = {} }: ReportRunPageProps) {
  const router = useRouter();
  const owner = useWorkspaceFormOwner();
  const principal = JSON.stringify([authContext.profile?.id ?? null, authContext.profile?.auth_user_id ?? null]);
  const stateKey = owner ? `report-view:${principal}:${owner.id}:${registryEntry.report_code}` : undefined;
  // Filters and repeated column selections survive a workspace switch, in this
  // principal's memory only. Report rows and resolved branding are never cached here.
  const [storedFilters, setFilters] = usePersistentUiState<Record<string, string>>(stateKey ? `${stateKey}:filters` : undefined, initialFilters);
  const [filterPrincipal, setFilterPrincipal] = useState(principal);
  const [initialFiltersRetired, setInitialFiltersRetired] = useState(false);
  const priorFilters = useRef({principal, setFilters});
  const filters = filterPrincipal === principal ? storedFilters : {};
  useEffect(() => {
    if (priorFilters.current.principal !== principal) {
      priorFilters.current.setFilters({}); setFilters({}); setFilterPrincipal(principal); setInitialFiltersRetired(true);
    }
    priorFilters.current = {principal, setFilters};
  }, [principal, setFilters]);

  const schema = registryEntry.filter_schema_json as { filters?: string[] };
  const entityKeys = ENTITY_FILTER_KEYS.filter(k => (schema.filters ?? []).includes(k)) as FilterLookupKey[];
  const filterRevision = useRef(0), savedApplySequence = useRef(0);
  const handleFilterChange = useCallback((key: string, value: string) => {
    filterRevision.current++;
    setFilters((prev) => {
      const next = {...prev, [key]: value};
      if (prev[key] === value) return next;
      const downstream: Record<string, string[]> = {owner_company_id: ["branch_id", "department_id", "designation_id", "work_site_id", "employee_id"],
        branch_id: ["employee_id"], department_id: ["designation_id", "employee_id"]};
      for (const field of downstream[key] ?? []) delete next[field];
      return next;
    });
  }, [setFilters]);
  const criteria = useReportCriteria(authContext, registryEntry.report_code, entityKeys, filters, handleFilterChange);
  const baseReadIdentity = JSON.stringify([reportCriteriaIdentity(authContext), registryEntry.report_code, registryEntry.required_permissions, registryEntry.filter_schema_json, criteria.ownerDenied]);
  const savedFilterRead = useReportSavedFilters(authContext, registryEntry.report_code, {enabled: !criteria.ownerDenied, generation: baseReadIdentity});
  const ownerDenied = criteria.ownerDenied || savedFilterRead.denied;
  const readIdentity = JSON.stringify([baseReadIdentity, savedFilterRead.denied]);
  const {values: reportView, setField: setViewField, isCurrent} = useReportViewState(readIdentity);
  const {isRunning, isExporting, runResult, error, showTemplateDialog, pendingExportFormat, selectedTemplateId, resolvedBranding, showSaveFilterDialog, saveFilterName, isSavingFilter, isApplyingFilter} = reportView;
  const runSequence = useRef(0);
  const outputSequence = runSequence.current;
  const canUseOutput = () => isCurrent() && !ownerDenied && !!runResult?.data && runSequence.current === outputSequence;

  // Column visibility
  const [visibleColumns, setVisibleColumns] = usePersistentUiState<string[] | null>(stateKey ? `${stateKey}:columns` : undefined, null);

  const savedFilters = ownerDenied ? [] : savedFilterRead.rows;
  const loadSavedFilters = () => void savedFilterRead.refresh();
  const handleReset = useCallback(() => {
    if (!isCurrent()) return;
    filterRevision.current++; savedApplySequence.current++;
    setViewField("isApplyingFilter", false);
    runSequence.current++;
    setViewField("isRunning", false); setViewField("resolvedBranding", undefined);
    setFilters(initialFiltersRetired || filterPrincipal !== principal ? {} : initialFilters);
    setViewField("runResult", null);
    setViewField("error", null);
    setVisibleColumns(null);
  }, [initialFilters, initialFiltersRetired, filterPrincipal, principal, setFilters, setVisibleColumns, isCurrent, setViewField]);

  const handleApplySavedFilter = async (filter: ReportSavedFilterRow) => {
    if (!isCurrent() || ownerDenied) return;
    const sequence = ++savedApplySequence.current, revision = filterRevision.current;
    setViewField("isApplyingFilter", true);
    try {
      const result = await savedFilterRead.loadFilter(filter.id);
      if (!isCurrent() || sequence !== savedApplySequence.current || revision !== filterRevision.current) return;
      if (!result.success) {
        if (result.kind !== "retired") toast.error(result.kind === "unavailable" ? "This saved filter is no longer available." : "This saved filter could not be loaded. Try again.");
        return;
      }
      filterRevision.current++;
      setFilters(result.data.filters_json as Record<string, string>);
      toast.success(`Loaded filter: ${result.data.filter_name}`);
    } finally {
      if (isCurrent() && sequence === savedApplySequence.current) setViewField("isApplyingFilter", false);
    }
  };

  const handleSaveFilter = async () => {
    if (!isCurrent() || ownerDenied) return;
    if (!saveFilterName.trim()) { toast.error("Filter name is required."); return; }
    setViewField("isSavingFilter", true);
    try {
      const result = await createSavedFilter({
        reportCode: registryEntry.report_code,
        filterName: saveFilterName.trim(),
        filtersJson: filters as Record<string, unknown>,
        isDefault: false,
        isShared: false,
      });
      if (!isCurrent()) return;
      if (result.success) {
        toast.success("Filter saved.");
        setViewField("saveFilterName", "");
        setViewField("showSaveFilterDialog", false);
        loadSavedFilters();
      } else {
        toast.error(result.error ?? "Save failed.");
      }
    } finally {
      setViewField("isSavingFilter", false);
    }
  };

  const handleDeleteSavedFilter = async (id: number) => {
    if (!isCurrent() || ownerDenied) return;
    const result = await deleteSavedFilter(id);
    if (!isCurrent()) return;
    if (result.success) {
      toast.success("Filter deleted.");
      loadSavedFilters();
    } else {
      toast.error(result.error ?? "Delete failed.");
    }
  };

  const handleSetDefaultFilter = async (id: number) => {
    if (!isCurrent() || ownerDenied) return;
    const result = await setDefaultSavedFilter(id);
    if (!isCurrent()) return;
    if (result.success) {
      toast.success("Default filter set.");
      loadSavedFilters();
    } else {
      toast.error(result.error ?? "Failed.");
    }
  };

  const runReport = async () => {
    if (!isCurrent() || ownerDenied || !criteria.canRunNow()) return;
    const sequence = ++runSequence.current;
    const latest = () => isCurrent() && runSequence.current === sequence;
    setViewField("runResult", null); setViewField("resolvedBranding", undefined);
    setViewField("isRunning", true);
    setViewField("error", null);
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
      if (!latest()) return;

      if (!result.success) {
        setViewField("error", result.error ?? "Failed to run report");
        return;
      }

      const runResult = result.data as ReportRunResult;

      if (runResult.requiresManualTemplateSelection) {
        setViewField("pendingExportFormat", null);
        setViewField("showTemplateDialog", true);
        return;
      }

      setViewField("runResult", runResult);
      setVisibleColumns(previous => previous?.filter(column => runResult.data?.columns.includes(column)) ?? null);

      // Resolve branding for export/preview if the run produced a template
      const templateId = runResult.resolvedTemplateId ?? selectedTemplateId;
      if (templateId) {
        resolveTemplatePreview({
          templateId,
          reportCode: registryEntry.report_code,
        }).then((brandingResult) => {
          if (!latest()) return;
          if (brandingResult.success && brandingResult.data) setViewField("resolvedBranding", brandingResult.data);
          else setViewField("error", "Report branding is unavailable. Try running the report again.");
        }).catch(() => {
          if (latest()) setViewField("error", "Report branding is unavailable. Try running the report again.");
        });
      }
    } catch (err) {
      if (latest()) setViewField("error", err instanceof Error ? err.message : "Unexpected error");
    } finally {
      if (latest()) setViewField("isRunning", false);
    }
  };

  const handleExport = async (format: "pdf" | "excel" | "csv" | "print") => {
    if (!canUseOutput()) return;
    if (!runResult?.data) {
      toast.error("Run the report first before exporting.");
      return;
    }

    if (runResult.requiresManualTemplateSelection && !selectedTemplateId) {
      setViewField("pendingExportFormat", format);
      setViewField("showTemplateDialog", true);
      return;
    }

    const rowCount = runResult.data.rows.length;

    if ((format === "pdf" || format === "print") && rowCount > LARGE_EXPORT_PDF_THRESHOLD) {
      toast.warning(
        `This report has ${rowCount.toLocaleString()} rows. PDF/Print may be slow or incomplete. Consider exporting to Excel or CSV instead.`,
        { duration: 6000 }
      );
    }

    setViewField("isExporting", true);
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
        await exportToExcel({
          title: registryEntry.report_name_en,
          filename: `${registryEntry.report_code}_${dateStr}`,
          columns: exportColumns,
          data: exportData,
          orientation: registryEntry.default_orientation,
          branding: resolvedBranding,
        });
      } else if (format === "pdf") {
        await exportToPDF({
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
      if (canUseOutput() && format !== "csv") {
        toast.success(`Exporting ${format.toUpperCase()}...`);
      }
    } catch (err) {
      if (canUseOutput()) toast.error("Export failed: " + (err instanceof Error ? err.message : "Unknown error"));
    } finally {
      setViewField("isExporting", false);
    }
  };

  const handleTemplateSelected = (templateId: number) => {
    if (!isCurrent() || ownerDenied) return;
    setViewField("selectedTemplateId", templateId);
    setViewField("showTemplateDialog", false);
    // Pre-resolve branding for the manually selected template
    resolveTemplatePreview({
      templateId,
      reportCode: registryEntry.report_code,
    }).then((brandingResult) => {
      if (!isCurrent()) return;
      if (brandingResult.success && brandingResult.data) {
        setViewField("resolvedBranding", brandingResult.data);
      } else setViewField("error", "Report branding is unavailable. Try selecting the template again.");
    }).catch(() => {
      if (isCurrent()) setViewField("error", "Report branding is unavailable. Try selecting the template again.");
    });
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
            criteria={{...criteria, ownerDenied, canRun: criteria.canRun && !ownerDenied, canRunNow: () => !ownerDenied && criteria.canRunNow()}}
          />
        </div>

        {/* Saved filters dropdown */}
        <div className="flex items-center gap-1.5 mb-0 shrink-0">
            <DropdownMenu>
              <DropdownMenuTrigger className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 h-8 text-sm font-medium hover:bg-muted/50 transition-colors">
                <BookmarkCheck className="h-3.5 w-3.5" />
                Saved Filters
                <ChevronDown className="h-3.5 w-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="text-xs">Saved Filters</DropdownMenuLabel>
                  <Input aria-label="Search saved filters" placeholder="Search saved filters…" value={savedFilterRead.search}
                    onChange={event => savedFilterRead.setSearch(event.target.value)} onKeyDown={event => event.stopPropagation()} disabled={ownerDenied} />
                  <DropdownMenuSeparator />
                  {ownerDenied ? <p role="alert">Your access to saved filters could not be verified.</p>
                    : savedFilterRead.invalid ? <p role="alert">Saved-filter search must be at most 200 characters.</p>
                    : savedFilterRead.error ? <div role="alert"><p>Saved filters could not be loaded.</p><Button variant="outline" onClick={savedFilterRead.retry}>Retry saved filters</Button></div>
                    : savedFilterRead.busy ? <p role="status">Loading saved filters…</p>
                    : savedFilterRead.ready && savedFilters.length === 0 ? <p>No saved filters match this search.</p> : null}
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
                  {savedFilterRead.totalCount !== null && <div className="flex items-center justify-between gap-2 text-xs">
                    <Button variant="ghost" size="sm" aria-label="Previous saved filters" disabled={!savedFilterRead.ready || savedFilterRead.page <= 1} onClick={() => savedFilterRead.move(savedFilterRead.page - 1)}>Previous</Button>
                    <span>{savedFilterRead.totalCount} filters · Page {savedFilterRead.page}</span>
                    <Button variant="ghost" size="sm" aria-label="Next saved filters" disabled={!savedFilterRead.ready || savedFilterRead.page * savedFilterRead.pageSize >= savedFilterRead.totalCount} onClick={() => savedFilterRead.move(savedFilterRead.page + 1)}>Next</Button>
                  </div>}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          {isApplyingFilter && <span role="status" className="text-xs">Loading saved filter…</span>}

          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setViewField("showSaveFilterDialog", !showSaveFilterDialog)}
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
            onChange={(e) => setViewField("saveFilterName", e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSaveFilter(); if (e.key === "Escape") setViewField("showSaveFilterDialog", false); }}
            autoFocus
          />
          <Button size="sm" className="h-7" onClick={handleSaveFilter} disabled={isSavingFilter}>
            Save
          </Button>
          <Button variant="ghost" size="sm" className="h-7" onClick={() => setViewField("showSaveFilterDialog", false)}>
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
            canUseData={canUseOutput}
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
        authContext={authContext}
        readGeneration={readIdentity}
        selectedTemplateId={selectedTemplateId}
        open={showTemplateDialog}
        onOpenChange={value => setViewField("showTemplateDialog", value)}
        ownerCompanyIds={[]}
        onSelect={(templateId) => handleTemplateSelected(templateId)}
      />
    </div>
  );
}
