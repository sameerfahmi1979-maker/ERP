"use client";

import { useEffect, useMemo, useState } from "react";
import { fitWorklistColumns } from "@/lib/ui/fit-worklist-columns";
import type { ListColumn } from "@/lib/ui/worklist-column-layout";
import { usePersistentUiState } from "./use-persistent-ui-state";

export function useWorklistViewport(
  key: string | undefined,
  visible: readonly ListColumn[],
  { enabled = true, trailingWidth = 0 }: { enabled?: boolean; trailingWidth?: number } = {},
) {
  const [fit, setFit] = usePersistentUiState(key && enabled ? `worklist-fit:${key}` : undefined, true);
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const [measurement, setMeasurement] = useState<{ element: HTMLDivElement; width: number } | null>(null);

  useEffect(() => {
    if (!enabled || !element) return;
    const update = () => {
      const width = element.clientWidth;
      setMeasurement(current => current?.element === element && current.width === width ? current : { element, width });
    };
    update();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", update);
      return () => window.removeEventListener("resize", update);
    }
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [element, enabled]);

  const measuredWidth = measurement && measurement.element === element && measurement.width > 0 ? measurement.width : null;
  const columns = useMemo(() => enabled && fit
    ? fitWorklistColumns(visible, measuredWidth === null ? null : measuredWidth - trailingWidth)
    : visible, [visible, enabled, fit, measuredWidth, trailingWidth]);
  const width = columns.reduce((sum, column) => sum + column.width, trailingWidth);

  function scrollToColumnEdge(edge: "start" | "end") {
    if (!element) return;
    const direction = getComputedStyle(element).direction === "rtl" ? -1 : 1;
    element.scrollTo({ left: edge === "start" ? 0 : direction * element.scrollWidth });
  }

  function toggleFit() {
    setFit(current => !current);
    scrollToColumnEdge("start");
  }

  return {
    fit, setFit, toggleFit, columns, trailingWidth,
    attachViewport: enabled ? setElement : undefined,
    tableProps: enabled ? { "data-worklist-table": "", style: { minWidth: width, width: fit ? undefined : width } } : {},
    hasOverflow: enabled && measuredWidth !== null && width > measuredWidth,
    scrollToColumnEdge,
  };
}
