"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Inbox, RefreshCw, Info, Bot, FileText, File as FileIcon, Files } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DmsUploadDropzone, type SelectedDmsFile } from "./dms-upload-dropzone";
import { DMS_MAX_BATCH_FILES } from "./dms-upload-constants";
import { DmsUploadSessionTable } from "./dms-upload-session-table";
import { DmsDuplicateWarningPanel } from "./dms-duplicate-warning-panel";
import { DmsUploadAttachDialog } from "./dms-upload-attach-dialog";
import { DmsCreateDocumentFromUploadDialog } from "./dms-create-document-from-upload-dialog";
import { DmsUploadCleanupPanel } from "./dms-upload-cleanup-panel";
import { DmsAdminFileStoragePanel } from "@/features/dms/admin/dms-admin-file-storage-panel";
import { DmsBatchUploadProgress, type BatchFileProgress } from "./dms-batch-upload-progress";
import {
  createDmsUploadSession,
  cancelDmsUploadSession,
  type DmsUploadSessionRow,
  type CreateUploadSessionInput,
} from "@/server/actions/dms/upload-sessions";
import { startAiIntakeFromUploadSession } from "@/server/actions/dms/ai-intake";
import {
  createDmsUploadBatch,
  startAiIntakeAndCreateDraft,
} from "@/server/actions/dms/batch-intake";
import type { DmsDocumentRow } from "@/server/actions/dms/documents";
import type { DmsDocumentTypeOption, DmsEntityContext } from "./dms-create-document-from-upload-dialog";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";

interface Props {
  initialSessions: DmsUploadSessionRow[];
  documents: DmsDocumentRow[];
  documentTypes: DmsDocumentTypeOption[];
  entityContext?: DmsEntityContext | null;
  isAdmin?: boolean;
  batchEnabled?: boolean;
}

type UploadState =
  | { phase: "idle" }
  | { phase: "uploading"; progress: number }
  | { phase: "duplicate"; session: DmsUploadSessionRow; duplicateDocument?: { id: number; document_no: string; title: string } | null }
  | { phase: "ready"; session: DmsUploadSessionRow }
  | { phase: "ai_processing"; session: DmsUploadSessionRow }
  | { phase: "error"; message: string };

type BatchState =
  | { phase: "idle" }
  | { phase: "running"; progress: BatchFileProgress[]; batchCode: string | null };

type UploadMode = "single" | "batch";

export function DmsUploadInboxPageClient({ initialSessions, documents, documentTypes, entityContext, isAdmin = false, batchEnabled = false }: Props) {
  const router = useRouter();
  const [sessions, setSessions] = useState<DmsUploadSessionRow[]>(initialSessions);
  const [uploadState, setUploadState] = useState<UploadState>({ phase: "idle" });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [attachDialogOpen, setAttachDialogOpen] = useState(false);
  const [createDocDialogOpen, setCreateDocDialogOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState<DmsUploadSessionRow | null>(null);

  const [uploadMode, setUploadMode] = useState<UploadMode>("single");
  const [batchFiles, setBatchFiles] = useState<SelectedDmsFile[]>([]);
  const [batchState, setBatchState] = useState<BatchState>({ phase: "idle" });

  const handleFileSelected = useCallback(async (
    input: CreateUploadSessionInput & { file: File }
  ) => {
    const { file, ...sessionInput } = input;

    setUploadState({ phase: "uploading", progress: 0 });

    const result = await createDmsUploadSession(sessionInput);
    if (!result.success || !result.data) {
      setUploadState({ phase: "error", message: result.error ?? "Failed to create upload session" });
      return;
    }

    const { session, signedUrl, token, path, isDuplicate, duplicateDocument } = result.data;

    try {
      const supabase = createSupabaseClient();
      const { error: uploadError } = await supabase.storage
        .from("dms-temp")
        .uploadToSignedUrl(path, token, file, { contentType: file.type });

      if (uploadError) {
        setUploadState({ phase: "error", message: `Upload failed: ${uploadError.message}` });
        toast.error(`Upload failed: ${uploadError.message}`);
        return;
      }
    } catch (e) {
      setUploadState({ phase: "error", message: String(e) });
      toast.error("Upload failed. Please try again.");
      return;
    }

    setSessions((prev) => [session, ...prev]);

    if (isDuplicate) {
      setUploadState({ phase: "duplicate", session, duplicateDocument });
    } else {
      setUploadState({ phase: "ready", session });
      toast.success("File uploaded successfully! Choose what to do with it.");
    }
  }, []);

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

  const handleAiFill = useCallback(async (session: DmsUploadSessionRow) => {
    setUploadState({ phase: "ai_processing", session });
    const result = await startAiIntakeFromUploadSession({ uploadSessionId: session.id });
    if (result.success && result.data) {
      const msg = result.data.status === "review_pending"
        ? "AI review is ready — opening review screen…"
        : "AI analysis complete — opening review screen…";
      toast.success(msg);
      router.push(`/dms/intake/${result.data.sessionCode}`);
    } else if (!result.success && result.data?.status === "provider_not_configured") {
      toast.error("No AI provider configured. Create the document manually instead.", { duration: 6000 });
      setUploadState({ phase: "ready", session });
    } else {
      toast.error(result.error ?? "AI analysis failed. You can retry or create manually.");
      setUploadState({ phase: "ready", session });
    }
  }, [router]);

  // ── Batch: upload all + AI draft per file (sequential, one-by-one approval later) ──
  const handleStartBatch = useCallback(async () => {
    if (batchFiles.length === 0) return;

    const files = batchFiles;
    const progress: BatchFileProgress[] = files.map((f) => ({ name: f.original_filename, phase: "pending" }));
    setBatchState({ phase: "running", progress: [...progress], batchCode: null });

    const updateProgress = (i: number, patch: Partial<BatchFileProgress>) => {
      progress[i] = { ...progress[i], ...patch };
      setBatchState((s) => (s.phase === "running" ? { ...s, progress: [...progress] } : s));
    };

    const createRes = await createDmsUploadBatch({
      files: files.map((f) => ({
        original_filename: f.original_filename,
        mime_type: f.mime_type,
        file_size_bytes: f.file_size_bytes,
        sha256_hash: f.sha256_hash,
      })),
      entityType: entityContext?.entityType,
      entityId: entityContext?.entityId,
    });

    if (!createRes.success || !createRes.data) {
      toast.error(createRes.error ?? "Failed to create batch");
      setBatchState({ phase: "idle" });
      return;
    }

    const { batchCode, sessions: batchSessions } = createRes.data;
    setBatchState((s) => (s.phase === "running" ? { ...s, batchCode } : s));

    const supabase = createSupabaseClient();

    for (let i = 0; i < batchSessions.length; i++) {
      const sess = batchSessions[i];
      const file = files[i]?.file;
      if (!file) { updateProgress(i, { phase: "failed", error: "File missing" }); continue; }

      // Upload to signed URL.
      updateProgress(i, { phase: "uploading" });
      try {
        const { error: upErr } = await supabase.storage
          .from("dms-temp")
          .uploadToSignedUrl(sess.path, sess.token ?? "", file, { contentType: file.type });
        if (upErr) { updateProgress(i, { phase: "failed", error: upErr.message }); continue; }
      } catch (e) {
        updateProgress(i, { phase: "failed", error: String(e) });
        continue;
      }

      // AI-process + create draft (failure isolated per file).
      updateProgress(i, { phase: "ai" });
      const draftRes = await startAiIntakeAndCreateDraft({ uploadSessionId: sess.sessionId, allowDuplicate: sess.isDuplicate });
      updateProgress(i, draftRes.success ? { phase: "done" } : { phase: "failed", error: draftRes.error });
    }

    const created = progress.filter((p) => p.phase === "done").length;
    if (created > 0) {
      toast.success(`${created} draft${created === 1 ? "" : "s"} created. Review and approve each one individually.`);
    } else {
      toast.error("No drafts were created. Check the file results below.");
    }

    setBatchFiles([]);
    router.push(`/dms/inbox/batch/${batchCode}`);
  }, [batchFiles, entityContext, router]);

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
    router.refresh();
    setTimeout(() => setIsRefreshing(false), 1000);
  };

  const handleAttachSuccess = () => {
    setUploadState({ phase: "idle" });
    router.refresh();
  };

  const activeSessions = sessions.filter(
    (s) => s.status !== "cancelled" && s.status !== "expired"
  );

  const batchRunning = batchState.phase === "running";

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
            ({activeSessions.length} active session{activeSessions.length !== 1 ? "s" : ""})
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
            {batchState.phase === "running" ? (
              <DmsBatchUploadProgress
                files={batchState.progress}
                batchCode={batchState.batchCode}
                onOpenQueue={() => batchState.batchCode && router.push(`/dms/inbox/batch/${batchState.batchCode}`)}
              />
            ) : (
              <>
                <DmsUploadDropzone
                  multiple
                  maxFiles={DMS_MAX_BATCH_FILES}
                  onFilesSelected={setBatchFiles}
                />
                <div className="mt-3 flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={handleStartBatch}
                    disabled={batchFiles.length === 0}
                    className="bg-violet-600 hover:bg-violet-700 text-white"
                  >
                    <Bot className="h-3.5 w-3.5 mr-1.5" />
                    Upload &amp; AI Fill All ({batchFiles.length})
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Each file becomes a separate AI draft. You review &amp; approve each one individually — no bulk approval.
                  </p>
                </div>
              </>
            )}
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

      {/* AI processing banner */}
      {uploadState.phase === "ai_processing" && (
        <div className="rounded-xl border-2 border-violet-400 bg-violet-50 dark:bg-violet-950/20 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
            <p className="text-sm font-semibold text-violet-700 dark:text-violet-400">
              AI is analyzing your document…
            </p>
          </div>
          <p className="text-xs text-violet-600 dark:text-violet-500">
            Reading file content and extracting document information. This may take 10–30 seconds.
          </p>
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
            <Button
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

      {/* Dialogs */}
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
    </div>
  );
}
