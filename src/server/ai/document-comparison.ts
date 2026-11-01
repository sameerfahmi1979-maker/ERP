import "server-only";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/rbac/check";
import { assertSearchPrincipal } from "./search/document-query";
import { verifySearchDelivery } from "./search/security";
import { preparationId, preparationHash, preparationEvidenceSchema } from "@/lib/dms/preparation/contracts";
import { comparePreparedSources } from "@/lib/dms/preparation/comparison";
const selection = z.strictObject({ documentId: preparationId, versionId: preparationId.optional() });
export const documentComparisonInput = z.strictObject({ sources: z.array(selection).min(2).max(10), recordFindings: z.boolean().default(false), expectedHashes: z.array(preparationHash).min(2).max(10).optional() });
const sourceSchema = z.strictObject({ documentId: preparationId, documentNo: z.string(), versionId: preparationId, sourceHash: preparationHash, subjectKey: z.string().nullable(), complete: z.boolean(),
  facts: z.array(z.strictObject({ key: z.string(), value: z.string().nullable(), kind: z.enum(["text", "date", "identifier", "quantity", "money"]), unit: z.string().nullable(), currency: z.string().nullable(), evidence: z.array(preparationEvidenceSchema) })).max(250),
  passages: z.array(z.strictObject({ fileId: preparationId, versionId: preparationId, sha256: preparationHash.nullable(), name: z.string(), text: z.string().max(5000).nullable(), page: z.null(), locationPrecision: z.literal("snippet") })).max(10), profile: z.unknown().nullable() });
const receipt = z.strictObject({ sources: z.array(sourceSchema).min(2).max(10), findings: z.array(z.strictObject({ id: preparationId, rule: z.string(), field: z.string() })).max(100), findingScope: z.string() });
export async function compareDocumentSources(raw: unknown, signal?: AbortSignal) {
  const input = documentComparisonInput.safeParse(raw);
  if (!input.success) return { success: false as const, error: "Invalid document comparison." };
  try {
    signal?.throwIfAborted(); const ctx = await getAuthContext(); assertSearchPrincipal(ctx);
    const db = await createClient();
    const request = db.rpc("ai_mod04_compare", { p_selections: input.data.sources, p_record_findings: input.data.recordFindings, p_expected_hashes: input.data.expectedHashes ?? null });
    const result = await (signal ? request.abortSignal(signal) : request);
    signal?.throwIfAborted();
    if (result.error) return { success: false as const, error: result.error.code === "42501" ? "Permission denied" : result.error.code === "PT409" ? "The selected sources changed. Compare again before recording findings." : "Selected sources could not be compared. No missing text or location was inferred." };
    const verified = receipt.parse(result.data);
    if (verified.sources.length !== input.data.sources.length || verified.sources.some((s, i) => s.documentId !== input.data.sources[i].documentId || input.data.sources[i].versionId !== undefined && s.versionId !== input.data.sources[i].versionId)) throw Error("Source receipt mismatch");
    const pairs = verified.sources.slice(1).map(right => comparePreparedSources(verified.sources[0], right));
    await verifySearchDelivery(ctx); signal?.throwIfAborted();
    return { success: true as const, data: { ...verified, pairs, sourcePrecision: "Recorded fields and retained excerpts only; no invented page boxes or historical metadata." } };
  } catch { signal?.throwIfAborted(); return { success: false as const, error: "Comparison could not be verified. Retain the selected sources and retry." }; }
}
