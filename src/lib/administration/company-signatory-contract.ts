import { z } from "zod";
import type { AuthContext } from "@/lib/rbac/check";
import { hasGlobalPermission } from "@/lib/rbac/scope";
import { administrationDate } from "@/lib/master-data/administration-validation";

export const signatoryId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const signatoryContract = z.object({ operationId: z.string().uuid(), revision: z.string().regex(/^[1-9]\d*$/).nullable() }).strict();
export const signatoryReceipt = z.object({ id: signatoryId, revision: z.string().regex(/^[1-9]\d*$/), changed: z.boolean(), replayed: z.boolean() });
export type SignatoryReceipt = z.infer<typeof signatoryReceipt>;
const text = (max: number) => z.string().trim().max(max).transform(value => value || null).nullable();
const date = administrationDate.unwrap().unwrap().nullable();
export const signatoryFields = z.object({
  full_name: z.string().trim().min(1, "Enter the full name.").max(200),
  user_id: signatoryId.nullable().optional(),
  designation: text(200), signature_scope: text(500), notes: text(2000),
  is_primary: z.boolean(), is_active: z.boolean(), effective_from: date, effective_to: date,
}).strict().superRefine((value, ctx) => {
  if (value.effective_from && value.effective_to && value.effective_to < value.effective_from) ctx.addIssue({ code: "custom", path: ["effective_to"], message: "The end date cannot precede the start date." });
});
export const createSignatoryInput = signatoryFields.safeExtend({ company_id: signatoryId });
export const updateSignatoryInput = signatoryFields.safeExtend({ company_id: signatoryId, id: signatoryId });
export type CreateSignatoryInput = z.infer<typeof createSignatoryInput>;
export type UpdateSignatoryInput = z.infer<typeof updateSignatoryInput>;
export type SignatoryFields = z.infer<typeof signatoryFields>;
// Reads preserve historical values; writes apply the current validation above.
export const signatoryRow = z.object({
  id: signatoryId, company_id: signatoryId, workspace_revision: signatoryId,
  user_id: signatoryId.nullable(), full_name: z.string(), designation: z.string().nullable(),
  signature_scope: z.string().nullable(), notes: z.string().nullable(), is_primary: z.boolean(), is_active: z.boolean(),
  effective_from: z.string().nullable(), effective_to: z.string().nullable(), created_at: z.string(), updated_at: z.string(), deleted_at: z.string().nullable(),
});
export type OwnerCompanySignatoryRow = z.infer<typeof signatoryRow>;
export const signatoryRequest = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save"), company_id: signatoryId, fields: signatoryFields }).strict(),
  z.object({ action: z.enum(["archive", "restore"]), company_id: signatoryId }).strict(),
]);
export type SignatoryRequest = z.infer<typeof signatoryRequest>;
export function canReadCompanySignatories(ctx: AuthContext) {
  return ["common_md.view", "common_md.organizations.view", "organizations.view"].some(code => hasGlobalPermission(ctx, code));
}
export function canManageCompanySignatories(ctx: AuthContext) {
  return canReadCompanySignatories(ctx) && ["common_md.manage", "common_md.organizations.manage", "organizations.manage"].some(code => hasGlobalPermission(ctx, code));
}
