import {z} from "zod";

/** Priority is meaningful: never sort this array or silently discard an entry. */
export const readSortingSchema = z.array(z.object({id: z.string().min(1).max(100), desc: z.boolean()}).strict()).max(32);
export type ReadSort = z.infer<typeof readSortingSchema>[number];
type ScalarSort = {sortKey?: string; sortDir?: "asc" | "desc"; sorting?: ReadSort[]};

/** Keep scalar callers compatible while accepting one validated priority list.
 * The resolved scalar fields mirror its first key for older internal consumers.
 * Consistent mixed input is idempotent; conflicting mixed input is rejected.
 * An empty list restores the kind's native order, not an ascending accident. */
export function normalizeReadSorting<T extends ScalarSort>(input: T, ctx: z.RefinementCtx,
  options: {allowed: readonly string[]; defaultKey: string; defaultDir: "asc" | "desc"; emptyDir?: "asc" | "desc"}) {
  const listed = input.sorting !== undefined;
  const first = input.sorting?.[0];
  const sortKey = listed ? first?.id ?? options.defaultKey : input.sortKey ?? options.defaultKey;
  const sortDir = listed ? first ? first.desc ? "desc" : "asc" : options.emptyDir ?? options.defaultDir : input.sortDir ?? options.defaultDir;
  if (listed && (input.sortKey !== undefined && input.sortKey !== sortKey || input.sortDir !== undefined && input.sortDir !== sortDir)) {
    ctx.addIssue({code: "custom", message: "Conflicting sort criteria", path: ["sorting"]});
  }
  const seen = new Set<string>();
  for (const [index, sort] of (input.sorting ?? [{id: sortKey, desc: sortDir === "desc"}]).entries()) {
    if (!options.allowed.includes(sort.id) || seen.has(sort.id)) ctx.addIssue({code: "custom", message: "Unsupported or duplicate sort field", path: listed ? ["sorting", index, "id"] : ["sortKey"]});
    seen.add(sort.id);
  }
  return {...input, sortKey, sortDir};
}

/** Schemas have already validated each entry and resolved the native empty case. */
export function readSortPriority(criteria: {sortKey: string; sortDir: "asc" | "desc"; sorting?: ReadSort[]}): ReadSort[] {
  return criteria.sorting?.length ? criteria.sorting : [{id: criteria.sortKey, desc: criteria.sortDir === "desc"}];
}
