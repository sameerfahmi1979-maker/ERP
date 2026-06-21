"use client";

import { AlertTriangle, Sparkles } from "lucide-react";
import type { ComplianceDmsPrefillMeta } from "@/lib/hr/compliance/compliance-dms-prefill";

type Props = {
  prefillMeta: ComplianceDmsPrefillMeta | null;
};

export function ComplianceDmsPrefillBanner({ prefillMeta }: Props) {
  if (!prefillMeta) return null;

  const isAi = prefillMeta.prefillSource && prefillMeta.prefillSource !== "dms_metadata";

  return (
    <div className="col-span-12 rounded-lg border border-primary/20 bg-primary/5 p-3 mb-2">
      <div className="flex items-start gap-2">
        <Sparkles className="h-4 w-4 text-primary shrink-0 mt-0.5" />
        <div className="text-sm space-y-1">
          <p className="font-medium">
            {isAi ? "Review AI-prefilled fields before saving" : "Prefilled from DMS metadata"}
          </p>
          <p>
            Source:{" "}
            <strong>
              {prefillMeta.documentTitle || prefillMeta.documentNo}
              {prefillMeta.documentNo && prefillMeta.documentTitle ? ` (${prefillMeta.documentNo})` : ""}
            </strong>
          </p>
          {prefillMeta.warning && (
            <p className="text-xs text-amber-700 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3 shrink-0" />
              {prefillMeta.warning}
            </p>
          )}
          {prefillMeta.linkedToEmployee === false && (
            <p className="text-xs text-muted-foreground">
              Document will be linked to the employee when you save.
            </p>
          )}
          {prefillMeta.mergedFrom && prefillMeta.mergedFrom.length > 0 && (
            <div className="text-xs text-muted-foreground space-y-1 pt-1">
              <p>Also merged from related DMS documents:</p>
              <ul className="list-disc list-inside">
                {prefillMeta.mergedFrom.map((doc) => (
                  <li key={`${doc.documentNo}-${doc.typeCode ?? "doc"}`}>
                    {doc.typeCode ? `${doc.typeCode.replace(/_/g, " ")} — ` : ""}
                    {doc.title || doc.documentNo}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
