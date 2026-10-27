"use client";
import { useEffect, useState } from "react";
import { reportSafeDiagnostic } from "@/lib/observability/safe-diagnostic";
import { mayNeedCurrentPage } from "@/lib/observability/stale-page";

export default function ApplicationError({ error, retry }: { error: unknown; retry: () => void }) {
  const [reference, setReference] = useState<string>();
  const [currentUrl, setCurrentUrl] = useState<string>();
  const stalePage = mayNeedCurrentPage(error);
  useEffect(() => {
    let active=true;
    const value=reportSafeDiagnostic(error, { route: window.location.pathname, source: "client", event: "SEGMENT_ERROR", build: process.env.NEXT_PUBLIC_ALGT_BUILD_COMMIT });
    queueMicrotask(()=>{if(active){setReference(value);setCurrentUrl(window.location.origin + window.location.pathname + window.location.search);}});
    return()=>{active=false;};
  }, [error]);
  return <section className="rounded-lg border bg-card p-6 space-y-3" role="alert">
    <h1 className="text-lg font-semibold">{stalePage ? "This page may need the current application version" : "This page could not be shown"}</h1>
    {stalePage ? <p>Keep this tab open if it contains unsaved work. Open the current version in a new tab. If a save was in progress, check its retained request before submitting again.</p> :
      <p>Try loading it again. If a save was in progress, check its retained status before submitting again.</p>}
    {reference && <p className="text-sm text-muted-foreground">Support reference: {reference}</p>}
    {stalePage ? currentUrl && <a href={currentUrl} target="_blank" rel="noopener noreferrer" className="inline-block rounded-md border px-4 py-2 font-medium">Open current version in a new tab</a> :
      <button type="button" onClick={retry} className="rounded-md border px-4 py-2 font-medium">Try again</button>}
  </section>;
}
