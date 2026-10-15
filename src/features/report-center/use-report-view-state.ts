"use client";
import {useCallback, useLayoutEffect, useRef, useState, type SetStateAction} from "react";
import type {ReportRunResult} from "@/lib/report-center/types";
import type {ExportBrandingContext} from "@/lib/export/export-types";

function emptyView() {
  return {
    isRunning: false, isExporting: false, runResult: null as ReportRunResult | null, error: null as string | null,
    showTemplateDialog: false, pendingExportFormat: null as "pdf" | "excel" | "csv" | "print" | null,
    selectedTemplateId: undefined as number | undefined, resolvedBranding: undefined as ExportBrandingContext | undefined,
    showSaveFilterDialog: false, saveFilterName: "", isSavingFilter: false, isApplyingFilter: false,
  };
}
/** Ephemeral report output is not a workspace draft. Every authorization/report
 * transition gets a fresh generation, including A→B→A; old promises and portal
 * callbacks cannot install state in the new generation. No persistent cache. */
export function useReportViewState(identity: string) {
  const [state, setState] = useState(() => ({identity, generation: {}, values: emptyView()}));
  if (state.identity !== identity) setState({identity, generation: {}, values: emptyView()});
  const committed = useRef<object | null>(null), generation = state.generation;
  useLayoutEffect(() => {committed.current = generation; return () => {if (committed.current === generation) committed.current = null;};}, [generation]);
  const isCurrent = useCallback(() => committed.current === generation, [generation]);
  const setField = useCallback(<K extends keyof ReturnType<typeof emptyView>>(field: K, value: SetStateAction<ReturnType<typeof emptyView>[K]>) => {
    if (!isCurrent()) return;
    setState(previous => previous.generation === generation ? {...previous, values: {...previous.values,
      [field]: typeof value === "function" ? (value as (old: ReturnType<typeof emptyView>[K]) => ReturnType<typeof emptyView>[K])(previous.values[field]) : value}} : previous);
  }, [generation, isCurrent]);
  return {values: state.identity === identity ? state.values : emptyView(), setField, isCurrent};
}
