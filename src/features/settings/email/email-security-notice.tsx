"use client";

import { ShieldCheck, AlertTriangle } from "lucide-react";

export function EmailSecurityNotice() {
  return (
    null
  );
}

interface EmailProviderNotReadyNoticeProps {
  message?: string;
}

export function EmailProviderNotReadyNotice({ message }: EmailProviderNotReadyNoticeProps) {
  return (
    <div className="rounded-lg border border-slate-200 bg-muted/20 p-4 flex items-start gap-3">
      <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
      <div>
        <p className="text-sm font-medium">Email provider not configured</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {message ?? "Configure and enable a Microsoft 365 provider to begin sending ERP emails. See setup guide below."}
        </p>
      </div>
    </div>
  );
}
