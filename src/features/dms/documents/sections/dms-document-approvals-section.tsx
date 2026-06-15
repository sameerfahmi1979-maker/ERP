"use client";

import { ShieldCheck } from "lucide-react";

export function DmsDocumentApprovalsSection() {
  return (
    <div className="flex flex-col items-center gap-3 py-8 text-muted-foreground">
      <ShieldCheck className="h-8 w-8 opacity-30" />
      <div className="text-center">
        <p className="text-sm font-medium">Approval Workflow</p>
        <p className="text-xs mt-1 opacity-70">
          Approval workflow will be implemented in a future DMS phase.
          <br />
          Approvers, stages, and sign-off tracking will appear here.
        </p>
      </div>
    </div>
  );
}
