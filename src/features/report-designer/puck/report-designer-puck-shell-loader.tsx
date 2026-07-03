"use client";

/**
 * Report Designer — Dynamic Puck Shell Loader
 * Phase: REPORT DESIGNER.2
 *
 * Client component wrapper that dynamically imports the Puck editor shell
 * with ssr:false. Required because Next.js 16 does not allow dynamic()
 * with ssr:false inside Server Components.
 */

import dynamic from "next/dynamic";
import type { ReportDesignerPuckShellProps } from "./report-designer-puck-shell";

const ReportDesignerPuckShellInner = dynamic(
  () =>
    import("./report-designer-puck-shell").then((m) => m.ReportDesignerPuckShell),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Loading editor…
      </div>
    ),
  }
);

export function ReportDesignerPuckShellLoader(props: ReportDesignerPuckShellProps) {
  return <ReportDesignerPuckShellInner {...props} />;
}
