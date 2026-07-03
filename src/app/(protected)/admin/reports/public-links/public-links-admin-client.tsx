"use client";

import { useState, useTransition } from "react";
import {
  QrCode,
  Copy,
  Check,
  X,
  ExternalLink,
  Clock,
  CheckCircle2,
  XCircle,
  ArrowRight,
  Link2,
  AlertCircle,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cancelOutputPublicLink, listOutputPublicLinks } from "@/server/actions/reports/public-verification";
import type { OutputPublicLink } from "@/lib/public-verification/types";

type LinkRow = Partial<OutputPublicLink>;

interface PublicLinksAdminClientProps {
  initialLinks: LinkRow[];
  totalLinks: number;
  canManage: boolean;
}

const STATUS_CONFIG = {
  valid: {
    label: "Valid",
    icon: CheckCircle2,
    className: "text-green-700 bg-green-50 border-green-200",
  },
  expired: {
    label: "Expired",
    icon: Clock,
    className: "text-yellow-700 bg-yellow-50 border-yellow-200",
  },
  cancelled: {
    label: "Cancelled",
    icon: XCircle,
    className: "text-red-700 bg-red-50 border-red-200",
  },
  superseded: {
    label: "Superseded",
    icon: ArrowRight,
    className: "text-blue-700 bg-blue-50 border-blue-200",
  },
};

function StatusBadge({ status }: { status: string | undefined }) {
  const cfg = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG];
  if (!cfg) return null;
  const Icon = cfg.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide border rounded-full ${cfg.className}`}
    >
      <Icon className="h-2.5 w-2.5" />
      {cfg.label}
    </span>
  );
}

function formatDate(val: string | null | undefined): string {
  if (!val) return "—";
  return new Date(val).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function PublicLinksAdminClient({
  initialLinks,
  totalLinks,
  canManage,
}: PublicLinksAdminClientProps) {
  const [links, setLinks] = useState<LinkRow[]>(initialLinks);
  const [total, setTotal] = useState(totalLinks);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleCopyUrl = async (link: LinkRow) => {
    if (!link.public_url_path || !link.id) return;
    const baseUrl = window.location.origin;
    const url = `${baseUrl}${link.public_url_path}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(link.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // ignore
    }
  };

  const handleCancel = async (id: number) => {
    if (!confirm("Cancel this verification link? This cannot be undone.")) return;
    setCancellingId(id);
    setCancelError(null);
    const result = await cancelOutputPublicLink(id, "Cancelled by admin");
    if (!result.success) {
      setCancelError(result.error ?? "Failed to cancel.");
    } else {
      setLinks((prev) =>
        prev.map((l) => (l.id === id ? { ...l, status: "cancelled" as const } : l))
      );
    }
    setCancellingId(null);
  };

  const handleRefresh = () => {
    startTransition(async () => {
      const result = await listOutputPublicLinks({ limit: 100 });
      if (result.success && result.data) {
        setLinks(result.data.links);
        setTotal(result.data.total);
      }
    });
  };

  return (
    <div className="flex flex-col gap-6 p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <QrCode className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Public Verification Links</h1>
            <p className="text-sm text-muted-foreground">
              {total} issued link{total !== 1 ? "s" : ""} · BRANDING.6
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={handleRefresh}
          disabled={isPending}
        >
          {isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Refresh
        </Button>
      </div>

      {/* Error */}
      {cancelError && (
        <div className="flex items-start gap-2 p-3 bg-destructive/5 border border-destructive/20 rounded-lg text-destructive text-sm">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          {cancelError}
        </div>
      )}

      {/* Table */}
      {links.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground bg-muted/20 rounded-xl border border-dashed">
          <Link2 className="h-8 w-8 opacity-30" />
          <p className="text-sm">No verification links issued yet.</p>
          <p className="text-xs">
            Open a formal document preview and click &quot;Issue QR&quot; to create one.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Document</th>
                <th className="px-4 py-3 text-left font-semibold">Type</th>
                <th className="px-4 py-3 text-left font-semibold">Status</th>
                <th className="px-4 py-3 text-left font-semibold">Issued</th>
                <th className="px-4 py-3 text-left font-semibold">Views</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {links.map((link) => (
                <tr key={link.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground truncate max-w-[220px]">
                      {link.document_title}
                    </div>
                    {link.document_ref && (
                      <div className="text-xs text-muted-foreground font-mono mt-0.5">
                        {link.document_ref}
                      </div>
                    )}
                    {link.document_date && (
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {formatDate(link.document_date)}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs capitalize text-muted-foreground">
                      {link.output_type?.replace(/_/g, " ")}
                    </span>
                    <div className="text-[10px] text-muted-foreground/70 mt-0.5">
                      {link.source_module}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={link.status} />
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                    {formatDate(link.issued_at)}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground text-center">
                    {link.view_count ?? 0}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      {/* Copy URL */}
                      <button
                        onClick={() => handleCopyUrl(link)}
                        className="inline-flex items-center justify-center h-7 w-7 rounded-md border border-input bg-background hover:bg-accent text-muted-foreground transition-colors"
                        title="Copy verification URL"
                      >
                        {copiedId === link.id ? (
                          <Check className="h-3 w-3 text-green-600" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </button>
                      {/* Open verify page */}
                      {link.public_url_path && (
                        <a
                          href={link.public_url_path}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center h-7 w-7 rounded-md border border-input bg-background hover:bg-accent text-muted-foreground transition-colors"
                          title="Open verification page"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                      {/* Cancel */}
                      {canManage && link.status === "valid" && (
                        <button
                          onClick={() => link.id && handleCancel(link.id)}
                          disabled={cancellingId === link.id}
                          className="inline-flex items-center justify-center h-7 w-7 rounded-md border border-destructive/30 bg-background hover:bg-destructive/5 text-destructive/70 hover:text-destructive transition-colors disabled:opacity-50"
                          title="Cancel verification link"
                        >
                          {cancellingId === link.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <X className="h-3 w-3" />
                          )}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-muted-foreground text-center">
        Public links expose only sanitized verification metadata. No sensitive data is included.
      </p>
    </div>
  );
}
