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

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FileText,
  ExternalLink,
  Link2,
  Unlink,
  Upload,
  AlertTriangle,
  Info,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { format, isPast, differenceInDays } from "date-fns";
import { ERPChildDialogForm } from "@/components/erp/erp-child-dialog-form";
import type {AuthContext} from "@/lib/rbac/check";
import {useDmsEntityDocuments} from "@/hooks/use-dms-entity-documents";
import {useRecordReadActive} from "@/hooks/use-record-read-active";
import {dmsEntityDocumentsIdentity} from "@/lib/reads/dms-entity-documents-schema";
import {
  invalidateDmsEntityDocuments,
  invalidateDmsAvailableForLink,
} from "@/lib/query/invalidation";
import {
  linkDmsDocumentToEntity,
  unlinkDmsDocumentFromEntity,
  type DmsEntityDocumentRow,
} from "@/server/actions/dms/entity-documents";
import { getDmsEntityTypeLabel, type DmsEntityTypeValue } from "@/lib/dms/dms-entity-types";
import { DmsEntityDocumentComplianceCards } from "./dms-entity-document-compliance-cards";
import { DmsAttachDocumentPicker } from "./dms-attach-document-picker";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

export type DmsEntityDocumentsTabProps = {
  authContext: AuthContext;
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

export function DmsEntityDocumentsTab(props:DmsEntityDocumentsTabProps) {
  return <EntityDocumentsInstance key={JSON.stringify([dmsEntityDocumentsIdentity(props.authContext),props.entityType,props.entityId])} {...props}/>;
}
function EntityDocumentsInstance({
  authContext,
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
  const active=useRecordReadActive();
  const queryClient = useQueryClient();
  const label = entityLabel ?? getDmsEntityTypeLabel(entityType);

  const [blocked,setBlocked]=useState(false),[offset,setOffset]=useState(0),[attachOffset,setAttachOffset]=useState(0);
  const [attachOpen, setAttachOpen] = useState(false);
  const [attachSearch, setAttachSearch] = useState("");
  const [attachSelectedIds, setAttachSelectedIds] = useState<number[]>([]);
  const [isAttaching, setIsAttaching] = useState(false);
  const [selectionWarning,setSelectionWarning]=useState("");
  const alive=useRef(true),childEpoch=useRef(0),childIsOpen=useRef(false),busy=useRef(false),unlinkBusy=useRef(false);
  const onChildOpenRef=useRef(onChildOpen);
  useLayoutEffect(()=>{onChildOpenRef.current=onChildOpen;},[onChildOpen]);
  useLayoutEffect(()=>{const shown=active&&attachOpen&&!blocked;if(shown!==childIsOpen.current){childIsOpen.current=shown;onChildOpenRef.current?.(shown);}if(!active)childEpoch.current++;},[active,attachOpen,blocked]);
  useLayoutEffect(()=>{alive.current=true;return()=>{alive.current=false;if(childIsOpen.current)onChildOpenRef.current?.(false);};},[]);
  const retire=useCallback(()=>{setBlocked(true);childEpoch.current++;setAttachOpen(false);setAttachSelectedIds([]);if(childIsOpen.current)onChildOpenRef.current?.(false);childIsOpen.current=false;},[]);
  const parent={entityType:entityType as DmsEntityTypeValue,entityId};
  const list=useDmsEntityDocuments(authContext,{...parent,operation:"list",offset,limit:25},{enabled:!blocked,onDenied:retire});
  const parentReady=!blocked&&list.data?.availability==="available";
  const attach=useDmsEntityDocuments(authContext,{...parent,operation:"attach",search:attachSearch,offset:attachOffset,limit:25},{enabled:attachOpen&&parentReady,onDenied:retire});
  const selected=useDmsEntityDocuments(authContext,{...parent,operation:"selected",documentIds:attachSelectedIds.length?attachSelectedIds:[1]},{enabled:attachOpen&&parentReady&&attachSelectedIds.length>0,onDenied:retire});
  const documents=list.data?.availability==="available"?list.data.rows:undefined;
  const availableDocuments=attach.data?.availability==="available"?attach.data.rows:undefined;
  const renderEpoch=childEpoch.current;
  const selectedReady=selected.data?.availability==="available"&&attachSelectedIds.length>0;
  useEffect(()=>{let current=true;if(list.data?.availability==="unavailable")queueMicrotask(()=>{if(current)retire();});return()=>{current=false;};},[list.data?.availability,retire]);
  useEffect(()=>{let current=true;if(selected.data?.availability==="unavailable")queueMicrotask(()=>{if(current){setAttachSelectedIds([]);setSelectionWarning("The selected documents are no longer available. Select them again from the current list.");}});return()=>{current=false;};},[selected.data]);

  const openAttach = () => {
    if(!parentReady||!list.isCurrent()||busy.current)return;
    childEpoch.current++;childIsOpen.current=true;setSelectionWarning("");setAttachOffset(0);
    setAttachSelectedIds([]);
    setAttachSearch("");
    setAttachOpen(true);
    onChildOpen?.(true);
  };

  const toggleAttachSelection = (documentId: number) => {
    if(busy.current||!attach.isCurrent()||!availableDocuments?.some(d=>d.id===documentId))return;
    setSelectionWarning("");
    setAttachSelectedIds((prev) =>
      prev.includes(documentId) ? prev.filter((id) => id !== documentId) : prev.length<100?[...prev, documentId]:prev
    );
  };

  const closeAttach = (open: boolean) => {
    if(!alive.current||renderEpoch!==childEpoch.current)return;
    if(!open){childEpoch.current++;childIsOpen.current=false;setAttachSelectedIds([]);}
    setAttachOpen(open);
    if (!open) onChildOpen?.(false);
  };

  const handleAttach = async () => {
    if(!alive.current||renderEpoch!==childEpoch.current||blocked||busy.current||!parentReady||!list.isCurrent()||!selectedReady||!selected.isCurrent())return;
    if (attachSelectedIds.length === 0) {
      toast.error("Please select at least one document");
      return;
    }
    busy.current=true;setIsAttaching(true);
    try {
      const results = await Promise.all(
        attachSelectedIds.map((docId) => linkDmsDocumentToEntity(docId, entityType, entityId))
      );
      const failed = results.filter((r) => !r.success);
      const succeededCount = results.length - failed.length;
      if(succeededCount>0){invalidateDmsEntityDocuments(queryClient,entityType,entityId);invalidateDmsAvailableForLink(queryClient);}
      if(!alive.current||renderEpoch!==childEpoch.current)return;
      if (succeededCount > 0) {
        toast.success(
          succeededCount === 1 ? "Document linked" : `${succeededCount} documents linked`
        );
      }
      if (failed.length > 0) {
        toast.error(
          failed.length === 1
            ? failed[0]?.error ?? "Failed to link a document"
            : `${failed.length} document(s) could not be linked`
        );
      }
      if (failed.length === 0) {
        childEpoch.current++;childIsOpen.current=false;setAttachSelectedIds([]);
        setAttachOpen(false);
        onChildOpen?.(false);
      }
    } catch {
      // A lost response does not prove the mutation failed; retire the selected
      // admission and refresh before allowing another explicit attempt.
      invalidateDmsEntityDocuments(queryClient,entityType,entityId);invalidateDmsAvailableForLink(queryClient);
      if(alive.current&&renderEpoch===childEpoch.current){setAttachSelectedIds([]);setSelectionWarning("The link result could not be confirmed. Refresh and check existing links before retrying.");}
    } finally {
      busy.current=false;if(alive.current)setIsAttaching(false);
    }
  };

  // ── Unlink ────────────────────────────────────────────────────────────────
  const handleUnlink = async (doc: DmsEntityDocumentRow) => {
    if(!alive.current||blocked||unlinkBusy.current||!parentReady||!list.isCurrent()||!documents?.some(d=>d.link_id===doc.link_id&&d.document_id===doc.document_id))return;
    if (
      !confirm(
        `Unlink "${doc.title}" from this ${label}? The document will remain in DMS.`
      )
    )
      return;
    unlinkBusy.current=true;
    try {const result = await unlinkDmsDocumentFromEntity(
      doc.link_id,
      doc.document_id,
      entityType,
      entityId
    );
    if (result.success) {
      invalidateDmsEntityDocuments(queryClient, entityType, entityId);
      if(alive.current)toast.success("Document unlinked");
    } else if(alive.current) {
      toast.error(result.error ?? "Failed to unlink document");
    }}catch{invalidateDmsEntityDocuments(queryClient,entityType,entityId);if(alive.current)toast.error("The unlink result could not be confirmed. Refresh before retrying.");}finally{unlinkBusy.current=false;}
  };

  // ── Upload to entity ──────────────────────────────────────────────────────
  const handleUpload = () => {
    if(!parentReady||!list.isCurrent())return;
    router.push(
      `/dms/inbox?entityType=${encodeURIComponent(entityType)}&entityId=${entityId}`
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Compliance Cards */}
      {showComplianceCards && !compact && entityId > 0 && (
        <DmsEntityDocumentComplianceCards authContext={authContext} entityType={entityType} entityId={entityId} enabled={!blocked} onDenied={retire}/>
      )}

      {/* Header / Actions */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm text-muted-foreground">
          Documents linked to this {label}. All documents are managed in the DMS repository.
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <Button aria-label="Refresh"
            type="button"
            variant="ghost"
            size="sm"
            onClick={list.retry}
            disabled={blocked||list.isFetching}
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          {canLinkExisting && (
            <Button type="button" variant="outline" size="sm" onClick={openAttach} disabled={!parentReady||isAttaching}>
              <Link2 className="h-4 w-4 mr-1" />
              Attach Existing
            </Button>
          )}
          {canUpload && (
            <Button type="button" variant="outline" size="sm" onClick={handleUpload} disabled={!parentReady}>
              <Upload className="h-4 w-4 mr-1" />
              Upload New
            </Button>
          )}
        </div>
      </div>

      {/* Document List */}
      {blocked||list.denied ? <p role="alert">Access to this record&apos;s documents could not be verified.</p> : list.isError ? <div role="alert">Documents could not be loaded. <Button type="button" onClick={list.retry}>Retry documents</Button></div> : list.data?.availability==="too_large" ? <p role="alert">This linked set exceeds the safe read budget. No partial list is shown. Contact your administrator.</p> : list.isPending||list.isFetching ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-md" />
          ))}
        </div>
      ) : documents?.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center text-muted-foreground space-y-2">
          <FileText className="h-8 w-8 mx-auto opacity-30" />
          <p className="text-sm">{list.data?.availability==="available"&&list.data.totalCount>0?"No documents on this page. Return to the previous page.":`No visible documents linked to this ${label} yet.`}</p>
          {(canUpload || canLinkExisting) && (
            <p className="text-xs">
              Use <strong>Upload New</strong> or <strong>Attach Existing</strong> to add documents.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {documents?.map((doc) => (
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
                <Button aria-label="Open in DMS"
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  title="Open in DMS"
                  onClick={() =>
                    list.isCurrent()&&router.push(`/dms/documents/record/${doc.document_id}`)
                  }
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </Button>
                {canUnlink && (
                  <Button aria-label="Unlink document"
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
      {list.data?.availability==="available"&&<div className="flex items-center gap-3 text-sm"><span>{list.data.totalCount} visible linked documents</span><Button type="button" variant="outline" disabled={offset===0} onClick={()=>setOffset(Math.max(0,offset-25))}>Previous documents</Button><Button type="button" variant="outline" disabled={offset+25>=list.data.totalCount} onClick={()=>setOffset(offset+25)}>Next documents</Button></div>}

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
        open={attachOpen&&active&&!blocked}
        onOpenChange={closeAttach}
        title="Attach Existing Document"
        subtitle={`Link one or more DMS documents to this ${label}`}
        icon={<Link2 className="h-5 w-5" />}
        size="lg"
        onSubmit={handleAttach}
        isSubmitting={isAttaching}
        submitDisabled={!parentReady||!selectedReady||selected.isFetching||selected.isError||blocked}
        submitLabel={
          attachSelectedIds.length > 1
            ? `Link ${attachSelectedIds.length} Documents`
            : "Link Document"
        }
      >
        {selectionWarning&&<p role="alert">{selectionWarning}</p>}
        {selected.isError&&attachSelectedIds.length>0&&<div role="alert">Selected documents could not be checked. <Button type="button" onClick={selected.retry}>Retry selection</Button></div>}
        {selected.data?.availability==="too_large"&&<p role="alert">The selected set exceeds the safe read budget. Select fewer documents.</p>}
        <DmsAttachDocumentPicker
          search={attachSearch}
          onSearchChange={value=>{if(!busy.current){setAttachSearch(value);setAttachOffset(0);}}}
          documents={availableDocuments ?? []}
          isLoading={!parentReady||attach.isPending||attach.isFetching}
          errorMessage={attach.isError?"Available documents could not be loaded.":attach.data?.availability==="too_large"?"This search exceeds the safe read budget. Refine the search; no partial matches are shown.":attach.data?.availability==="unavailable"?"These document choices are unavailable.":undefined}
          onRetry={attach.retry}
          page={attach.data?.availability==="available"?{offset:attachOffset,limit:25,totalCount:attach.data.totalCount,onOffsetChange:setAttachOffset}:undefined}
          disabled={isAttaching}
          selectedIds={attachSelectedIds}
          onToggle={toggleAttachSelection}
        />
      </ERPChildDialogForm>
    </div>
  );
}
