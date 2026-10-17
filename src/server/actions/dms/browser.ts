"use server";

import {readDmsBrowser} from "@/server/reads/dms-browser";
import type {DmsBrowserRow} from "@/lib/reads/dms-browser-schema";

export type ActionResult<T = unknown> = {success: boolean; data?: T; error?: string};
export type DmsBrowserFile = {id: number; fileName: string; mimeType: string | null; fileSizeBytes: number | null};
export type DmsBrowserDocument = DmsBrowserRow & {files: DmsBrowserFile[]};
export type DmsBrowserDocType = {id: number; typeCode: string; nameEn: string};
export type DmsBrowserFilters = {
  query: string; documentTypeIds?: number[]; status?: string; issueDateFrom?: string; issueDateTo?: string;
  linkedEntityType?: string; offset?: number; limit?: number;
};

/** Compatibility adapter. The browser uses the cancellable read route; files
 * are loaded only for the selected document, never every result. */
export async function searchDmsBrowser(filters: DmsBrowserFilters): Promise<ActionResult<{rows: DmsBrowserDocument[]; total: number}>> {
  const result = await readDmsBrowser({operation: "search", ...filters});
  if (!result.success || !result.data) return {success: false, error: result.error};
  if (result.data.availability === "too_large") return {success: false, error: "Too many matching records to verify safely. Refine your search or filters."};
  if (result.data.criteria.operation !== "search" || !("rows" in result.data)) return {success: false, error: "Document search could not be verified"};
  const rows = result.data.rows as DmsBrowserRow[];
  return {success: true, data: {rows: rows.map(row => ({...row, files: []})), total: result.data.totalCount}};
}

/** Retained for callers outside the interactive browser. Failure is explicit,
 * never a successful empty catalogue. */
export async function getDmsBrowserDocumentTypes(): Promise<DmsBrowserDocType[]> {
  const result = await readDmsBrowser({operation: "types"});
  if (!result.success || !result.data || result.data.availability !== "available" || result.data.criteria.operation !== "types" || !("rows" in result.data)) throw Error("Document types could not be completely loaded. Please retry.");
  return result.data.rows as DmsBrowserDocType[];
}
