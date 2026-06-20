"use client";

import { LockKeyhole } from "lucide-react";

export function AuditPermissionEmpty() {
  return (
    <div className="flex items-center gap-2 text-slate-400 dark:text-slate-500 text-sm py-4">
      <LockKeyhole className="h-4 w-4 flex-shrink-0" />
      <span>You do not have permission to view this section.</span>
    </div>
  );
}
