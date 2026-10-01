"use client";

import { Button } from "@/components/ui/button";

/** A rejected read is not an empty collection. Never echo backend internals. */
export function DmsLoadError({ subject, retry, pending = false }: { subject: string; retry: () => unknown; pending?: boolean }) {
  return <div role="alert" className="rounded-sm border border-destructive/40 bg-destructive/5 p-4 space-y-2">
    <p className="text-sm font-medium">Could not load {subject}.</p>
    <p className="text-sm text-muted-foreground">This does not mean there are no records. Check your connection and access, then retry.</p>
    <Button type="button" variant="outline" disabled={pending} onClick={() => { void retry(); }}>{pending ? "Retrying…" : "Retry"}</Button>
  </div>;
}
