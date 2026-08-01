/**
 * DMS AI Phase 4 — Approve Storage Helpers
 *
 * Handles:
 *  - Building the deterministic final storage path (requires reserved documentId)
 *  - Copying the temp file from dms-temp to dms-documents
 *  - Cleaning up a copied final file if the DB commit fails (compensation)
 *
 * Rules:
 *  - NEVER deletes from dms-temp (handled by DMS cleanup)
 *  - Uses upsert: false to prevent overwrites
 *  - Final path is deterministic: {company}/{year}/{typeCode}/{docId}/v{ver}/original.{ext}
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

// ── Path helpers ──────────────────────────────────────────────────────────────

export function buildFinalStoragePath(params: {
  owningCompanyId: number | null;
  year: number;
  typeCode: string;
  documentId: number;
  versionNumber: number;
  ext: string;
}): string {
  const company = params.owningCompanyId ?? 0;
  return `${company}/${params.year}/${params.typeCode}/${params.documentId}/v${params.versionNumber}/original.${params.ext}`;
}

export function getFileExtension(filename: string, mimeType?: string | null): string {
  const parts = filename.split(".");
  if (parts.length > 1) return parts[parts.length - 1].toLowerCase();
  if (mimeType) {
    const m = mimeType.toLowerCase().split(";")[0].trim();
    const mimeMap: Record<string, string> = {
      "application/pdf": "pdf", "image/jpeg": "jpg", "image/jpg": "jpg",
      "image/png": "png", "image/gif": "gif", "image/webp": "webp",
      "image/tiff": "tiff", "image/heic": "heic",
      "application/msword": "doc",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
      "application/vnd.ms-excel": "xls",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
      "text/plain": "txt", "text/csv": "csv", "application/zip": "zip",
    };
    if (mimeMap[m]) return mimeMap[m];
  }
  return "pdf";
}

// ── Storage copy ──────────────────────────────────────────────────────────────

export interface StorageCopyResult {
  success: boolean;
  bucket: string;
  path: string;
  error?: string;
}

export async function copyFileToFinalStorage(
  adminClient: SupabaseClient,
  params: {
    tempBucket: string;
    tempPath: string;
    finalBucket: string;
    finalPath: string;
    mimeType: string;
  }
): Promise<StorageCopyResult> {
  const { tempBucket, tempPath, finalBucket, finalPath, mimeType } = params;

  const { data: tempBlob, error: downloadError } = await adminClient.storage
    .from(tempBucket)
    .download(tempPath);

  if (downloadError || !tempBlob) {
    return {
      success: false,
      bucket: finalBucket,
      path: finalPath,
      error: `Failed to download temp file: ${downloadError?.message ?? "unknown"}`,
    };
  }

  const { error: uploadError } = await adminClient.storage
    .from(finalBucket)
    .upload(finalPath, tempBlob, { contentType: mimeType, upsert: false });

  if (uploadError) {
    return {
      success: false,
      bucket: finalBucket,
      path: finalPath,
      error: `Failed to upload to final storage: ${uploadError.message}`,
    };
  }

  return { success: true, bucket: finalBucket, path: finalPath };
}

// ── Storage cleanup compensation ──────────────────────────────────────────────

export interface StorageCleanupResult {
  success: boolean;
  error?: string;
}

export async function cleanupFinalStorageFile(
  adminClient: SupabaseClient,
  bucket: string,
  path: string
): Promise<StorageCleanupResult> {
  try {
    const { error } = await adminClient.storage.from(bucket).remove([path]);
    if (error) {
      logger.warn("[approve-storage] cleanup failed — orphaned file may need admin removal", {
        bucket,
        path,
        error: error.message,
      });
      return { success: false, error: error.message };
    }
    logger.info("[approve-storage] cleanup successful after RPC failure", { bucket, path });
    return { success: true };
  } catch (err) {
    logger.warn("[approve-storage] cleanup exception", { bucket, path, err: String(err) });
    return { success: false, error: String(err) };
  }
}
