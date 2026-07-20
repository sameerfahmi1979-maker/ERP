"use client";

import { ShieldCheck } from "lucide-react";
import { DmsApprovalActionPanel } from "@/features/dms/approvals/dms-approval-action-panel";

interface DmsDocumentApprovalsSectionProps {
  documentId: number | null;
}

export function DmsDocumentApprovalsSection({ documentId }: DmsDocumentApprovalsSectionProps) {
  if (!documentId) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-muted-foreground">
        <ShieldCheck className="h-8 w-8 opacity-30" />
        <div className="text-center">
          <p className="text-sm font-medium">Approval Workflow</p>
          <p className="text-xs mt-1 opacity-70">
            Save the document first to manage approval workflow.
          </p>
        </div>
      </div>
    );
  }

  return <DmsApprovalActionPanel documentId={documentId} />;
}
