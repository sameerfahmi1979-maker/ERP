import { z } from "zod";

export const dmsListChoiceSchema = z.strictObject({
  id: z.number().int().positive().refine(Number.isSafeInteger),
  name_en: z.string(),
});

export const dmsListChoicesSchema = z.strictObject({
  categories: z.array(dmsListChoiceSchema).max(5000),
  documentTypes: z.array(dmsListChoiceSchema).max(5000),
});

export type DmsListChoice = z.infer<typeof dmsListChoiceSchema>;
