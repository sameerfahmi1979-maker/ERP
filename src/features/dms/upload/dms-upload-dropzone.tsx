"use client";

import { useRef, useState, useCallback } from "react";
import { UploadCloud, AlertCircle, CheckCircle2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DMS_ALLOWED_EXTENSIONS, DMS_MAX_FILE_SIZE_BYTES } from "./dms-upload-constants";
import type { CreateUploadSessionInput } from "@/server/actions/dms/upload-sessions";
import { formatFileSize } from "./dms-file-size";
import { FileTypeIcon } from "./dms-file-type-icon";

export type SelectedDmsFile = CreateUploadSessionInput & { file: File };

interface DmsUploadDropzoneProps {
  /** Single-file callback (existing behaviour). */
  onFileSelected?: (input: SelectedDmsFile) => void;
  /** Multi-file callback (DMS 13 batch mode). Emits the full current selection. */
  onFilesSelected?: (inputs: SelectedDmsFile[]) => void;
  /** Enable multi-file selection. */
  multiple?: boolean;
  /** Max files when multiple (default 10). */
  maxFiles?: number;
  disabled?: boolean;
}

async function computeSha256(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function validateFile(file: File): string | null {
  if (file.size > DMS_MAX_FILE_SIZE_BYTES) {
    return `File too large: ${formatFileSize(file.size)}. Maximum is 50 MB.`;
  }
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!DMS_ALLOWED_EXTENSIONS.includes(ext)) {
    return `File type '.${ext}' is not allowed. Accepted: ${DMS_ALLOWED_EXTENSIONS.join(", ")}`;
  }
  if (file.type && !file.type.includes("octet-stream")) {
    const allowed = [
      "application/pdf", "image/jpeg", "image/png", "image/tiff", "image/webp",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ];
    if (!allowed.includes(file.type)) {
      return `MIME type '${file.type}' is not allowed.`;
    }
  }
  return null;
}

export function DmsUploadDropzone({
  onFileSelected,
  onFilesSelected,
  multiple = false,
  maxFiles = 10,
  disabled,
}: DmsUploadDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isHashing, setIsHashing] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<SelectedDmsFile[]>([]);
  // Mirrors `selectedFiles` so we can compute merges without a state-updater
  // side effect (which would call the parent's setState during render).
  const selectedFilesRef = useRef<SelectedDmsFile[]>([]);

  // ── Single-file mode ────────────────────────────────────────────────────────
  const processSingle = useCallback(async (file: File) => {
    setValidationError(null);
    setSelectedFile(null);
    const err = validateFile(file);
    if (err) {
      setValidationError(err);
      return;
    }
    setIsHashing(true);
    try {
      const sha256_hash = await computeSha256(file);
      setSelectedFile(file);
      onFileSelected?.({
        original_filename: file.name,
        mime_type: file.type || "application/octet-stream",
        file_size_bytes: file.size,
        sha256_hash,
        file,
      });
    } catch {
      setValidationError("Failed to compute file hash. Please try again.");
    } finally {
      setIsHashing(false);
    }
  }, [onFileSelected]);

  // ── Multi-file mode ─────────────────────────────────────────────────────────
  const processMultiple = useCallback(async (files: File[]) => {
    setValidationError(null);
    if (files.length === 0) return;

    setIsHashing(true);
    try {
      const next: SelectedDmsFile[] = [];
      const errors: string[] = [];
      for (const file of files) {
        const err = validateFile(file);
        if (err) {
          errors.push(`${file.name}: ${err}`);
          continue;
        }
        const sha256_hash = await computeSha256(file);
        next.push({
          original_filename: file.name,
          mime_type: file.type || "application/octet-stream",
          file_size_bytes: file.size,
          sha256_hash,
          file,
        });
      }

      // De-dupe within the selection by hash + name; cap at maxFiles.
      const merged = [...selectedFilesRef.current];
      for (const f of next) {
        if (merged.some((m) => m.sha256_hash === f.sha256_hash && m.original_filename === f.original_filename)) continue;
        if (merged.length >= maxFiles) {
          errors.push(`Maximum ${maxFiles} files per batch — "${f.original_filename}" skipped.`);
          continue;
        }
        merged.push(f);
      }
      selectedFilesRef.current = merged;
      setSelectedFiles(merged);
      onFilesSelected?.(merged);

      if (errors.length > 0) setValidationError(errors.join(" • "));
    } catch {
      setValidationError("Failed to read one or more files. Please try again.");
    } finally {
      setIsHashing(false);
    }
  }, [maxFiles, onFilesSelected]);

  const removeFile = useCallback((hash: string, name: string) => {
    const next = selectedFilesRef.current.filter((f) => !(f.sha256_hash === hash && f.original_filename === name));
    selectedFilesRef.current = next;
    setSelectedFiles(next);
    onFilesSelected?.(next);
  }, [onFilesSelected]);

  const clearAll = useCallback(() => {
    selectedFilesRef.current = [];
    setSelectedFiles([]);
    onFilesSelected?.([]);
  }, [onFilesSelected]);

  // ── Event handlers ────────────────────────────────────────────────────────
  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;
    if (multiple) await processMultiple(files);
    else await processSingle(files[0]);
  }, [disabled, multiple, processMultiple, processSingle]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setIsDragging(true);
  }, [disabled]);

  const handleDragLeave = useCallback(() => setIsDragging(false), []);

  const handleChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) {
      if (multiple) await processMultiple(files);
      else await processSingle(files[0]);
    }
    if (inputRef.current) inputRef.current.value = "";
  }, [multiple, processMultiple, processSingle]);

  return (
    <div className="space-y-3">
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={cn(
          "relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 transition-colors cursor-pointer",
          isDragging
            ? "border-primary bg-primary/5"
            : "border-border bg-muted/10 hover:border-primary/50 hover:bg-muted/20",
          disabled && "opacity-50 cursor-not-allowed"
        )}
        onClick={() => !disabled && inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          multiple={multiple}
          accept=".pdf,.jpg,.jpeg,.png,.tif,.tiff,.webp,.doc,.docx,.xls,.xlsx"
          className="hidden"
          onChange={handleChange}
          disabled={disabled}
        />

        {isHashing ? (
          <>
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="text-sm text-muted-foreground">Reading file{multiple ? "s" : ""}…</p>
          </>
        ) : !multiple && selectedFile ? (
          <>
            <CheckCircle2 className="h-10 w-10 text-green-500" />
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">{selectedFile.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{formatFileSize(selectedFile.size)}</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => { e.stopPropagation(); setSelectedFile(null); inputRef.current?.click(); }}
              disabled={disabled}
            >
              Change file
            </Button>
          </>
        ) : (
          <>
            <UploadCloud className="h-10 w-10 text-muted-foreground" />
            <div className="text-center">
              <p className="text-sm font-medium">
                {multiple ? `Drag and drop up to ${maxFiles} files here` : "Drag and drop a file here"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">or click to browse</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
            >
              Browse files
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              PDF, JPEG, PNG, TIFF, WebP, DOC, DOCX, XLS, XLSX · Max 50 MB{multiple ? ` · Up to ${maxFiles} files` : ""}
            </p>
          </>
        )}
      </div>

      {validationError && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
          <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
          <p className="text-xs text-destructive">{validationError}</p>
        </div>
      )}

      {/* Single-file confirmation chip */}
      {!multiple && selectedFile && !validationError && (
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/20 px-3 py-2">
          <FileTypeIcon mimeType={selectedFile.type} />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate">{selectedFile.name}</p>
            <p className="text-xs text-muted-foreground">{formatFileSize(selectedFile.size)}</p>
          </div>
          <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
        </div>
      )}

      {/* Multi-file selected list */}
      {multiple && selectedFiles.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">
              Selected files ({selectedFiles.length}/{maxFiles})
            </p>
            <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={clearAll} disabled={disabled}>
              Clear all
            </Button>
          </div>
          <ul className="space-y-1.5">
            {selectedFiles.map((f) => (
              <li key={`${f.sha256_hash}-${f.original_filename}`} className="flex items-center gap-2 rounded-md border border-border bg-muted/20 px-3 py-2">
                <FileTypeIcon mimeType={f.mime_type} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{f.original_filename}</p>
                  <p className="text-xs text-muted-foreground">{formatFileSize(f.file_size_bytes)}</p>
                </div>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); removeFile(f.sha256_hash, f.original_filename); }}
                  className="text-muted-foreground hover:text-destructive shrink-0"
                  disabled={disabled}
                  aria-label={`Remove ${f.original_filename}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
