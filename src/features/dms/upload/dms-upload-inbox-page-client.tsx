"use client";

import {DmsReadReady} from "@/features/dms/documents/section-read-boundary";
import {useReadCacheOwner} from "@/components/layout/read-cache-boundary";
import {useQueryClient} from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {AlertDialog,AlertDialogContent,AlertDialogHeader,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogCancel,AlertDialogAction} from '@/components/ui/alert-dialog';
import { DmsAdminFileStoragePanel } from "@/features/dms/admin/dms-admin-file-storage-panel";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { useDmsBatchAdmission } from "@/hooks/use-dms-batch-admission";
import type {BatchReceipt} from '@/lib/dms/batch-admission';
import {DmsUploadScopePicker} from './dms-upload-scope-picker';
import type {UploadOwningScope} from '@/lib/dms/single-upload-admission';
import {useDmsSingleUploadAdmission} from '@/hooks/use-dms-single-upload-admission';
import { startAiIntakeFromUploadSession } from "@/server/actions/dms/ai-intake";
import type { DmsDocumentRow } from "@/server/actions/dms/documents";
import {
  cancelDmsUploadSession,
  createDmsUploadSession,
  completeDmsTempUpload,
  acknowledgeDmsSingleUpload,
  type DmsUploadSessionRow,
} from "@/server/actions/dms/upload-sessions";
import { AlertTriangle, Bot, File as FileIcon, Files, FileText, Inbox, Info, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { DmsDocumentTypeOption, DmsEntityContext } from "./dms-create-document-from-upload-dialog";
import { DmsCreateDocumentFromUploadDialog } from "./dms-create-document-from-upload-dialog";
import { DmsDuplicateWarningPanel } from "./dms-duplicate-warning-panel";
import { DmsUploadAttachDialog } from "./dms-upload-attach-dialog";
import { DmsUploadCleanupPanel } from "./dms-upload-cleanup-panel";
import { DMS_MAX_BATCH_FILES } from "./dms-upload-constants";
import { DmsUploadDropzone, type SelectedDmsFile } from "./dms-upload-dropzone";
import { DmsUploadSessionTable } from "./dms-upload-session-table";

interface Props {
  initialSessions: DmsUploadSessionRow[];
  documents: DmsDocumentRow[];
  documentTypes: DmsDocumentTypeOption[];
  entityContext?: DmsEntityContext | null;
  isAdmin?: boolean;
  batchEnabled?: boolean;
  /** SPEED.2A — when true, AI analysis starts automatically after upload. */
  autoStartEnabled?: boolean;
  recoveryReceipt?: BatchReceipt;
}

type UploadState =
  | { phase: "idle" }
  | { phase: "uploading"; progress: number }
  | { phase: "duplicate"; session: DmsUploadSessionRow; duplicateDocument?: { id: number; document_no: string; title: string } | null }
  | { phase: "ready"; session: DmsUploadSessionRow }
  | { phase: "ai_processing"; session: DmsUploadSessionRow }
  | { phase: "ai_error"; session: DmsUploadSessionRow; message: string }
  | { phase: "error"; message: string };

// ── SPEED.2L: honest upload/AI timing helpers ─────────────────────────────────

/** Size-scaled upload timeout: 60s base + 30s per MB, capped at 10 minutes. */
function computeUploadTimeoutMs(fileSizeBytes: number): number {
  const sizeMb = fileSizeBytes / (1024 * 1024);
  return Math.min(60_000 + Math.round(sizeMb * 30_000), 600_000);
}

/** Honest AI duration estimate based on file size (replaces the fixed "10–30s"). */
type UploadMode = "single" | "batch";

function batchMemberProgress(phase: string): { label: string; terminal?: "complete" | "failed" | "warning" } {
  switch (phase) {
    case "uploading": return { label: "Uploading" };
    case "analysis": return { label: "Preparing AI draft" };
    case "processing": return { label: "AI analysis running" };
    case "confirmed": return { label: "Draft ready", terminal: "complete" };
    case "rejected": return { label: "Rejected", terminal: "failed" };
    case "unconfirmed": return { label: "Needs reconciliation", terminal: "warning" };
    case "unavailable": return { label: "Unavailable", terminal: "failed" };
    case "needs_file": return { label: "File required", terminal: "warning" };
    case "historical": return { label: "Reconcile in batch queue", terminal: "warning" };
    default: return { label: "Waiting" };
  }
}

export function DmsUploadInboxPageClient({ initialSessions, documents, documentTypes, entityContext, isAdmin = false, batchEnabled = false, autoStartEnabled = false, recoveryReceipt }: Props) {
  const router = useRouter();
  const qc=useQueryClient();
  const readOwner = useReadCacheOwner();
  const [inboxReadAvailable,setInboxReadAvailable]=useState(true);
  const [sessions, setSessions] = useState<DmsUploadSessionRow[]>(initialSessions);
  const [uploadState, setUploadState] = useState<UploadState>({ phase: "idle" });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [attachDialogOpen, setAttachDialogOpen] = useState(false);
  const [createDocDialogOpen, setCreateDocDialogOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState<DmsUploadSessionRow | null>(null);
  const [discardSession,setDiscardSession]=useState<DmsUploadSessionRow|null>(null);
  const [discardBusy,setDiscardBusy]=useState(false);
  const discardFlight=useRef(false);
  const singleOperationActive = useRef(false);
  const [verifyingUpload, setVerifyingUpload] = useState(false);

  const [uploadMode, setUploadMode] = useState<UploadMode>(recoveryReceipt ? "batch" : "single");
  const [owningScope,setOwningScope]=useState<UploadOwningScope|null>(null);
  const singleAdmission=useDmsSingleUploadAdmission(entityContext,entityContext?undefined:owningScope);
  const selectedOwningScope=owningScope??singleAdmission.retainedScope;
  const singleSelectionOwner=JSON.stringify([
    readOwner?.isLive() ? readOwner.identity : null, readOwner?.generation,
    entityContext?.entityType, entityContext?.entityId, selectedOwningScope?.companyId, selectedOwningScope?.branchId,
  ]);
  const batchFailureRef = useRef<HTMLDivElement>(null);
  const batch = useDmsBatchAdmission({
    enabled: batchEnabled && uploadMode === "batch",
    preparationConcurrency: process.env.NEXT_PUBLIC_DMS_BATCH_SERIAL === 'true' ? 1 : 2,
    context: entityContext,
    recoveryBatchCode: recoveryReceipt?.batch_code,
    upload: async (capability, body, mime) => {
      const {error} = await createSupabaseClient().storage.from("dms-temp")
        .uploadToSignedUrl(capability.path, capability.token, body.type===mime?body:new Blob([body],{type:mime}), {contentType: mime, upsert: false});
      return !error;
    },
    onResult: (confirmed, total, code) => {
      if (confirmed) toast.success(`${confirmed} draft${confirmed === 1 ? "" : "s"} confirmed. Review and approve each one individually.`);
      else toast.error("No draft confirmation was received. Review the retained member results.");
      if (confirmed === total) router.push(`/dms/inbox/batch/${code}`);
    },
  });
  const {failureId, ownerGeneration, isCurrent: batchIsCurrent} = batch;
  useLayoutEffect(() => {
    if (failureId && batchIsCurrent()) batchFailureRef.current?.focus();
  }, [failureId, ownerGeneration, batchIsCurrent]);

  // ── SPEED.2L: AI progress tracking + status polling ────────────────────────
  const [aiElapsedSec, setAiElapsedSec] = useState(0);
  const aiStartedAtRef = useRef<number | null>(null);
  const aiAttempt = useRef<AbortController | null>(null);
  const stopAiPolling = useCallback(() => {
    aiAttempt.current?.abort();
    aiAttempt.current = null;
  }, []);

  // Elapsed-seconds ticker while AI is running
  useEffect(() => {
    if (uploadState.phase !== "ai_processing") return;
    const timer = setInterval(() => {
      if (aiStartedAtRef.current) {
        setAiElapsedSec(Math.floor((Date.now() - aiStartedAtRef.current) / 1000));
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [uploadState.phase]);

  useLayoutEffect(() => () => stopAiPolling(), [
    stopAiPolling, readOwner, entityContext?.entityType, entityContext?.entityId,
  ]);

  const handleAiFill = useCallback(async (session: DmsUploadSessionRow) => {
    const identity = readOwner?.identity;
    if (!readOwner?.admits(identity)) return;
    stopAiPolling();
    const attempt = new AbortController();
    aiAttempt.current = attempt;
    const isCurrent = () => !attempt.signal.aborted && readOwner.admits(identity);

    setUploadState({ phase: "ai_processing", session });
    aiStartedAtRef.current = Date.now();
    setAiElapsedSec(0);

    let pollRead: AbortController | null = null;
    let redirectTimer: ReturnType<typeof setTimeout> | undefined;
    let actionSettled = false;
    let reviewReady = false;

    const stopReads = () => {
      clearInterval(pollTimer);
      pollRead?.abort();
    };
    attempt.signal.addEventListener("abort", () => {
      stopReads();
      clearTimeout(redirectTimer);
    }, { once: true });

    const goToReview = (message: string) => {
      if (!isCurrent()) return;
      stopAiPolling();
      toast.success(message);
      router.push(`/dms/intake/${session.session_code}`);
    };

    const readyMessage = "AI review is ready. Opening review screen…";

    // An independent GET sees progress while the server action is in flight.
    // Wait for the action to settle before navigating, or use a grace period
    // when the ready receipt is visible and the action response has been lost.
    const pollTimer = setInterval(async () => {
      if (!isCurrent() || pollRead || document.visibilityState === "hidden") return;
      pollRead = new AbortController();
      try {
        const res = await fetch(`/api/dms/intake-status?sessionId=${session.id}`, {
          cache: "no-store",
          signal: pollRead.signal,
        });
        if (!res.ok || !isCurrent()) return;
        const data = (await res.json()) as { intakeStatus?: string; sessionCode?: string };
        if (!isCurrent() || data.sessionCode !== session.session_code) return;
        if (data.intakeStatus === "review_pending" || data.intakeStatus === "review_in_progress") {
          reviewReady = true;
          stopReads();
          if (actionSettled) goToReview(readyMessage);
          else redirectTimer = setTimeout(() => goToReview(readyMessage), 10_000);
        } else if (data.intakeStatus === "failed") {
          stopReads();
          setUploadState({
            phase: "ai_error",
            session,
            message: "AI analysis failed on the server. You can retry or create the document manually.",
          });
        }
      } catch {
        // A failed GET leaves the current attempt available for the next poll.
      } finally {
        pollRead = null;
      }
    }, 4_000);

    let result: Awaited<ReturnType<typeof startAiIntakeFromUploadSession>>;
    try {
      result = await startAiIntakeFromUploadSession({ uploadSessionId: session.id });
    } catch {
      actionSettled = true;
      if (reviewReady) goToReview(readyMessage);
      return;
    }
    actionSettled = true;
    if (!isCurrent()) return;
    if (reviewReady) {
      goToReview(readyMessage);
      return;
    }

    if (result.success && result.data?.sessionCode === session.session_code) {
      if (result.data.status === "already_processing") {
        toast.info(result.data.message ?? "AI is already analyzing this file. Please wait…");
        return;
      }
      goToReview(readyMessage);
    } else if (result.uncertain) {
      toast.info(result.error ?? "AI analysis is unconfirmed. Checking the original upload for progress.");
    } else if (!result.success && result.data?.status === "provider_not_configured") {
      stopAiPolling();
      toast.error("No AI provider configured. Create the document manually instead.", { duration: 6000 });
      setUploadState({ phase: "ready", session });
    } else {
      stopAiPolling();
      setUploadState({ phase: "ai_error", session, message: result.error ?? "AI analysis failed" });
    }
  }, [router, readOwner, stopAiPolling]);

  const handleFileSelected = useCallback(async (
    input: SelectedDmsFile
  ) => {
    if (singleOperationActive.current) return;
    const { file, resumeSessionCode, ...sessionInput } = input;
    if(!entityContext&&!selectedOwningScope&&!singleAdmission.pending){setUploadState({phase:"error",message:"Choose an owning company before selecting a file."});return;}
    const hadPendingRequest=singleAdmission.pending;
    let retained:ReturnType<typeof singleAdmission.begin>;
    try{retained=singleAdmission.begin(sessionInput);}
    catch(e){setUploadState({phase:'error',message:e instanceof Error?e.message:'Retained upload recovery is unavailable.'});return;}
    singleOperationActive.current = true;
    try{
    setUploadState({ phase: "uploading", progress: 0 });

    let result = await createDmsUploadSession({...sessionInput,context:retained.request.context??undefined,scope:retained.request.scope},
      {operationId:retained.request.operationId,authUserId:retained.request.authUserId,...(resumeSessionCode&&{resumeSessionCode})});
    if(!retained.isCurrent())return;
    if(result.recovery){
      if(!retained.recover(result.recovery))return;
      result=await createDmsUploadSession({...sessionInput,context:retained.request.context??undefined,scope:retained.request.scope},
        {operationId:retained.request.operationId,authUserId:retained.request.authUserId,...(resumeSessionCode&&{resumeSessionCode})});
      if(!retained.isCurrent())return;
    }
    if(result.cancelled&&result.cancelled.operationId===retained.request.operationId){
      if(retained.confirmed())setUploadState({phase:'error',message:result.error??'The prior upload is cancelled. You may now select a new file.'});
      return;
    }
    if (!result.success || !result.data) {
      if(resumeSessionCode&&!hadPendingRequest&&!result.uncertain&&!result.recovery)retained.confirmed();
      setUploadState({ phase: "error", message: result.error ?? "Failed to create upload session" });
      return;
    }

    const { session:pendingSession, token, path, isDuplicate, duplicateDocument,uploadRequired } = result.data;
    let transferMs: number | undefined;
    let transferUnconfirmed = false;

    if(uploadRequired){
    try {
      const supabase = createSupabaseClient();
      // SPEED.2L (Issue #2): the storage upload has no built-in timeout — a
      // stalled transfer used to leave the UI on "Uploading…" forever.
      const timeoutMs = computeUploadTimeoutMs(file.size);
      const transferStarted = performance.now();
      const uploadPromise = supabase.storage
        .from("dms-temp")
        .uploadToSignedUrl(path, token, new Blob([file],{type:pendingSession.mime_type}), { contentType: pendingSession.mime_type,upsert:false });
      let uploadTimer:ReturnType<typeof setTimeout>|undefined;
      const timeoutPromise = new Promise<never>((_, reject) =>
        uploadTimer=setTimeout(
          () => reject(new Error(`Upload timed out after ${Math.round(timeoutMs / 1000)}s. Check your connection and try again.`)),
          timeoutMs
        )
      );
      const { error: uploadError } = await Promise.race([uploadPromise, timeoutPromise]).finally(()=>clearTimeout(uploadTimer));
      if(!retained.isCurrent())return;

      if (uploadError) transferUnconfirmed = true;
      else transferMs = performance.now() - transferStarted;
    } catch {
      if(!retained.isCurrent())return;
      transferUnconfirmed = true;
    }
    }

    const verified=await (transferMs===undefined?completeDmsTempUpload(pendingSession.id):completeDmsTempUpload(pendingSession.id,transferMs));
    if(!retained.isCurrent())return;
    if(!verified.success||!verified.data){
      setUploadState({phase:'error',message:transferUnconfirmed
        ? 'The transfer could not be confirmed. Reselect the exact original file to resume this upload.'
        : verified.error??'Upload verification is pending. Retain the existing Inbox session.'});
      return;
    }
    const session=verified.data;
    const acknowledged=await acknowledgeDmsSingleUpload(retained.request,session.id);
    if(!retained.isCurrent())return;
    if(!acknowledged.success){setUploadState({phase:'error',message:acknowledged.error??'Upload acknowledgment is unconfirmed. Reselect the same original file.'});return;}
    if(!retained.confirmed())return;
    setSessions((prev) => [session, ...prev.filter(s=>s.id!==session.id)]);

    if (isDuplicate) {
      setUploadState({ phase: "duplicate", session, duplicateDocument });
    } else if (autoStartEnabled) {
      // SPEED.2A: start AI analysis immediately — no button click needed.
      toast.success("File uploaded — starting AI analysis…");
      void handleAiFill(session);
    } else {
      setUploadState({ phase: "ready", session });
      toast.success("File uploaded successfully! Choose what to do with it.");
    }
    }catch{
      if(retained.isCurrent())setUploadState({phase:'error',message:'Upload outcome is unconfirmed. Reselect the same original file to recover this request; do not start another copy.'});
    } finally {
      singleOperationActive.current = false;
      retained.settled();
    }
  }, [autoStartEnabled, handleAiFill, singleAdmission, entityContext, selectedOwningScope]);

  const handleCancelDuplicate = () => {
    if (uploadState.phase === "duplicate") {
      handleCancelSession(uploadState.session);
    }
    setUploadState({ phase: "idle" });
  };

  const handleContinueDuplicate = () => {
    if (uploadState.phase === "duplicate") {
      setUploadState({ phase: "ready", session: uploadState.session });
    }
  };

  const handleAttach = (session: DmsUploadSessionRow) => {
    setSelectedSession(session);
    setAttachDialogOpen(true);
  };

  const handleCreateDocument = (session: DmsUploadSessionRow) => {
    setSelectedSession(session);
    setCreateDocDialogOpen(true);
  };

  const handleVerifyStoredUpload = async (sessionId: number) => {
    if (singleOperationActive.current) return;
    const identity = readOwner?.identity;
    const isCurrent = () => !!identity && !!readOwner?.isLive() && readOwner.admits(identity);
    if (!isCurrent()) return;
    singleOperationActive.current = true;
    setVerifyingUpload(true);
    try {
      const result = await completeDmsTempUpload(sessionId);
      if (!isCurrent()) return;
      const session = result.data;
      if (!result.success || session?.id !== sessionId || session.status !== 'uploaded') {
        toast.error(result.error ?? 'Verification is unconfirmed. Keep this upload and retry verification.');
        return;
      }
      setSessions(previous => [session, ...previous.filter(row => row.id !== session.id)]);
      setUploadState(session.is_duplicate
        ? {phase: 'duplicate', session, duplicateDocument: session.duplicate_document}
        : {phase: 'ready', session});
      toast.success('Stored file verified. Continue from this upload.');
    } catch {
      if (isCurrent()) toast.error('Verification is unconfirmed. Keep this upload and retry verification.');
    } finally {
      singleOperationActive.current = false;
      setVerifyingUpload(false);
    }
  };

  const handleCancelSession = async (session: DmsUploadSessionRow) => {
    if(discardFlight.current)return;
    discardFlight.current=true;setDiscardBusy(true);
    try{
    const result = await cancelDmsUploadSession(session.id);
    if (!result.success) {
      toast.error(result.error ?? "Failed to cancel session");
      return;
    }
    setSessions((prev) =>
      prev.map((s) => s.id === session.id ? { ...s, status: "cancelled" } : s)
    );
    toast.success("Upload discarded from the Inbox. Files and history are retained.");
    setDiscardSession(null);
    if (uploadState.phase === "ready" && uploadState.session.id === session.id) {
      setUploadState({ phase: "idle" });
    }
    }catch{toast.error('Discard is unconfirmed. Retry this same Inbox item; do not upload it again.');}
    finally{discardFlight.current=false;setDiscardBusy(false);}
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {await qc.invalidateQueries({queryKey:["dms","inbox","sessions"]});router.refresh();} finally {setIsRefreshing(false);}
  };

  const handleAttachSuccess = () => {
    void qc.invalidateQueries({queryKey:["dms","inbox","sessions"]});
    setUploadState({ phase: "idle" });
    router.refresh();
  };


  const batchRunning = batch.busy;

  return (
    <div className="space-y-6">
      {/* Entity context banner */}
      {entityContext && (
        <div className="rounded-md border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30 px-3 py-2 text-xs text-blue-800 dark:text-blue-300 flex items-start gap-2">
          <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>
            Context active: Files uploaded and new documents created here will be automatically
            linked to <strong>{entityContext.entityType.replace(/_/g, " ")} #{entityContext.entityId}</strong>.
          </span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Inbox className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-base font-semibold">Upload Inbox</h2>
          <span className="text-xs text-muted-foreground">
            Counted, searchable active sessions
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isRefreshing}
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isRefreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Upload area */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium">Upload File{uploadMode === "batch" ? "s" : ""}</h3>
          {batchEnabled && (
            <div className="inline-flex rounded-lg border bg-muted/30 p-0.5">
              <button
                type="button"
                onClick={() => setUploadMode("single")}
                disabled={batchRunning}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  uploadMode === "single" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <FileIcon className="h-3.5 w-3.5" />
                Single File
              </button>
              <button
                type="button"
                onClick={() => setUploadMode("batch")}
                disabled={batchRunning}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  uploadMode === "batch" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Files className="h-3.5 w-3.5" />
                Multiple Files (Batch)
              </button>
            </div>
          )}
        </div>

        {uploadMode === "single" ? (
          <>
            {!entityContext&&<DmsUploadScopePicker value={selectedOwningScope} onChange={setOwningScope} disabled={verifyingUpload||singleAdmission.pending||uploadState.phase==='uploading'}/>}
            <DmsUploadDropzone
              key={singleSelectionOwner}
              onFileSelected={handleFileSelected}
              recoverVerified={singleAdmission.pending}
              disabled={verifyingUpload||uploadState.phase === "uploading"||(!entityContext&&!selectedOwningScope&&!singleAdmission.pending)}
            />
            {uploadState.phase === "uploading" && (
              <div role="status" className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <div className="h-3 w-3 animate-spin rounded-full border border-primary border-t-transparent" />
                Uploading file to secure storage…
              </div>
            )}
            {uploadState.phase === "error" && (
              <div role="alert" className="mt-2 text-xs text-destructive">{uploadState.message}</div>
            )}
          </>
        ) : (
          <>
            {(batch.error || batch.failureId > 0) && <div ref={batchFailureRef} tabIndex={-1} role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">{batch.error ?? "Some batch members remain unresolved. Review the member results and recover the original requests."}</div>}
            {!batch.ready && !batch.error && <p role="status" className="text-sm text-muted-foreground">Checking the active inbox owner…</p>}
            <DmsUploadDropzone
              multiple
              maxFiles={DMS_MAX_BATCH_FILES}
              files={batch.files}
              ownerGeneration={batch.ownerGeneration}
              disabled={batch.busy}
              onFilesSelected={batch.setFiles}
            />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {recoveryReceipt && !batch.attempt && <div className="w-full rounded border border-border p-3 text-sm">
                <p>Continue original batch {recoveryReceipt.batch_code}. Select the original files; names, sizes and hashes must match. Existing stored files and drafts will be reused.</p>
                <Button type="button" size="sm" disabled={!batch.ready || batch.busy} onClick={() => void batch.adopt(recoveryReceipt)}>Open original batch recovery</Button>
              </div>}
              {!batch.attempt ? (
                <Button type="button" size="sm" onClick={() => void batch.start()}
                  disabled={!!recoveryReceipt || !batch.ready || batch.busy || batch.files.length === 0}>
                  <Bot className="h-3.5 w-3.5 mr-1.5" />
                  Upload &amp; AI Fill All ({batch.files.length})
                </Button>
              ) : (
                <Button type="button" size="sm" onClick={() => void batch.resume()} disabled={!batch.ready || batch.busy}>
                  Recover retained batch
                </Button>
              )}
              <Button type="button" size="sm" variant="outline" onClick={() => void batch.discover()} disabled={!batch.ready || batch.busy}>Find recent admissions</Button>
              {batch.canStartAnother && <Button type="button" size="sm" variant="outline" onClick={batch.startAnother} disabled={!batch.ready || batch.busy}>Start another batch</Button>}
              {batch.attempt?.receipt && <Button type="button" size="sm" variant="outline" disabled={batch.busy} onClick={() => router.push(`/dms/inbox/batch/${batch.attempt!.receipt!.batch_code}`)}>Open batch queue</Button>}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Only confirmed drafts are ready for review. Approve each one individually — no bulk approval.</p>
            {batch.busy && batch.items.length === 0 && <p role="status" className="mt-2 text-sm">Checking the retained batch…</p>}
            {batch.retentionError && <p role="alert" className="mt-2 text-sm text-destructive">Retained numbered requests could not be read. Reconcile the batch before continuing.</p>}
            {batch.pendingSessionIds.length > 0 && (
              <div className="mt-3 space-y-2">
                <p className="text-sm">Unconfirmed numbered requests retain their original operation. Recovery checks the admission before retrying.</p>
                {batch.pendingSessionIds.map(id => {
                  const member = batch.attempt?.receipt?.members.find(m => m.id === id);
                  return <Button type="button" key={id} variant="outline" size="sm" disabled={!batch.ready || batch.busy || !member}
                    onClick={() => member && void batch.resume(member.position)}>Retry draft #{id}</Button>;
                })}
              </div>
            )}
            {batch.items.length > 0 && (
              <section aria-label="Batch member results" className="mt-3 rounded-md border p-3">
                <p role="status" className="text-sm font-medium">{batch.items.filter(i => i.phase === "confirmed").length} of {batch.items.length} drafts confirmed</p>
                <ul className="mt-2 space-y-3">{batch.items.map(item => {
                  const progress = batchMemberProgress(item.phase);
                  return <li key={item.position} className="space-y-1.5 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="min-w-0 truncate font-medium" title={item.name}>{item.name}</span>
                      <span className={cn("shrink-0 text-xs", progress.terminal === "complete" ? "text-green-700 dark:text-green-300" : progress.terminal === "failed" ? "text-destructive" : progress.terminal === "warning" ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground")}>
                        {progress.label}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">{item.message}</p>
                    {['unavailable','unconfirmed','rejected','needs_file','historical','processing'].includes(item.phase)&&<Button type="button" size="sm" variant="outline" disabled={!batch.ready||batch.busy} onClick={()=>void batch.resume(item.position)}>Recover file {item.position+1}</Button>}
                  </li>;
                })}</ul>
              </section>
            )}
            {batch.recent.length > 0 && <section aria-label="Recent admissions" className="mt-3 space-y-2">
              <p className="text-sm">Recent admissions (up to 20). This is not a complete history.</p>
              {batch.recent.map(receipt => <Button type="button" key={receipt.operation_id} size="sm" variant="outline"
                disabled={!batch.ready || batch.busy} onClick={() => void batch.adopt(receipt)}>Open admission {receipt.batch_code}</Button>)}
            </section>}
          </>
        )}
      </div>

      {/* Duplicate warning */}
      {uploadState.phase === "duplicate" && (
        <DmsDuplicateWarningPanel
          duplicateDocument={uploadState.duplicateDocument}
          onContinueAnyway={handleContinueDuplicate}
          onCancel={handleCancelDuplicate}
        />
      )}

      {/* AI processing banner — current stage and elapsed time */}
      {uploadState.phase === "ai_processing" && (
        <div className="rounded-xl border-2 border-violet-400 bg-violet-50 dark:bg-violet-950/20 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
            <p role="status" className="text-sm font-semibold text-violet-700 dark:text-violet-400">
              AI is analyzing your document…
            </p>
            <span className="ml-auto text-xs font-mono text-violet-600 dark:text-violet-500 tabular-nums">
              {Math.floor(aiElapsedSec / 60) > 0 ? `${Math.floor(aiElapsedSec / 60)}m ${aiElapsedSec % 60}s` : `${aiElapsedSec}s`}
            </span>
          </div>
          <p className="text-xs text-violet-600 dark:text-violet-500">
            The review opens automatically when the result is saved.
          </p>
        </div>
      )}

      {/* AI error banner — explicit retry guidance instead of silent revert (SPEED.2L) */}
      {uploadState.phase === "ai_error" && (
        <div className="rounded-xl border-2 border-red-400 bg-red-50 dark:bg-red-950/20 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <p className="text-sm font-semibold text-red-700 dark:text-red-400">
              AI analysis failed
            </p>
          </div>
          <p className="text-xs text-red-600 dark:text-red-500">{uploadState.message}</p>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              onClick={() => handleAiFill(uploadState.session)}
              className="bg-violet-600 hover:bg-violet-700 text-white"
            >
              <Bot className="h-3.5 w-3.5 mr-1.5" />
              Retry AI Fill
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleCreateDocument(uploadState.session)}
            >
              <FileText className="h-3.5 w-3.5 mr-1.5" />
              Create Manually
            </Button>
          </div>
        </div>
      )}

      {/* Ready to attach banner */}
      {uploadState.phase === "ready" && (
        <div className="rounded-xl border-2 border-green-400 bg-green-50 dark:bg-green-950/20 p-4 space-y-3">
          <p className="text-sm font-semibold text-green-700 dark:text-green-400">
            File ready — choose what to do
          </p>
          <p className="text-xs text-green-600 dark:text-green-500">
            Let AI fill in the document details automatically, or choose another option.
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              onClick={() => handleAiFill(uploadState.session)}
              className="bg-violet-600 hover:bg-violet-700 text-white"
            >
              <Bot className="h-3.5 w-3.5 mr-1.5" />
              Upload &amp; AI Fill
            </Button>
            <Button aria-label="Run &quot;Upload & AI Fill&quot; first — attaching as a version now requires AI review"
              variant="outline"
              size="sm"
              disabled
              title="Run &quot;Upload & AI Fill&quot; first — attaching as a version now requires AI review"
            >
              Attach to existing document
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleCreateDocument(uploadState.session)}
            >
              <FileText className="h-3.5 w-3.5 mr-1.5" />
              Create Manually
            </Button>
          </div>
        </div>
      )}

      {/* Upload sessions table */}
      <div>
        <h3 className="text-sm font-medium mb-3">Upload Sessions</h3>
        <DmsUploadSessionTable
          sessions={sessions}
          onReadAvailable={setInboxReadAvailable}
          onAttach={handleAttach}
          onCreateDocument={handleCreateDocument}
          onCancel={setDiscardSession}
          onVerify={handleVerifyStoredUpload}
          verificationBusy={verifyingUpload || uploadState.phase === 'uploading'}
          isSubmitting={discardBusy}
          onAiFill={handleAiFill}
        />
      </div>

      {/* Cleanup panel (admin only) */}
      <DmsUploadCleanupPanel isAdmin={isAdmin} />

      {/* File storage inspector (admin only) */}
      {isAdmin && <DmsAdminFileStoragePanel />}

      {/* Keep drafts mounted but retire portal actions after a failed inbox recheck. */}
      <DmsReadReady value={inboxReadAvailable}>
      <AlertDialog open={!!discardSession} onOpenChange={open=>{if(!open&&!discardBusy)setDiscardSession(null);}}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard this upload?</AlertDialogTitle>
            <AlertDialogDescription>
              {discardSession?.original_filename} will leave the active Inbox. Any uncommitted approval will be cancelled; its original files, reference and history stay retained. A completed document cannot be discarded here.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={discardBusy}>Keep upload</AlertDialogCancel>
            <AlertDialogAction disabled={discardBusy} onClick={event=>{event.preventDefault();if(discardSession)void handleCancelSession(discardSession);}}>{discardBusy?'Discarding…':'Discard upload'}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <DmsUploadAttachDialog
        open={attachDialogOpen}
        onOpenChange={setAttachDialogOpen}
        session={selectedSession}
        documents={documents}
        onSuccess={handleAttachSuccess}
      />

      <DmsCreateDocumentFromUploadDialog
        open={createDocDialogOpen}
        onOpenChange={setCreateDocDialogOpen}
        session={selectedSession}
        documentTypes={documentTypes}
        entityContext={entityContext}
        onSuccess={handleAttachSuccess}
      />
      </DmsReadReady>
    </div>
  );
}
