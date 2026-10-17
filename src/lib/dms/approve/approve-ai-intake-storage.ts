/**
 * DMS AI Phase 4 — Approve Storage Helpers
 *
 * Handles:
 *  - Building the deterministic final storage path (requires reserved documentId)
 *  - Copying the temp file from dms-temp to dms-documents
 *  - Reconciling an existing final copy by exact bytes, never compensation
 *
 * Rules:
 *  - NEVER deletes from dms-temp (handled by DMS cleanup)
 *  - Uses upsert: false to prevent overwrites
 *  - Final path is deterministic: {company}/{year}/{typeCode}/{docId}/v{ver}/original.{ext}
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {readBoundedDmsObject,verifyDmsBlob} from '@/server/dms-file-verification';
import {z} from 'zod';
const objectIdentity=z.object({id:z.string().uuid(),version:z.string().min(1),lastModified:z.string().datetime({offset:true})});

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
  evidence?: {object:z.infer<typeof objectIdentity>;sha256:string};
}

export async function copyFileToFinalStorage(
  adminClient: SupabaseClient,
  params: {
    tempBucket: string;
    tempPath: string;
    finalBucket: string;
    finalPath: string;
    mimeType: string;
    originalFilename: string;
    fileSizeBytes: number;
    sha256Hash: string | null;
  }
): Promise<StorageCopyResult> {
  const {tempBucket,tempPath,finalBucket,finalPath}=params;
  try{
    const expected={name:params.originalFilename,mime:params.mimeType,size:params.fileSizeBytes,sha256:params.sha256Hash};
    const temp=await readBoundedDmsObject(adminClient.storage.from(tempBucket),tempPath,expected.size);
    const proof=await verifyDmsBlob(temp,expected);
    // A copy response can be lost or report an existing object. Neither proves
    // failure or success. Reconcile this exact destination; never overwrite it.
    try{await adminClient.storage.from(finalBucket).upload(finalPath,new Blob([temp],{type:proof.mime}),{contentType:proof.mime,upsert:false});}catch{/* Read exact retained destination below. */}
    const storage=adminClient.storage.from(finalBucket),before=await storage.info(finalPath),b=objectIdentity.safeParse(before.data);
    if(before.error||!b.success)throw Error('Unconfirmed final object');
    const copied=await readBoundedDmsObject(storage,finalPath,expected.size);
    await verifyDmsBlob(copied,{...expected,sha256:proof.sha256});
    const after=await storage.info(finalPath),a=objectIdentity.safeParse(after.data);
    if(after.error||!a.success||JSON.stringify(a.data)!==JSON.stringify(b.data))throw Error('Final object changed');
    return {success:true,bucket:finalBucket,path:finalPath,evidence:{object:a.data,sha256:proof.sha256}};
  }catch{return {success:false,bucket:finalBucket,path:finalPath,error:'File copy is unconfirmed, malformed or differs from its source. Retain the original intake and copied object for recovery.'};}
}

// ── Storage cleanup compensation ──────────────────────────────────────────────

export interface StorageCleanupResult {
  success: boolean;
  error?: string;
}

export async function cleanupFinalStorageFile(
  _adminClient: SupabaseClient,
  _bucket: string,
  _path: string
): Promise<StorageCleanupResult> {
  void _adminClient; void _bucket; void _path;
  return {success:false,error:'Final objects are retained for outcome reconciliation. Error-response compensation cannot authorize deletion.'};
}
