"use client";

import {DmsReadReady} from "@/features/dms/documents/section-read-boundary";
import {useQueryClient} from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { DmsAdminFileStoragePanel } from "@/features/dms/admin/dms-admin-file-storage-panel";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { useDmsBatchAdmission } from "@/hooks/use-dms-batch-admission";
import {useDmsSingleUploadAdmission} from '@/hooks/use-dms-single-upload-admission';
import { startAiIntakeFromUploadSession } from "@/server/actions/dms/ai-intake";
import type { DmsDocumentRow } from "@/server/actions/dms/documents";
import {
  cancelDmsUploadSession,
  createDmsUploadSession,
  completeDmsTempUpload,
  acknowledgeDmsSingleUpload,
  type CreateUploadSessionInput,
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
import { DmsUploadDropzone } from "./dms-upload-dropzone";
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
function estimateAiDuration(fileSizeBytes: number): string {
  const sizeMb = fileSizeBytes / (1024 * 1024);
  if (sizeMb < 0.4) return "15–30 seconds";
  if (sizeMb < 1.5) return "30–60 seconds";
  return "1–3 minutes (large document)";
}

type UploadMode = "single" | "batch";

export function DmsUploadInboxPageClient({ initialSessions, documents, documentTypes, entityContext, isAdmin = false, batchEnabled = false, autoStartEnabled = false }: Props) {
  const router = useRouter();
  const qc=useQueryClient();
  const [inboxReadAvailable,setInboxReadAvailable]=useState(true);
  const [sessions, setSessions] = useState<DmsUploadSessionRow[]>(initialSessions);
  const [uploadState, setUploadState] = useState<UploadState>({ phase: "idle" });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [attachDialogOpen, setAttachDialogOpen] = useState(false);
  const [createDocDialogOpen, setCreateDocDialogOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState<DmsUploadSessionRow | null>(null);

  const [uploadMode, setUploadMode] = useState<UploadMode>("single");
  const singleAdmission=useDmsSingleUploadAdmission(entityContext);
  const batchFailureRef = useRef<HTMLDivElement>(null);
  const batch = useDmsBatchAdmission({
    enabled: batchEnabled && uploadMode === "batch",
    context: entityContext,
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
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const redirectedRef = useRef(false);
  // Navigating while the server action is still in flight makes Next.js revert
  // the router.push when the action resolves ("flash back to Upload Inbox").
  // Redirects are therefore deferred until the action settles; the grace timer
  // covers the lost-response case (dev recompile, dropped connection).
  const actionSettledRef = useRef(true);
  const pendingRedirectRef = useRef<string | null>(null);

  const stopAiPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
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

  // Cleanup polling on unmount
  useEffect(() => () => stopAiPolling(), [stopAiPolling]);

  const handleAiFill = useCallback(async (session: DmsUploadSessionRow) => {
    setUploadState({ phase: "ai_processing", session });
    aiStartedAtRef.current = Date.now();
    setAiElapsedSec(0);
    redirectedRef.current = false;
    actionSettledRef.current = false;
    pendingRedirectRef.current = null;
    stopAiPolling();

    const goToReview = (sessionCode: string, msg: string) => {
      if (redirectedRef.current) return;
      redirectedRef.current = true;
      stopAiPolling();
      toast.success(msg);
      router.push(`/dms/intake/${sessionCode}`);
    };

    // Defer navigation while the server action is in flight — pushing earlier
    // gets reverted by Next.js when the action resolves (inbox tab flash bug).
    // If the action response never arrives (lost connection, dev recompile),
    // the grace timer redirects anyway after 10s.
    const requestRedirect = (sessionCode: string, msg: string) => {
      if (redirectedRef.current) return;
      if (actionSettledRef.current) {
        goToReview(sessionCode, msg);
        return;
      }
      if (pendingRedirectRef.current) return; // grace timer already armed
      pendingRedirectRef.current = sessionCode;
      setTimeout(() => {
        if (!redirectedRef.current && !actionSettledRef.current) {
          goToReview(sessionCode, msg);
        }
      }, 10_000);
    };

    // SPEED.2L: poll session status via a plain GET route (NOT a server action —
    // server actions are serialized client-side and would queue behind the
    // long-running intake action; a plain fetch also never touches the router).
    pollTimerRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/dms/intake-status?sessionId=${session.id}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as { intakeStatus?: string; sessionCode?: string };
        if (!data.sessionCode) return;
        if (data.intakeStatus === "review_pending" || data.intakeStatus === "review_in_progress") {
          requestRedirect(data.sessionCode, "AI review is ready — opening review screen…");
        } else if (data.intakeStatus === "failed") {
          stopAiPolling();
          setUploadState({
            phase: "ai_error",
            session,
            message: "AI analysis failed on the server. You can retry or create the document manually.",
          });
        }
      } catch {
        // transient poll failure — keep polling
      }
    }, 4000);

    let result: Awaited<ReturnType<typeof startAiIntakeFromUploadSession>>;
    try {
      result = await startAiIntakeFromUploadSession({ uploadSessionId: session.id });
    } catch {
      // Action fetch rejected (connection dropped). The poll owns recovery now;
      // if it already found the session ready, redirect immediately.
      actionSettledRef.current = true;
      if (pendingRedirectRef.current && !redirectedRef.current) {
        goToReview(pendingRedirectRef.current, "AI review is ready — opening review screen…");
      }
      return;
    }
    actionSettledRef.current = true;
    if (redirectedRef.current) return;

    // The poll detected completion while the action was still in flight —
    // navigate now that it has settled (safe from the router revert).
    if (pendingRedirectRef.current) {
      goToReview(pendingRedirectRef.current, "AI review is ready — opening review screen…");
      return;
    }

    if (result.success && result.data) {
      if (result.data.status === "already_processing") {
        // SPEED.2K: another run is already in flight — keep banner + polling active.
        toast.info(result.data.message ?? "AI is already analyzing this file — please wait…");
        return;
      }
      goToReview(
        result.data.sessionCode,
        result.data.status === "review_pending"
          ? "AI review is ready — opening review screen…"
          : "AI analysis complete — opening review screen…"
      );
    } else if (!result.success && result.data?.status === "provider_not_configured") {
      stopAiPolling();
      toast.error("No AI provider configured. Create the document manually instead.", { duration: 6000 });
      setUploadState({ phase: "ready", session });
    } else {
      stopAiPolling();
      setUploadState({
        phase: "ai_error",
        session,
        message: result.error ?? "AI analysis failed. You can retry or create the document manually.",
      });
    }
  }, [router, stopAiPolling]);

  const handleFileSelected = useCallback(async (
    input: CreateUploadSessionInput & { file: File }
  ) => {
    const { file, ...sessionInput } = input;
    let retained:ReturnType<typeof singleAdmission.begin>;
    try{retained=singleAdmission.begin(sessionInput);}
    catch(e){setUploadState({phase:'error',message:e instanceof Error?e.message:'Retained upload recovery is unavailable.'});return;}
    try{
    setUploadState({ phase: "uploading", progress: 0 });

    let result = await createDmsUploadSession({...sessionInput,context:retained.request.context??undefined},
      {operationId:retained.request.operationId,authUserId:retained.request.authUserId});
    if(!retained.isCurrent())return;
    if(result.recovery){
      if(!retained.recover(result.recovery))return;
      result=await createDmsUploadSession({...sessionInput,context:retained.request.context??undefined},
        {operationId:retained.request.operationId,authUserId:retained.request.authUserId});
      if(!retained.isCurrent())return;
    }
    if(result.cancelled&&result.cancelled.operationId===retained.request.operationId){
      if(retained.confirmed())setUploadState({phase:'error',message:result.error??'The prior upload is cancelled. You may now select a new file.'});
      return;
    }
    if (!result.success || !result.data) {
      setUploadState({ phase: "error", message: result.error ?? "Failed to create upload session" });
      return;
    }

    const { session:pendingSession, token, path, isDuplicate, duplicateDocument,uploadRequired } = result.data;

    if(uploadRequired){
    try {
      const supabase = createSupabaseClient();
      // SPEED.2L (Issue #2): the storage upload has no built-in timeout — a
      // stalled transfer used to leave the UI on "Uploading…" forever.
      const timeoutMs = computeUploadTimeoutMs(file.size);
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

      if (uploadError) {
        setUploadState({ phase: "error", message: `Upload failed: ${uploadError.message}` });
        toast.error(`Upload failed: ${uploadError.message}`);
        return;
      }
    } catch (e) {
      if(!retained.isCurrent())return;
      const msg = e instanceof Error ? e.message : String(e);
      setUploadState({ phase: "error", message: msg });
      toast.error(msg.startsWith("Upload timed out") ? msg : "Upload failed. Please try again.");
      return;
    }
    }

    const verified=await completeDmsTempUpload(pendingSession.id);
    if(!retained.isCurrent())return;
    if(!verified.success||!verified.data){
      setUploadState({phase:'error',message:verified.error??'Upload verification is pending. Retain the existing Inbox session.'});
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
    }finally{retained.settled();}
  }, [autoStartEnabled, handleAiFill, singleAdmission]);

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

  const handleCancelSession = async (session: DmsUploadSessionRow) => {
    const result = await cancelDmsUploadSession(session.id);
    if (!result.success) {
      toast.error(result.error ?? "Failed to cancel session");
      return;
    }
    setSessions((prev) =>
      prev.map((s) => s.id === session.id ? { ...s, status: "cancelled" } : s)
    );
    toast.success("Upload session cancelled");
    if (uploadState.phase === "ready" && uploadState.session.id === session.id) {
      setUploadState({ phase: "idle" });
    }
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
            <DmsUploadDropzone
              onFileSelected={handleFileSelected}
              disabled={uploadState.phase === "uploading"}
            />
            {uploadState.phase === "uploading" && (
              <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <div className="h-3 w-3 animate-spin rounded-full border border-primary border-t-transparent" />
                Uploading file to secure storage…
              </div>
            )}
            {uploadState.phase === "error" && (
              <div className="mt-2 text-xs text-destructive">Error: {uploadState.message}</div>
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
              {!batch.attempt ? (
                <Button type="button" size="sm" onClick={() => void batch.start()}
                  disabled={!batch.ready || batch.busy || batch.files.length === 0}>
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
              {batch.attempt?.receipt && <Button type="button" size="sm" variant="outline" onClick={() => router.push(`/dms/inbox/batch/${batch.attempt!.receipt!.batch_code}`)}>Open batch queue</Button>}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Only confirmed drafts are ready for review. Approve each one individually — no bulk approval.</p>
            {batch.busy && <p role="status" className="mt-2 text-sm">Working on the retained batch…</p>}
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
                <p className="text-sm font-medium">{batch.items.filter(i => i.phase === "confirmed").length} of {batch.items.length} drafts confirmed</p>
                <ul className="mt-2 space-y-2">{batch.items.map(item => <li key={item.position} className="text-sm"><span className="font-medium">{item.name}</span><p className="text-muted-foreground">{item.message}</p></li>)}</ul>
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

      {/* AI processing banner — honest elapsed time + size-based estimate (SPEED.2L) */}
      {uploadState.phase === "ai_processing" && (
        <div className="rounded-xl border-2 border-violet-400 bg-violet-50 dark:bg-violet-950/20 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
            <p className="text-sm font-semibold text-violet-700 dark:text-violet-400">
              AI is analyzing your document…
            </p>
            <span className="ml-auto text-xs font-mono text-violet-600 dark:text-violet-500 tabular-nums">
              {Math.floor(aiElapsedSec / 60) > 0 ? `${Math.floor(aiElapsedSec / 60)}m ${aiElapsedSec % 60}s` : `${aiElapsedSec}s`}
            </span>
          </div>
          <p className="text-xs text-violet-600 dark:text-violet-500">
            Reading file content and extracting document information. Estimated time for this file:{" "}
            <strong>{estimateAiDuration(uploadState.session.file_size_bytes)}</strong>.
            You will be redirected to the review screen automatically when it finishes.
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
          onCancel={handleCancelSession}
          onAiFill={handleAiFill}
        />
      </div>

      {/* Cleanup panel (admin only) */}
      <DmsUploadCleanupPanel isAdmin={isAdmin} />

      {/* File storage inspector (admin only) */}
      {isAdmin && <DmsAdminFileStoragePanel />}

      {/* Keep drafts mounted but retire portal actions after a failed inbox recheck. */}
      <DmsReadReady value={inboxReadAvailable}>
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
