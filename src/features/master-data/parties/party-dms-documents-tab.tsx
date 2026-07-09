"use client";

import { useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Plus,
  ExternalLink,
  Link2,
  Unlink,
  Upload,
  FileText,
  AlertTriangle,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import { format, isPast, differenceInDays } from "date-fns";
import { ERPChildDialogForm } from "@/components/erp/erp-child-dialog-form";
import { DmsAttachDocumentPicker } from "@/features/dms/entity-documents/dms-attach-document-picker";
import { queryKeys } from "@/lib/query/query-keys";
import {
  invalidatePartyDmsDocuments,
  invalidateDmsEntityDocuments,
} from "@/lib/query/invalidation";
import {
  getPartyDmsDocuments,
  attachExistingDmsDocumentToParty,
  unlinkDmsDocumentFromParty,
  getAvailableDmsDocumentsForPartyLink,
} from "@/server/actions/master-data/party-dms-documents";
import type { DmsEntityDocumentRow } from "@/server/actions/dms/entity-documents";

type PartyDmsDocumentsTabProps = {
  partyId: number;
  disabled?: boolean;
  onChildOpen?: (open: boolean) => void;
};

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

function FileBadge({ hasFiles, filesCount }: { hasFiles: boolean; filesCount: number }) {
  if (hasFiles) {
    return (
      <Badge variant="outline" className="text-xs border-emerald-400 text-emerald-700">
        {filesCount} File{filesCount !== 1 ? "s" : ""}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-xs text-muted-foreground">
      No File
    </Badge>
  );
}

function MigratedBadge({ migrated }: { migrated: boolean }) {
  if (!migrated) return null;
  return (
    <Badge variant="secondary" className="text-xs">
      Migrated
    </Badge>
  );
}

function DocumentStatusBadge({ status }: { status: string }) {
  const variants: Record<string, string> = {
    active: "text-emerald-700 border-emerald-400",
    draft: "text-slate-600 border-slate-400",
    expired: "text-red-700 border-red-400",
    archived: "text-slate-500 border-slate-300",
    approved: "text-blue-700 border-blue-400",
    pending_review: "text-amber-700 border-amber-400",
    rejected: "text-red-600 border-red-400",
  };
  return (
    <Badge variant="outline" className={`text-xs capitalize ${variants[status] ?? ""}`}>
      {status.replace(/_/g, " ")}
    </Badge>
  );
}

export function PartyDmsDocumentsTab({
  partyId,
  disabled,
  onChildOpen,
}: PartyDmsDocumentsTabProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: documents, isLoading } = useQuery({
    queryKey: queryKeys.dms.partyDmsDocuments(partyId),
    queryFn: async () => {
      const result = await getPartyDmsDocuments(partyId);
      if (!result.success) throw new Error(result.error ?? "Failed to load documents");
      return result.data ?? [];
    },
    staleTime: 30_000,
  });

  // ── Attach existing document dialog ───────────────────────────────────────
  const [attachOpen, setAttachOpen] = useState(false);
  const [attachSearch, setAttachSearch] = useState("");
  const [attachSelectedIds, setAttachSelectedIds] = useState<number[]>([]);
  const [isAttaching, setIsAttaching] = useState(false);

  const openAttach = () => {
    setAttachSelectedIds([]);
    setAttachSearch("");
    setAttachOpen(true);
    onChildOpen?.(true);
  };

  const toggleAttachSelection = (documentId: number) => {
    setAttachSelectedIds((prev) =>
      prev.includes(documentId) ? prev.filter((id) => id !== documentId) : [...prev, documentId]
    );
  };

  const closeAttach = (open: boolean) => {
    setAttachOpen(open);
    if (!open) onChildOpen?.(false);
  };

  const { data: availableDocuments, isLoading: attachDocsLoading } = useQuery({
    queryKey: queryKeys.dms.availableForLink({ partyId, search: attachSearch }),
    queryFn: async () => {
      const result = await getAvailableDmsDocumentsForPartyLink(partyId, attachSearch);
      return result.data ?? [];
    },
    enabled: attachOpen,
    staleTime: 10_000,
  });

  const handleAttach = async () => {
    if (attachSelectedIds.length === 0) {
      toast.error("Please select at least one document");
      return;
    }
    setIsAttaching(true);
    try {
      const results = await Promise.all(
        attachSelectedIds.map((docId) => attachExistingDmsDocumentToParty(partyId, docId))
      );
      const failed = results.filter((r) => !r.success);
      const succeededCount = results.length - failed.length;

      if (succeededCount > 0) {
        toast.success(
          succeededCount === 1 ? "Document linked to party" : `${succeededCount} documents linked to party`
        );
        invalidatePartyDmsDocuments(queryClient, partyId);
        invalidateDmsEntityDocuments(queryClient, "party", partyId);
      }
      if (failed.length > 0) {
        toast.error(
          failed.length === 1
            ? failed[0]?.error ?? "Failed to link a document"
            : `${failed.length} document(s) could not be linked`
        );
      }
      if (failed.length === 0) {
        setAttachOpen(false);
        onChildOpen?.(false);
      }
    } finally {
      setIsAttaching(false);
    }
  };

  // ── Unlink ────────────────────────────────────────────────────────────────
  const handleUnlink = async (doc: DmsEntityDocumentRow) => {
    if (!confirm(`Unlink "${doc.title}" from this party? The document will remain in DMS.`)) return;
    const result = await unlinkDmsDocumentFromParty(partyId, doc.link_id, doc.document_id);
    if (result.success) {
      toast.success("Document unlinked from party");
      invalidatePartyDmsDocuments(queryClient, partyId);
      invalidateDmsEntityDocuments(queryClient, "party", partyId);
    } else {
      toast.error(result.error ?? "Failed to unlink document");
    }
  };

  // ── Open in DMS ───────────────────────────────────────────────────────────
  const handleOpenInDms = useCallback(
    (documentId: number) => {
      router.push(`/dms/documents/record/${documentId}`);
    },
    [router]
  );

  // ── Navigate to upload inbox with party context ───────────────────────────
  const handleUpload = useCallback(() => {
    router.push(`/dms/inbox?entity_type=party&entity_id=${partyId}`);
  }, [router, partyId]);

  // ── Navigate to create metadata-only document with party context ──────────
  const handleCreateMetadata = useCallback(() => {
    router.push(`/dms/documents/record/new?entity_type=party&entity_id=${partyId}`);
  }, [router, partyId]);

  if (isLoading) return <Skeleton className="h-32 w-full" />;

  return (
    <div className="space-y-4">
      {/* DMS info banner */}
      <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800 flex items-start gap-2 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300">
        <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <span>
          Party documents are now managed by DMS. Existing legacy party document metadata has been
          migrated and linked to this party. File upload is handled through the DMS Upload Inbox.
        </span>
      </div>

      {/* Action bar */}
      {!disabled && (
        <div className="flex flex-wrap gap-2 justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleUpload}
            className="gap-1.5"
          >
            <Upload className="h-3.5 w-3.5" /> Upload Document
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCreateMetadata}
            className="gap-1.5"
          >
            <FileText className="h-3.5 w-3.5" /> Create Metadata-only
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={openAttach}
            className="gap-1.5"
          >
            <Link2 className="h-3.5 w-3.5" /> Attach Existing DMS Doc
          </Button>
        </div>
      )}

      {/* Documents list */}
      {(documents ?? []).length === 0 ? (
        <div className="rounded-md border border-dashed border-muted-foreground/30 py-8 text-center text-sm text-muted-foreground">
          <FileText className="mx-auto h-8 w-8 opacity-30 mb-2" />
          No DMS documents linked to this party yet.
        </div>
      ) : (
        <div className="space-y-2">
          {(documents ?? []).map((doc) => (
            <div
              key={doc.link_id}
              className="rounded-md border p-3 flex items-start justify-between gap-3 hover:border-muted-foreground/50 transition-colors"
            >
              <div className="space-y-1.5 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="text-xs font-mono shrink-0">
                    DMS
                  </Badge>
                  <span className="font-mono text-xs text-muted-foreground">{doc.document_no}</span>
                  {doc.legacy_document_code && (
                    <span className="text-xs text-muted-foreground">
                      Legacy: {doc.legacy_document_code}
                    </span>
                  )}
                  <DocumentStatusBadge status={doc.status} />
                  <MigratedBadge migrated={!!doc.migrated_from_table} />
                  <FileBadge hasFiles={doc.has_files} filesCount={doc.files_count} />
                  <ExpiryBadge expiryDate={doc.expiry_date} />
                </div>

                <div className="font-medium text-sm truncate">{doc.title}</div>

                <div className="text-xs text-muted-foreground flex flex-wrap gap-2">
                  {doc.document_type_name && <span>{doc.document_type_name}</span>}
                  {doc.issue_date && (
                    <span>· Issued: {format(new Date(doc.issue_date), "dd MMM yyyy")}</span>
                  )}
                  {doc.expiry_date && (
                    <span>· Expires: {format(new Date(doc.expiry_date), "dd MMM yyyy")}</span>
                  )}
                </div>
              </div>

              <div className="flex gap-1 shrink-0">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => handleOpenInDms(doc.document_id)}
                  title="Open in DMS"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open
                </Button>
                {!disabled && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => handleUnlink(doc)}
                    title="Unlink from party"
                  >
                    <Unlink className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Attach existing DMS document dialog */}
      <ERPChildDialogForm
        open={attachOpen}
        onOpenChange={closeAttach}
        title="Attach Existing DMS Document"
        subtitle="Search and link one or more existing DMS documents to this party"
        icon={<Link2 className="h-5 w-5" />}
        mode="add"
        size="lg"
        isSubmitting={isAttaching}
        onSubmit={handleAttach}
        submitLabel={
          attachSelectedIds.length > 1
            ? `Link ${attachSelectedIds.length} Documents`
            : "Link Document"
        }
      >
        <DmsAttachDocumentPicker
          search={attachSearch}
          onSearchChange={setAttachSearch}
          documents={availableDocuments ?? []}
          isLoading={attachDocsLoading}
          selectedIds={attachSelectedIds}
          onToggle={toggleAttachSelection}
        />
      </ERPChildDialogForm>
    </div>
  );
}
