import {z} from "zod";

export const HR_SETTINGS_FIRST_PAGE = {page:1,page_size:25} as const;
export const hrSettingsColumn = z.enum(["code","name_en","is_active","training_category"]);
export type HrSettingsColumn = z.infer<typeof hrSettingsColumn>;
const sort = z.object({id:hrSettingsColumn,desc:z.boolean()}).strict();

export const hrSettingsListOptions = z.object({
  tableSearch:z.string().optional(),
  sorting:z.array(sort).max(4).refine(items=>new Set(items.map(item=>item.id)).size===items.length).optional(),
  columnFilters:z.partialRecord(hrSettingsColumn,z.string()).optional(),
}).strict();
export type HrSettingsListOptions = z.infer<typeof hrSettingsListOptions>;
