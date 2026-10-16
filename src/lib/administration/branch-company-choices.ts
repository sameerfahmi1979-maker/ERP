import { z } from 'zod';

/** Label-only branch ownership projection; not an organization record. */
export const branchCompanyChoiceSchema = z.object({
  id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  legal_name_en: z.string(),
  company_code: z.string(),
}).strict();

export type BranchCompanyChoice = z.infer<typeof branchCompanyChoiceSchema>;

export const branchCompanyChoicesSchema = z.array(branchCompanyChoiceSchema)
  .refine(choices => new Set(choices.map(choice => choice.id)).size === choices.length);
