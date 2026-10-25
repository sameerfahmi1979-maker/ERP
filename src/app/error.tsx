"use client";
import { useEffect, useState } from "react";
import { reportSafeDiagnostic } from "@/lib/observability/safe-diagnostic";

export default function ApplicationError({ error, retry }: { error: unknown; retry: () => void }) {
  const [reference, setReference] = useState<string>();
  useEffect(() => {
    let active=true;
    const value=reportSafeDiagnostic(error, { route: window.location.pathname, source: "client", event: "SEGMENT_ERROR", build: process.env.NEXT_PUBLIC_ALGT_BUILD_COMMIT });
    queueMicrotask(()=>{if(active)setReference(value);});
    return()=>{active=false;};
  }, [error]);
  return <section className="rounded-lg border bg-card p-6 space-y-3" role="alert">
    <h1 className="text-lg font-semibold">This page could not be shown</h1>
    <p>Try loading it again. If a save was in progress, check its retained status before submitting again.</p>
    {reference && <p className="text-sm text-muted-foreground">Support reference: {reference}</p>}
    <button type="button" onClick={retry} className="rounded-md border px-4 py-2 font-medium">Try again</button>
  </section>;
}
