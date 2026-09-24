import "server-only";
import { createClient } from "@/lib/supabase/server";

export type IssuedFileAction = "view" | "download" | "reports.pdf.approve" | "outputs.ops.revoke" | "outputs.ops.retry";

/** Current session, employee relationship, branch and sensitive permissions are checked in the database. */
export async function canAccessIssuedFile(id: number, action: IssuedFileAction): Promise<boolean> {
  if (!Number.isSafeInteger(id) || id <= 0) return false;
  const { data, error } = await (await createClient()).rpc("f03_has_generated_pdf_permission", {
    document_id: id, action_code: action,
  });
  return !error && data === true;
}

export function issuedFileUrl(id: number): string {
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error("Invalid issuance");
  return `/api/output/file?issuanceId=${id}`;
}
