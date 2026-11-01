"use server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission, hasPermissionInScope } from "@/lib/rbac/check";
import { assertSearchPrincipal } from "@/server/ai/search/document-query";
import { verifySearchDelivery } from "@/server/ai/search/security";
import { readAuthorizedAssistantEntity } from "@/lib/ai/common/assistant/entity-access";
import { searchDocuments } from "@/server/ai/search/documents";
import { getDmsDocumentMetadataValues } from "@/server/actions/dms/document-metadata-values";
import { getCommonAiEntityRegistry } from "@/lib/ai/common/registry";
import { formContextSchema, formSuggestionRequestSchema, formReceiptSchema, reviewedFieldCandidates } from "@/lib/ai/assistant-guidance/form-review";

async function admitted(raw: unknown) {
  const input = formContextSchema.parse(raw), ctx = await getAuthContext(); assertSearchPrincipal(ctx);
  if (!hasPermission(ctx, "ai.field_suggestions.generate") || !hasPermission(ctx, "dms.documents.view")) throw Error("Permission denied");
  const db = await createClient(), registry = getCommonAiEntityRegistry(input.entityType)!;
  const flag = await db.from("erp_ai_feature_flags").select("is_enabled").eq("feature_code", "ERP_AI_FORM_FILL").maybeSingle();
  if (flag.error || flag.data?.is_enabled !== true) throw Error("Reviewed form suggestions are disabled or unavailable");
  let current: Record<string, unknown> = {}, version = "new";
  if (input.entityId) {
    const projection = ["id", "owner_company_id", "updated_at", ...registry.fields.map(f => f.targetField), ...(input.entityType === "site" ? ["branch_id"] : [])].join(",");
    const r = await db.from(registry.targetTable).select(projection).eq("id", input.entityId).maybeSingle();
    if (r.error || !r.data) throw Error("Target unavailable"); current = r.data as unknown as Record<string, unknown>;
    if (current.owner_company_id !== input.companyId || typeof current.updated_at !== "string") throw Error("Target scope changed"); version = current.updated_at;
  } else if (!await readAuthorizedAssistantEntity("company", input.companyId)) throw Error("Company unavailable");
  const branchId = input.entityType === "branch" ? input.entityId : typeof current.branch_id === "number" ? current.branch_id : null;
  if (!hasPermissionInScope(ctx, registry.managePermission, input.companyId, branchId)) throw Error("Permission denied");
  return { input, ctx, db, current, version };
}
/** List choices only; never links a source or changes the target record. */
export async function getFormSuggestionSources(raw: unknown) {
  try {
    const parsed = formContextSchema.extend({ query: z.string().trim().max(200).default("") }).parse(raw);
    const { query, ...context } = parsed, gate = await admitted(context);
    const r = await searchDocuments({ query, pageSize: 20, filters: { companyId: context.companyId, lifecycle: "current" },
      ...(context.entityId ? { subject: { type: context.entityType, id: context.entityId } } : {}) }, gate.ctx);
    if (!r.success || r.data.outcome === "clarification_required") return { success: false as const, error: "Document choices could not be verified" };
    await verifySearchDelivery(gate.ctx);
    return { success: true as const, data: r.data.rows.map(d => ({ id: d.id, label: `${d.document_no} — ${d.title}` })), totalCount: r.data.totalCount };
  } catch { return { success: false as const, error: "Form suggestions are unavailable in the current scope or are disabled." }; }
}
export async function prepareReviewedFormSuggestions(raw: unknown) {
  try {
    const { documentId, ...context } = formSuggestionRequestSchema.parse(raw), gate = await admitted(context);
    const choices = await searchDocuments({ query: "", pageSize: 1, filters: { companyId: context.companyId, candidateIds: [documentId], lifecycle: "current" }, ...(context.entityId ? { subject: { type: context.entityType, id: context.entityId } } : {}) }, gate.ctx);
    if (!choices.success || choices.data.outcome === "clarification_required" || choices.data.rows.length !== 1) throw Error("Source unavailable");
    const doc = choices.data.rows[0], metadata = await getDmsDocumentMetadataValues(documentId);
    if (!metadata.success || !metadata.data || !metadata.snapshot) throw Error("Reviewed metadata unavailable");
    const values = metadata.data.flatMap(v => v.definition?.field_code && (v.value_text !== null || v.value_date !== null) ? [{ code: v.definition.field_code, value: v.value_date ?? v.value_text! }] : []);
    const fields = reviewedFieldCandidates(context.entityType, gate.current, values);
    const source = await readAuthorizedAssistantEntity("dms_document", documentId);
    if (!source || source.version !== doc.updated_at) throw Error("Source changed");
    await verifySearchDelivery(gate.ctx);
    return { success: true as const, data: { fields, sourceLabel: `${doc.document_no} — ${doc.title}`, receipt: formReceiptSchema.parse({ ...context, documentId, targetVersion: gate.version, sourceVersion: doc.updated_at, metadataSnapshot: metadata.snapshot }) } };
  } catch { return { success: false as const, error: "The target, document metadata or current permission could not be verified. Nothing was changed." }; }
}
/** Recompute from current sources before copying selected values into the normal form. */
export async function revalidateReviewedFormSuggestions(raw: unknown) {
  const parsed = formReceiptSchema.safeParse(raw); if (!parsed.success) return { success: false as const, error: "Invalid suggestion receipt" };
  const { targetVersion, sourceVersion, metadataSnapshot, ...request } = parsed.data;
  const now = await prepareReviewedFormSuggestions(request);
  if (!now.success || now.data.receipt.targetVersion !== targetVersion || now.data.receipt.sourceVersion !== sourceVersion || now.data.receipt.metadataSnapshot !== metadataSnapshot) return { success: false as const, error: "The target or evidence changed. Prepare suggestions again; no values were copied." };
  return now;
}
