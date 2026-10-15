"use client";
import { useLayoutEffect, useRef, useState } from "react";
import { ERPExportMenu } from "@/components/erp/export/erp-export-menu";
import type { ERPExportColumn } from "@/lib/export";
import { Button } from "@/components/ui/button";
import { readJson } from "@/lib/reads/client";
import { useLegacyEmailAccess } from "@/hooks/use-legacy-email-access";
import type { ExpiryCriteria, ExpiryOutput } from "@/server/reads/dms-expiry-page";
import type { DmsExpiringDocumentRow } from "@/server/actions/dms/expiry-reminders";
import { DmsExpiryEmailDialog } from "./dms-expiry-email-dialog";
import { toast } from "sonner";

const columns: ERPExportColumn<DmsExpiringDocumentRow>[] = [
  { key: "document_no", header: "Doc No", width: 14 }, { key: "title", header: "Title", width: 30 },
  { key: "document_type", header: "Type", width: 20 }, { key: "category", header: "Category", width: 18 },
  { key: "expiry_date", header: "Expiry Date", width: 14 }, { key: "days_remaining", header: "Days Remaining", width: 14 },
  { key: "status", header: "Status", width: 12 },
];
const titles = { expired: "Expired Documents", expiring: "Expiring Soon", missing_expiry: "Missing Expiry", ignored: "Ignored Documents", all: "Documents" };

/** Parent keys this session by complete filter/sort criteria; principal retirement
 * is owned by ReadCacheBoundary. Page navigation never changes output criteria. */
export function DmsExpiryOutputs({ criteria, ready, total }: { criteria: ExpiryCriteria; ready: boolean; total: number | undefined }) {
  const canEmail = useLegacyEmailAccess();
  const [snapshot, setSnapshot] = useState<ExpiryOutput | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState("");
  const flight = useRef<AbortController | null>(null);
  const available = useRef(false);
  const emailAllowed = useRef(canEmail);
  const mounted = useRef(false);
  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false; flight.current?.abort(); }; }, []);
  useLayoutEffect(() => { available.current = ready; if (!ready) flight.current?.abort(); }, [ready]);
  useLayoutEffect(() => { emailAllowed.current = canEmail; }, [canEmail]);
  if (snapshot && !canEmail) setSnapshot(null);
  const load = async (): Promise<ExpiryOutput> => {
    if (!available.current || flight.current) throw Error("Wait for the document list to finish verification.");
    const controller = new AbortController(); flight.current = controller;
    try {
      const result = await readJson<{ success: true; data: ExpiryOutput }>("dms-expiry-output", criteria, controller.signal);
      if (!mounted.current || !available.current || controller.signal.aborted) throw Error("Document selection changed. Retry with the current filters.");
      const output = result.data;
      if (!output || !Array.isArray(output.rows) || output.totalCount !== output.rows.length || output.totalCount > 10000 ||
          new Set(output.rows.map(r => r.id)).size !== output.rows.length || !/^[a-f0-9]{64}$/.test(output.fingerprint)) throw Error("The complete result could not be verified.");
      return output;
    } finally { if (flight.current === controller) flight.current = null; }
  };
  const prepareEmail = async () => {
    if (!canEmail || !ready || preparing) return;
    setPreparing(true); setError("");
    try { const output = await load(); if (!output.rows.length) throw Error("No matching documents to send."); setSnapshot(output); }
    catch { if (mounted.current) setError("The complete email list could not be prepared. Retry; no email was sent."); }
    finally { if (mounted.current) setPreparing(false); }
  };
  const title = titles[criteria.view];
  return <div className="space-y-2">
    <div className="flex flex-wrap items-center gap-2">
      <ERPExportMenu title={title} filename={title.toLowerCase().replace(/\s+/g, "-")} columns={columns} data={[]}
        loadData={async () => (await load()).rows} disabled={!ready || total === 0 || total === undefined || preparing}
        moduleCode="DMS" exportMode="filtered" orientation="landscape" />
      <Button variant="outline" size="sm" disabled={!ready || !canEmail || total === 0 || total === undefined || preparing}
        title={!canEmail ? "Legacy email remains limited to globally authorized senders" : undefined} onClick={() => void prepareEmail()}>
        {preparing ? "Preparing complete list…" : "Send by Email"}
      </Button>
    </div>
    <p className="text-xs text-muted-foreground">Exports and email include all matching permitted documents, not just this page. Up to 10,000 documents; refine filters for larger results.</p>
    {error && <p role="alert">{error}</p>}
    {snapshot && canEmail && <DmsExpiryEmailDialog open onOpenChange={open => { if (!open) setSnapshot(null); }}
      docs={snapshot.rows} tabTitle={title} suspended={!ready}
      loadDocs={async () => {
        const current = await load();
        if (!emailAllowed.current) throw Error("Email permission changed; no email was sent.");
        if (current.fingerprint !== snapshot.fingerprint) { toast.error("The matching documents changed. Close this dialog and prepare the list again."); throw Error("Document list changed; no email was sent."); }
        return current.rows;
      }} />}
  </div>;
}
