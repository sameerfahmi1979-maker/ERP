"use client";

/**
 * ERP DMS.15 — Reusable DMS Entity Documents Tab
 *
 * Drop-in Documents tab for any future ERP module record.
 * Usage example (in an employee workspace form):
 *
 *   <DmsEntityDocumentsTab
 *     entityType="employee"
 *     entityId={employeeId}
 *     entityLabel="Employee"
 *     canUpload={hasPermission("dms.documents.upload")}
 *     canLinkExisting={hasPermission("dms.documents.edit")}
 *     canUnlink={hasPermission("dms.documents.edit")}
 *   />
 */

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FileText,
  ExternalLink,
  Link2,
  Unlink,
  Upload,
  AlertTriangle,
  Info,
  Search,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { format, isPast, differenceInDays } from "date-fns";
import { ERPChildDialogForm } from "@/components/erp/erp-child-dialog-form";
import { ERPCombobox } from "@/components/erp/combobox";
import { queryKeys } from "@/lib/query/query-keys";
import {
  invalidateDmsEntityDocuments,
  invalidateDmsAvailableForLink,
} from "@/lib/query/invalidation";
import {
  getDmsDocumentsByEntity,
  linkDmsDocumentToEntity,
  unlinkDmsDocumentFromEntity,
  getAvailableDmsDocumentsForLink,
  type DmsEntityDocumentRow,
} from "@/server/actions/dms/entity-documents";
import { getDmsEntityTypeLabel } from "@/lib/dms/dms-entity-types";
import { DmsEntityDocumentComplianceCards } from "./dms-entity-document-compliance-cards";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

export type DmsEntityDocumentsTabProps = {
  entityType: string;
  entityId: number;
  entityLabel?: string;
  canUpload?: boolean;
  canLinkExisting?: boolean;
  canUnlink?: boolean;
  compact?: boolean;
  showComplianceCards?: boolean;
  onChildOpen?: (open: boolean) => void;
};

// ── Badges ────────────────────────────────────────────────────────────────────

function ExpiryBadge({ expiryDate }: { expiryDate: string | null }) {
  if (!expiryDate) return null;
  const date = new Date(expiryDate);
  if (isPast(date)) {
    return (
      <Badge variant="destructive" className="text-xs flex items-center gap-1">
        <AlertTriangle className="h-3 w-3" /> Expired
      </Badge>
    );
  }
  const days = differenceInDays(date, new Date());
  if (days <= 30) {
    return (
      <Badge variant="outline" className="text-xs border-amber-400 text-amber-600 flex items-center gap-1">
        <AlertTriangle className="h-3 w-3" /> Expiring Soon
      </Badge>
    );
  }
  return null;
}

function RiskBadge({ level }: { level: string | null }) {
  if (!level || level === "none" || level === "low") return null;
  const map: Record<string, string> = {
    medium: "border-amber-400 text-amber-700",
    high: "border-orange-400 text-orange-700",
    critical: "border-red-500 text-red-700",
  };
  return (
    <Badge variant="outline" className={cn("text-xs capitalize", map[level])}>
      {level} Risk
    </Badge>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: "text-emerald-700 border-emerald-400",
    draft: "text-slate-600 border-slate-400",
    expired: "text-red-700 border-red-400",
    archived: "text-slate-500 border-slate-300",
    approved: "text-blue-700 border-blue-400",
    pending_review: "text-amber-700 border-amber-400",
    rejected: "text-red-600 border-red-400",
  };
  return (
    <Badge variant="outline" className={cn("text-xs capitalize", map[status] ?? "")}>
      {status.replace(/_/g, " ")}
    </Badge>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function DmsEntityDocumentsTab({
  entityType,
  entityId,
  entityLabel,
  canUpload = false,
  canLinkExisting = false,
  canUnlink = false,
  compact = false,
  showComplianceCards = true,
  onChildOpen,
}: DmsEntityDocumentsTabProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const label = entityLabel ?? getDmsEntityTypeLabel(entityType);

  // ── Documents query ──────────────────────────────────────────────────────
  const {
    data: documents,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: queryKeys.dms.entityDocuments(entityType, entityId),
    queryFn: async () => {
      const result = await getDmsDocumentsByEntity(entityType, entityId);
      if (!result.success) throw new Error(result.error ?? "Failed to load documents");
      return result.data ?? [];
    },
    staleTime: 30_000,
    enabled: !!entityType && entityId > 0,
  });

  // ── Attach existing dialog ────────────────────────────────────────────────
  const [attachOpen, setAttachOpen] = useState(false);
  const [attachSearch, setAttachSearch] = useState("");
  const [attachSelectedId, setAttachSelectedId] = useState<number | null>(null);
  const [isAttaching, setIsAttaching] = useState(false);

  const openAttach = () => {
    setAttachSelectedId(null);
    setAttachSearch("");
    setAttachOpen(true);
    onChildOpen?.(true);
  };

  const closeAttach = (open: boolean) => {
    setAttachOpen(open);
    if (!open) onChildOpen?.(false);
  };

  const { data: availableDocuments } = useQuery({
    queryKey: queryKeys.dms.attachableDocuments(entityType, entityId, attachSearch),
    queryFn: async () => {
      const result = await getAvailableDmsDocumentsForLink(entityType, entityId, attachSearch);
      return result.data ?? [];
    },
    enabled: attachOpen,
    staleTime: 10_000,
  });

  const handleAttach = async () => {
    if (!attachSelectedId) {
      toast.error("Please select a document");
      return;
    }
    setIsAttaching(true);
    try {
      const result = await linkDmsDocumentToEntity(attachSelectedId, entityType, entityId);
      if (result.success) {
        toast.success("Document linked");
        setAttachOpen(false);
        onChildOpen?.(false);
        invalidateDmsEntityDocuments(queryClient, entityType, entityId);
        invalidateDmsAvailableForLink(queryClient);
      } else {
        toast.error(result.error ?? "Failed to link document");
      }
    } finally {
      setIsAttaching(false);
    }
  };

  // ── Unlink ────────────────────────────────────────────────────────────────
  const handleUnlink = async (doc: DmsEntityDocumentRow) => {
    if (
      !confirm(
        `Unlink "${doc.title}" from this ${label}? The document will remain in DMS.`
      )
    )
      return;
    const result = await unlinkDmsDocumentFromEntity(
      doc.link_id,
      doc.document_id,
      entityType,
      entityId
    );
    if (result.success) {
      toast.success("Document unlinked");
      invalidateDmsEntityDocuments(queryClient, entityType, entityId);
    } else {
      toast.error(result.error ?? "Failed to unlink document");
    }
  };

  // ── Upload to entity ──────────────────────────────────────────────────────
  const handleUpload = () => {
    router.push(
      `/dms/inbox?entityType=${encodeURIComponent(entityType)}&entityId=${entityId}`
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Compliance Cards */}
      {showComplianceCards && !compact && entityId > 0 && (
        <DmsEntityDocumentComplianceCards entityType={entityType} entityId={entityId} />
      )}

      {/* Header / Actions */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm text-muted-foreground">
          Documents linked to this {label}. All documents are managed in the DMS repository.
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          {canLinkExisting && (
            <Button type="button" variant="outline" size="sm" onClick={openAttach}>
              <Link2 className="h-4 w-4 mr-1" />
              Attach Existing
            </Button>
          )}
          {canUpload && (
            <Button type="button" variant="outline" size="sm" onClick={handleUpload}>
              <Upload className="h-4 w-4 mr-1" />
              Upload New
            </Button>
          )}
        </div>
      </div>

      {/* Document List */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-md" />
          ))}
        </div>
      ) : !documents || documents.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center text-muted-foreground space-y-2">
          <FileText className="h-8 w-8 mx-auto opacity-30" />
          <p className="text-sm">No documents linked to this {label} yet.</p>
          {(canUpload || canLinkExisting) && (
            <p className="text-xs">
              Use <strong>Upload New</strong> or <strong>Attach Existing</strong> to add documents.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {documents.map((doc) => (
            <div
              key={doc.link_id}
              className="rounded-md border bg-card p-3 flex items-start justify-between gap-3 group hover:bg-accent/30 transition-colors"
            >
              <div className="flex items-start gap-3 min-w-0">
                <FileText className="h-5 w-5 mt-0.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs text-muted-foreground shrink-0">
                      {doc.document_no}
                    </span>
                    <StatusBadge status={doc.status} />
                    <ExpiryBadge expiryDate={doc.expiry_date} />
                    <RiskBadge level={doc.ai_risk_level} />
                    {doc.link_is_primary && (
                      <Badge variant="secondary" className="text-xs">
                        Primary
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm font-medium truncate">{doc.title}</p>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5 flex-wrap">
                    {doc.document_type_name && <span>{doc.document_type_name}</span>}
                    {doc.expiry_date && (
                      <span>
                        Expires:{" "}
                        {format(new Date(doc.expiry_date), "dd MMM yyyy")}
                      </span>
                    )}
                    {doc.completeness_score != null && (
                      <span>
                        Completeness: {Math.round(doc.completeness_score * 100)}%
                      </span>
                    )}
                    {doc.has_files && (
                      <span>
                        {doc.files_count} file{doc.files_count !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                  {doc.ai_summary && !compact && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {doc.ai_summary}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  title="Open in DMS"
                  onClick={() =>
                    router.push(`/dms/documents/record/${doc.document_id}`)
                  }
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </Button>
                {canUnlink && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Unlink document"
                    onClick={() => handleUnlink(doc)}
                  >
                    <Unlink className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Security note */}
      <div className="flex items-start gap-2 text-xs text-muted-foreground rounded-md bg-muted/40 p-2">
        <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        <span>
          Documents are stored and managed in the DMS repository. Confidential documents
          (HR, Legal, Executive) are only visible to authorized users.
        </span>
      </div>

      {/* Attach Existing Document Dialog */}
      <ERPChildDialogForm
        open={attachOpen}
        onOpenChange={closeAttach}
        title="Attach Existing Document"
        subtitle={`Link a DMS document to this ${label}`}
        icon={<Link2 className="h-5 w-5" />}
        onSubmit={handleAttach}
        isSubmitting={isAttaching}
        submitLabel="Link Document"
      >
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by document number or title..."
              className="pl-9"
              value={attachSearch}
              onChange={(e) => setAttachSearch(e.target.value)}
            />
          </div>
          <ERPCombobox
            placeholder="Select a document..."
            options={
              availableDocuments?.map((d) => ({
                value: String(d.id),
                label: `${d.document_no} — ${d.title}`,
                description: d.document_type_name ?? undefined,
              })) ?? []
            }
            value={attachSelectedId ? String(attachSelectedId) : null}
            onValueChange={(val) => setAttachSelectedId(val ? Number(val) : null)}
            required
          />
          {availableDocuments?.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-2">
              No available documents found.{" "}
              {attachSearch ? "Try a different search term." : "All documents may already be linked."}
            </p>
          )}
        </div>
      </ERPChildDialogForm>
    </div>
  );
}
