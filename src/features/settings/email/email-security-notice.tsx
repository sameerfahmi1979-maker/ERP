"use client";

import { ShieldCheck, AlertTriangle } from "lucide-react";

export function EmailSecurityNotice() {
  return (
    <div className="rounded-lg border border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-900 p-4">
      <div className="flex gap-3">
        <ShieldCheck className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
        <div className="space-y-2">
          <p className="text-sm font-semibold text-green-800 dark:text-green-300">Secrets stored in Supabase Vault</p>
          <ul className="text-xs text-green-700 dark:text-green-400 space-y-1 list-disc list-inside">
            <li>Microsoft client secrets are <strong>AES-256 encrypted in Supabase Vault</strong> — never in a plain DB column.</li>
            <li>Only a masked preview (e.g. <code className="font-mono bg-green-100 dark:bg-green-900/40 px-1 rounded">****ae81</code>) is stored alongside the vault reference.</li>
            <li>Secrets are decrypted server-side only at the moment of use — never cached, never logged.</li>
            <li>Access tokens are requested per operation and never persisted anywhere.</li>
            <li>No secrets are ever returned to the browser or included in network responses.</li>
          </ul>
        </div>
      </div>
    </div>
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
