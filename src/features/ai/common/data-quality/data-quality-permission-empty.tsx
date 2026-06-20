'use client';

import { ShieldOff } from 'lucide-react';

export function DataQualityPermissionEmpty() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
      <ShieldOff className="h-12 w-12 text-muted-foreground/50" />
      <div>
        <h2 className="text-lg font-semibold">Access Restricted</h2>
        <p className="mt-1 text-sm text-muted-foreground max-w-sm">
          You do not have permission to view the AI Data Quality Monitor. Contact your administrator.
        </p>
      </div>
    </div>
  );
}
