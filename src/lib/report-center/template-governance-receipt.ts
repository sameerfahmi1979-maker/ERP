import {z} from 'zod';
export const templateReviewSchema=z.object({
 passed:z.boolean(),severity:z.enum(['none','warning','block']),
 findings:z.array(z.object({field:z.string(),rule:z.string(),severity:z.enum(['block','warning']),excerpt:z.string()})),
});
export const templateGovernanceReceipt=z.object({
 id:z.number().int().positive(),source_id:z.number().int().positive(),revision:z.string().regex(/^[1-9]\d*$/),
 governance_status:z.enum(['draft','in_review','approved','published','archived','rejected']),
 security_review_status:z.enum(['pending','passed','failed','skipped']),changed:z.boolean(),replayed:z.boolean(),
 owner_company_id:z.number().int().positive().nullable(),review:templateReviewSchema.nullable(),
});
export type TemplateGovernanceReceipt=z.infer<typeof templateGovernanceReceipt>;
export type TemplateGovernanceAction='submit'|'approve'|'reject'|'publish'|'archive'|'new_version'|'review';
