"use client";

import { useState, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Upload, AlertTriangle } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ERPChildDialogForm } from "@/components/erp/erp-child-dialog-form";
import { FileTypeIcon } from "./dms-file-type-icon";
import { FileSize } from "./dms-file-size";
import {
  createDmsUploadSession,
  type CreateUploadSessionInput,
} from "@/server/actions/dms/upload-sessions";
import { attachUploadToExistingDocument } from "@/server/actions/dms/document-upload-attach";
import {
  invalidateDmsDocumentFiles,
  invalidateDmsDocumentVersions,
  invalidateDmsDocumentFileStorage,
} from "@/lib/query/invalidation";
import {
  DMS_ALLOWED_MIME_TYPES,
  DMS_ALLOWED_EXTENSIONS,
  DMS_MAX_FILE_SIZE_BYTES,
} from "./dms-upload-constants";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

async function computeSha256(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

interface DmsUploadNewVersionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentId: number;
  documentNo: string;
  onSuccess?: () => void;
}

type UploadPhase =
  | "idle"
  | "hashing"
  | "uploading"
  | "attaching"
  | "done"
  | "error";

export function DmsUploadNewVersionDialog({
  open,
  onOpenChange,
  documentId,
  documentNo,
  onSuccess,
}: DmsUploadNewVersionDialogProps) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [versionLabel, setVersionLabel] = useState("");
  const [changeNotes, setChangeNotes] = useState("");
  const [phase, setPhase] = useState<UploadPhase>("idle");
  const [phaseMessage, setPhaseMessage] = useState("");
  const [isDuplicateWarning, setIsDuplicateWarning] = useState(false);
  const [allowDuplicate, setAllowDuplicate] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const reset = () => {
    setSelectedFile(null);
    setVersionLabel("");
    setChangeNotes("");
    setPhase("idle");
    setPhaseMessage("");
    setIsDuplicateWarning(false);
    setAllowDuplicate(false);
    setIsSubmitting(false);
  };

  const handleClose = (v: boolean) => {
    if (!isSubmitting) {
      if (!v) reset();
      onOpenChange(v);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    if (!file) return;

    if (!(DMS_ALLOWED_MIME_TYPES as readonly string[]).includes(file.type)) {
      toast.error(`File type not allowed: ${file.type}`);
      return;
    }
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!DMS_ALLOWED_EXTENSIONS.includes(ext)) {
      toast.error(`File extension not allowed: .${ext}`);
      return;
    }
    if (file.size > DMS_MAX_FILE_SIZE_BYTES) {
      toast.error("File exceeds maximum size of 50 MB");
      return;
    }

    setSelectedFile(file);
    setPhase("idle");
    setIsDuplicateWarning(false);
  };

  const handleSubmit = useCallback(async () => {
    if (!selectedFile) {
      toast.error("Please select a file");
      return;
    }

    setIsSubmitting(true);

    try {
      // Step 1: Hash
      setPhase("hashing");
      setPhaseMessage("Computing file hash…");
      const sha256 = await computeSha256(selectedFile);

      // Step 2: Create upload session
      setPhase("uploading");
      setPhaseMessage("Creating upload session…");
      const sessionInput: CreateUploadSessionInput = {
        original_filename: selectedFile.name,
        mime_type: selectedFile.type,
        file_size_bytes: selectedFile.size,
        sha256_hash: sha256,
      };

      const sessionResult = await createDmsUploadSession(sessionInput);
      if (!sessionResult.success || !sessionResult.data) {
        setPhase("error");
        setPhaseMessage(sessionResult.error ?? "Failed to create upload session");
        toast.error(sessionResult.error ?? "Failed to create upload session");
        return;
      }

      const { session, signedUrl, token, path, isDuplicate } = sessionResult.data;

      if (isDuplicate && !allowDuplicate) {
        setIsDuplicateWarning(true);
        setPhase("idle");
        setPhaseMessage("Duplicate file detected. Enable override to proceed.");
        return;
      }

      // Step 3: Upload to dms-temp
      setPhaseMessage("Uploading file to secure staging…");
      const supabase = createClient(supabaseUrl, supabaseAnonKey);
      const { error: uploadError } = await supabase.storage
        .from("dms-temp")
        .uploadToSignedUrl(path, token, selectedFile, { contentType: selectedFile.type });

      if (uploadError) {
        setPhase("error");
        setPhaseMessage(`Upload failed: ${uploadError.message}`);
        toast.error(`Upload failed: ${uploadError.message}`);
        return;
      }

      // Step 4: Attach to document as new version
      setPhase("attaching");
      setPhaseMessage("Creating new document version…");
      const attachResult = await attachUploadToExistingDocument({
        uploadSessionId: session.id,
        documentId,
        versionLabel: versionLabel || undefined,
        changeNotes: changeNotes || undefined,
        allowDuplicate: isDuplicate && allowDuplicate,
      });

      if (!attachResult.success) {
        setPhase("error");
        setPhaseMessage(attachResult.error ?? "Failed to attach file");
        toast.error(attachResult.error ?? "Failed to attach file");
        return;
      }

      // Success
      setPhase("done");
      toast.success("New version uploaded successfully");
      invalidateDmsDocumentFiles(queryClient, documentId);
      invalidateDmsDocumentVersions(queryClient, documentId);
      invalidateDmsDocumentFileStorage(queryClient, documentId);

      setTimeout(() => {
        handleClose(false);
        onSuccess?.();
      }, 800);
    } finally {
      setIsSubmitting(false);
    }
  }, [selectedFile, versionLabel, changeNotes, allowDuplicate, documentId, queryClient]);

  const phaseLabel: Record<UploadPhase, string> = {
    idle: "Upload Version",
    hashing: "Hashing…",
    uploading: "Uploading…",
    attaching: "Creating Version…",
    done: "Done",
    error: "Upload Version",
  };

  return (
    <ERPChildDialogForm
      open={open}
      onOpenChange={handleClose}
      title="Upload New Version"
      subtitle={`Upload a new file version for document ${documentNo}`}
      icon={<Upload className="h-5 w-5" />}
      mode="add"
      size="md"
      isSubmitting={isSubmitting}
      onSubmit={handleSubmit}
      submitLabel={phaseLabel[phase]}
    >
      <div className="space-y-4">
        {/* File input */}
        <div>
          <Label className="mb-1.5 block">
            File <span className="text-destructive">*</span>
          </Label>
          {selectedFile ? (
            <div className="flex items-center gap-3 p-3 rounded-md border border-border bg-muted/10">
              <FileTypeIcon mimeType={selectedFile.type} className="h-5 w-5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{selectedFile.name}</p>
                <p className="text-xs text-muted-foreground">
                  <FileSize bytes={selectedFile.size} /> · {selectedFile.type}
                </p>
              </div>
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setSelectedFile(null);
                  if (inputRef.current) inputRef.current.value = "";
                }}
              >
                Change
              </button>
            </div>
          ) : (
            <div
              className="rounded-md border-2 border-dashed border-muted-foreground/30 p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => inputRef.current?.click()}
            >
              <Upload className="h-6 w-6 text-muted-foreground/50 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                Click to select a file or drag it here
              </p>
              <p className="text-xs text-muted-foreground/70 mt-1">Max 50 MB</p>
            </div>
          )}
          <input
            ref={inputRef}
            type="file"
            accept={DMS_ALLOWED_MIME_TYPES.join(",")}
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

        {/* Duplicate warning */}
        {isDuplicateWarning && (
          <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/20 px-3 py-2 text-xs text-amber-700 dark:text-amber-400 flex items-start gap-2">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">Duplicate file detected</p>
              <p>This file already exists in the DMS. Enable the override below to proceed anyway.</p>
              <label className="flex items-center gap-1.5 mt-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowDuplicate}
                  onChange={(e) => setAllowDuplicate(e.target.checked)}
                  className="rounded"
                />
                Allow duplicate upload
              </label>
            </div>
          </div>
        )}

        {/* Version label */}
        <div>
          <Label htmlFor="version-label" className="mb-1.5 block">
            Version Label <span className="text-xs text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="version-label"
            value={versionLabel}
            onChange={(e) => setVersionLabel(e.target.value)}
            placeholder="e.g. 2026 Renewal"
            maxLength={100}
          />
        </div>

        {/* Change notes */}
        <div>
          <Label htmlFor="change-notes" className="mb-1.5 block">
            Change Notes <span className="text-xs text-muted-foreground">(optional)</span>
          </Label>
          <Textarea
            id="change-notes"
            value={changeNotes}
            onChange={(e) => setChangeNotes(e.target.value)}
            placeholder="What changed in this version?"
            rows={3}
            maxLength={2000}
          />
        </div>

        {/* Phase indicator */}
        {(phase === "hashing" || phase === "uploading" || phase === "attaching") && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <div className="h-3 w-3 animate-spin rounded-full border border-primary border-t-transparent" />
            {phaseMessage}
          </div>
        )}
        {phase === "error" && (
          <div className="rounded-md border border-red-300 bg-red-50 dark:bg-red-950/20 px-3 py-2 text-xs text-red-700 dark:text-red-400">
            {phaseMessage}
          </div>
        )}
      </div>
    </ERPChildDialogForm>
  );
}
