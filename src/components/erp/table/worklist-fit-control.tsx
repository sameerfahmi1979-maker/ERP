"use client";

import { Button } from "@fluentui/react-components";
import { ArrowAutofitWidth20Regular } from "@fluentui/react-icons";
import type { ComponentPropsWithoutRef } from "react";
import type { useWorklistViewport } from "@/hooks/use-worklist-viewport";
import { cn } from "@/lib/utils";

type Viewport = ReturnType<typeof useWorklistViewport>;

export function WorklistScrollRegion({ attach, className, ...props }: ComponentPropsWithoutRef<"div"> & { attach: Viewport["attachViewport"] }) {
  return <div ref={attach} role="region" tabIndex={0} className={cn("min-w-0 max-w-full overflow-x-auto", className)} {...props} />;
}

export function WorklistFitControl({ viewport }: { viewport: Viewport }) {
  return <>
    <Button icon={<ArrowAutofitWidth20Regular />} aria-pressed={viewport.fit}
      title={viewport.fit ? "Show saved column widths" : "Fit visible columns to the available space"}
      appearance={viewport.fit ? "secondary" : "outline"} onClick={viewport.toggleFit}>
      Fit to screen
    </Button>
    {viewport.hasOverflow && <>
      <Button appearance="subtle" onClick={() => viewport.scrollToColumnEdge("start")}>First columns</Button>
      <Button appearance="subtle" onClick={() => viewport.scrollToColumnEdge("end")}>Last columns</Button>
    </>}
  </>;
}

export function WorklistColgroup({ viewport }: { viewport: Viewport }) {
  return <colgroup>
    {viewport.columns.map(column => <col key={column.id} style={{ width: column.width }} />)}
    {viewport.trailingWidth > 0 && <col style={{ width: viewport.trailingWidth }} />}
  </colgroup>;
}
