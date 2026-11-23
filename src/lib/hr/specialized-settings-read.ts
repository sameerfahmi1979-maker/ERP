import { z } from "zod";
import { readSortingSchema } from "@/lib/reads/read-sorting";
import { hrRuleForms, type HrRuleEntity, type HrRuleRow } from "./specialized-settings-form";

const entity = z.enum(["hr_readiness_rule_templates", "hr_role_requirement_matrix", "hr_site_requirement_matrix", "hr_approval_workflows"]);
const id = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const page = z.number().int().min(1).max(2147483647);
const search = z.string().max(200).default("");

const listRead = z.object({
  kind: z.literal("list"), entity, page: page.default(1), page_size: z.number().int().min(1).max(200).default(25),
  tableSearch: z.string().max(2000).default(""), sorting: readSortingSchema.default([]),
  columnFilters: z.record(z.string(), z.string().max(2000)).default({}),
}).strict();

const choiceRead = z.object({
  kind: z.literal("choices"), entity, field: z.string().max(100), parent: id.nullable(),
  page: page.default(1), search,
}).strict();

export const hrRuleRead = z.discriminatedUnion("kind", [listRead, choiceRead]).superRefine((criteria, ctx) => {
  const fields = hrRuleForms[criteria.entity].fields;
  if (criteria.kind === "choices") {
    if (!fields.some(field => field.key === criteria.field && field.kind === "reference")) {
      ctx.addIssue({ code: "custom", message: "Unsupported reference", path: ["field"] });
    }
    return;
  }
  const sortKeys = new Set<string>();
  for (const sort of criteria.sorting) {
    if (!fields.some(field => field.key === sort.id) || sortKeys.has(sort.id)) {
      ctx.addIssue({ code: "custom", message: "Unsupported or duplicate sort field", path: ["sorting"] });
    }
    sortKeys.add(sort.id);
  }
  for (const [key, value] of Object.entries(criteria.columnFilters)) {
    const field = fields.find(field => field.key === key);
    if (!field || (field.kind === "number" && !/^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:e[+-]?[0-9]{1,3})?$/i.test(value))) {
      ctx.addIssue({ code: "custom", message: "Unsupported filter", path: ["columnFilters", key] });
    }
  }
});
export type HrRuleListRead = z.input<typeof listRead>;

export function hrRulePageSchema(kind: HrRuleEntity, page: number, pageSize: number) {
  const fields = hrRuleForms[kind].fields;
  const row = z.object({
    id,
    workspace_revision: z.string().regex(/^[1-9]\d*$/),
    is_active: z.boolean(),
    reference_labels: z.object(Object.fromEntries(fields.filter(f => f.kind === "reference").map(f => [f.key, z.string()]))).strict(),
    ...Object.fromEntries(fields.filter(f => f.key !== "is_active").map(f => [
      f.key, f.kind === "boolean" ? z.boolean() : f.kind === "reference" ? id.nullable() :
        f.kind === "number" ? z.number().int().nullable() : z.string().nullable(),
    ])),
  }).strict();
  return z.object({ data: z.array(row), total: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER) }).strict()
    .refine(result => exactHrRulePage(result, page, pageSize));
}

export function exactHrRulePage(result: { data: Pick<HrRuleRow, "id">[]; total: number }, page: number, size: number) {
  return Number.isSafeInteger(result.total) && result.total >= 0 && Array.isArray(result.data) &&
    result.data.length === Math.min(size, Math.max(0, result.total - (page - 1) * size)) &&
    result.data.every(row => Number.isSafeInteger(row?.id) && row.id > 0) &&
    new Set(result.data.map(row => row.id)).size === result.data.length;
}

export const HR_RULE_CHOICE_PAGE_SIZE = 25;
const choice = z.object({ id, label: z.string().min(1) }).strict();
export const hrRuleChoicePageSchema = (page: number) => z.object({
  data: z.array(choice), total: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  retained: choice.extend({ eligible: z.boolean() }).nullable(),
}).strict().refine(result => exactHrRulePage(result, page, HR_RULE_CHOICE_PAGE_SIZE));
export type HrRuleChoicePage = z.infer<ReturnType<typeof hrRuleChoicePageSchema>>;
