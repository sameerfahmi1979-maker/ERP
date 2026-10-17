import { z } from "zod";
/** Endpoint schemas must extend this with allowlisted sort/filter fields, then .strict(). */
export const pageParameters = z.object({
  page: z.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(200).default(""),
}).strict();
export type PageParameters = z.infer<typeof pageParameters>;
export type AuthorizedPage<T> = {
  success: true; rows: T[]; totalCount: number; page: number; pageSize: number;
};
export function validReadPage(value: unknown, criteria: Record<string, unknown>): boolean {
  if (!value || typeof value !== "object") return false;
  const p = value as Record<string, unknown>;
  return Array.isArray(p.rows) && Number.isSafeInteger(p.totalCount) && Number(p.totalCount) >= p.rows.length &&
    Number.isSafeInteger(p.page) && Number(p.page) >= 1 && p.page === (criteria.page ?? 1) &&
    Number.isSafeInteger(p.pageSize) && Number(p.pageSize) >= 1 && Number(p.pageSize) <= 100 &&
    p.pageSize === (criteria.pageSize ?? 25) && p.rows.length <= Number(p.pageSize);
}
