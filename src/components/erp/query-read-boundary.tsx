"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

type ReadState = { isError: boolean; data?: unknown; refetch: () => Promise<unknown> };
export function readHasFailed(query: ReadState): boolean {
  return query.isError || (!!query.data && typeof query.data === "object" && "success" in query.data && query.data.success === false);
}

/** Failed reads retain the mounted draft but cannot leave stale actions enabled. */
export function QueryReadBoundary({ queries, children }: { queries: ReadState[]; children: ReactNode }) {
  const [retrying, setRetrying] = useState(false);
  const failed = queries.filter(readHasFailed);
  return <div className="contents">
    {failed.length > 0 && <div role="alert" className="col-span-full mb-4 rounded-sm border border-destructive p-3 text-sm">
      <p>Some records or choices could not be loaded. This is not an empty result. Your current input is retained; actions are paused until the read succeeds.</p>
      <Button type="button" variant="outline" disabled={retrying} className="mt-2" onClick={async () => {
        setRetrying(true);
        try { await Promise.allSettled(failed.map(query => query.refetch())); }
        finally { setRetrying(false); }
      }}>{retrying ? "Retrying…" : "Retry loading"}</Button>
    </div>}
    <div className="contents" inert={failed.length > 0 || undefined} aria-busy={retrying || undefined}>{children}</div>
  </div>;
}
