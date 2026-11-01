import { z } from "zod";
import { getCommonAiEntityRegistry } from "@/lib/ai/common/registry";

export const formContextSchema = z.strictObject({
  entityType: z.enum(["branch", "site"]), entityId: z.number().int().positive().safe().nullable(),
  companyId: z.number().int().positive().safe(),
});
export const formSuggestionRequestSchema = formContextSchema.extend({ documentId: z.number().int().positive().safe() });
export const formReceiptSchema = formSuggestionRequestSchema.extend({ targetVersion: z.string().min(1).max(160), sourceVersion: z.string().min(1).max(160), metadataSnapshot: z.string().min(1).max(2000) });
export type FormSuggestionReceipt = z.infer<typeof formReceiptSchema>;
export interface FormFieldCandidate { field: string; label: string; value: string; existingValue: string | null; sourceField: string; }
/** Reuses the canonical field registry. No business codes, FKs, roles or statuses. */
export function reviewedFieldCandidates(entityType: "branch" | "site", current: Record<string, unknown>, values: Array<{ code: string; value: string }>): FormFieldCandidate[] {
  const registry = getCommonAiEntityRegistry(entityType)!;
  const result: FormFieldCandidate[] = [];
  for (const f of registry.fields) {
    if (!f.isAiEligible || !["text", "date"].includes(f.fieldType)) continue;
    const matches = values.filter(v => v.code.toLowerCase() === f.targetField);
    if (matches.length !== 1 || !matches[0].value.trim()) continue;
    const value = matches[0].value.trim(), old = typeof current[f.targetField] === "string" ? current[f.targetField] as string : null;
    if (value === old || old && !f.allowOverwrite || value.length > (f.maxLength ?? 1000)) continue;
    if (f.fieldType === "date" && !z.iso.date().safeParse(value).success) continue;
    result.push({ field: f.targetField, label: f.fieldLabel, value, existingValue: old, sourceField: matches[0].code });
  }
  return result;
}
