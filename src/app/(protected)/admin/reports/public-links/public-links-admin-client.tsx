"use client";

import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ERPDataTable } from "@/components/erp/table/erp-data-table";
import { AlgtDialog } from "@/components/design-system/algt-dialog";
import type { ColumnDef } from "@tanstack/react-table";
import { cancelOutputPublicLink, listOutputPublicLinks } from "@/server/actions/reports/public-verification";
import type { OutputPublicLink } from "@/lib/public-verification/types";

type LinkRow = Partial<OutputPublicLink>;
interface Props { initialLinks: LinkRow[]; totalLinks: number; canManage: boolean; initialError?: boolean }
// Never open an external URL, script scheme, encoded slash or scheme-relative destination.
export function safeVerificationPath(value: string | undefined): string | null {
  return value && /^\/verify\/[a-zA-Z0-9_-]+$/.test(value) ? value : null;
}
const date = (value: string | null | undefined) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString() : "—";

export function PublicLinksAdminClient({ initialLinks, totalLinks, canManage, initialError = false }: Props) {
  const [links, setLinks] = useState(initialLinks), [total, setTotal] = useState(totalLinks);
  const [failed, setFailed] = useState(initialError), [message, setMessage] = useState("");
  const [target, setTarget] = useState<LinkRow | null>(null), [busy, setBusy] = useState(false);
  const [loading, startTransition] = useTransition(); const flight = useRef(false), latest = useRef(0);
  const refresh = () => {
    const request = ++latest.current;
    startTransition(async () => {
      try {
        const result = await listOutputPublicLinks({ limit: 100 });
        if (request !== latest.current) return;
        if (!result.success || !result.data) { setFailed(true); return; }
        setLinks(result.data.links); setTotal(result.data.total); setFailed(false);
      } catch { if (request === latest.current) setFailed(true); }
    });
  };
  const cancel = async () => {
    if (!target?.id || !canManage || failed || loading || flight.current) return;
    flight.current = true; setBusy(true); setMessage("");
    try {
      const result = await cancelOutputPublicLink(target.id, "Cancelled by admin");
      if (!result.success) { setMessage("Cancellation was not confirmed. Refresh before retrying."); return; }
      setLinks(rows => rows.map(row => row.id === target.id ? { ...row, status: "cancelled" } : row)); setTarget(null);
    } catch { setMessage("Cancellation was not confirmed. Refresh before retrying."); }
    finally { flight.current = false; setBusy(false); }
  };
  const columns: ColumnDef<LinkRow>[] = [
    { accessorKey: "document_title", header: "Document", size: 260 },
    { accessorKey: "document_ref", header: "Reference", size: 160 },
    { accessorKey: "output_type", header: "Type", size: 140 },
    { accessorKey: "status", header: "Status", size: 130 },
    { accessorKey: "issued_at", header: "Issued", size: 190, cell: ({ row }) => date(row.original.issued_at) },
    { accessorKey: "view_count", header: "Views", size: 100 },
    { id: "actions", header: "Actions", size: 300, enableSorting: false, cell: ({ row }) => {
      const link = row.original, path = safeVerificationPath(link.public_url_path);
      return <div className="flex flex-wrap gap-2">
        {path && <><Button size="sm" variant="outline" aria-label={`Copy verification URL for ${link.document_title}`} onClick={async () => {
          try { await navigator.clipboard.writeText(window.location.origin + path); setMessage("Verification URL copied."); }
          catch { setMessage("Clipboard access failed. Use Open verification to access the page."); }
        }}>Copy URL</Button><a className="underline py-2" href={path} target="_blank" rel="noopener noreferrer" aria-label={`Open verification for ${link.document_title} (new tab)`}>Open verification</a></>}
        {canManage && link.status === "valid" && <Button variant="outline" size="sm" disabled={busy || loading || failed} aria-label={`Cancel verification for ${link.document_title}`} onClick={() => { setMessage(""); setTarget(link); }}>Cancel link</Button>}
      </div>;
    } },
  ];
  return <section className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-xl font-semibold">Public verification links</h1><Button variant="outline" disabled={loading || busy} onClick={refresh}>Refresh links</Button></div>
    <p className="text-sm text-muted-foreground">{links.length} loaded of {total} authorized links (latest 100). Columns, search and filters apply to the loaded set. Dates use your browser timezone.</p>
    {failed && <div role="alert">Links could not be loaded or refreshed. Retained rows may be out of date; cancellation is disabled.</div>}
    {message && <p role="status">{message}</p>}
    <ERPDataTable tableId="reports.public-links" data={links} columns={columns} enableRowSelection={false} searchPlaceholder="Search loaded verification links…" />
    <p className="text-xs text-muted-foreground">Anyone with a valid verification URL can view its published details. Share it only with intended recipients.</p>
    <AlgtDialog open={!!target} onOpenChange={open => { if (!busy && !open) setTarget(null); }} title="Cancel this verification link?" actions={<><Button variant="outline" disabled={busy} onClick={() => setTarget(null)}>Keep link</Button><Button disabled={busy || failed || loading} onClick={() => void cancel()}>Confirm cancellation</Button></>}>
      <p>{target?.document_title}: cancellation prevents further valid verification through this link and cannot be undone.</p>
    </AlgtDialog>
  </section>;
}
