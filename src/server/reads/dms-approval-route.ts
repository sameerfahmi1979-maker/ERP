import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/** The caller must have read the document under RLS and verified permission
 * to submit that document. Only the readiness message leaves this reader. */
export async function readDmsSubmissionBlocker(document: {
  document_type_id: number | null;
  owning_company_id: number | null;
  owning_branch_id: number | null;
  document_type: { name_en: string | null } | null;
  company: { company_code: string | null } | null;
}, signal?: AbortSignal): Promise<string | null> {
  if (!document.owning_company_id || !document.document_type_id) {
    return "Set the document's company and type before submitting it for approval.";
  }

  signal?.throwIfAborted();
  let query = createAdminClient().from("dms_document_workflows")
    .select("id, mapped:dms_workflow_document_types!inner(document_type_id)")
    .eq("mapped.document_type_id", document.document_type_id)
    .eq("owner_company_id", document.owning_company_id)
    .eq("is_active", true)
    .is("deleted_at", null);
  query = document.owning_branch_id === null
    ? query.is("branch_id", null)
    : query.or(`branch_id.is.null,branch_id.eq.${document.owning_branch_id}`);
  const bounded = query.limit(2);
  const { data, error } = await (signal ? bounded.abortSignal(signal) : bounded);
  signal?.throwIfAborted();
  if (error || !data) return "The approval workflow could not be checked. Refresh approval status and try again.";
  if (data.length === 1) return null;
  if (data.length > 1) return "Multiple active approval workflows match this document. Ask your DMS administrator to resolve the overlap.";

  const type = document.document_type?.name_en;
  const company = document.company?.company_code;
  const typeLabel = type ? `for ${type}` : "for this document type";
  return `No active approval workflow is configured ${typeLabel}${company ? ` in ${company}` : " for this company and branch scope"}. Ask your DMS administrator to configure a workflow and assign an independent reviewer.`;
}
