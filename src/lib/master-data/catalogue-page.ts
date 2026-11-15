import { z } from "zod";

export const CATALOGUE_PAGE_SIZE = 25;
const criteria = z.object({ page: z.number().int().min(1).max(100_000), search: z.string().trim().max(200) });

export function catalogueCriteria(params: { page?: unknown; q?: unknown }) {
  return criteria.parse({ page: params.page === undefined ? 1 : Number(params.page), search: params.q ?? "" });
}

export function catalogueHref(base: string, page: number, search: string) {
  const params = new URLSearchParams();
  if (search) params.set("q", search);
  if (page > 1) params.set("page", String(page));
  return params.size ? `${base}?${params}` : base;
}

type PageResult<T> = { data: T[] | null; count: number | null; error: unknown; status: number };
type PageQuery<T> = PromiseLike<PageResult<T>> & { range: (from: number, to: number) => PromiseLike<PageResult<T>> };

export async function readCataloguePage<T>(query: PageQuery<T>, page: number, head: () => PromiseLike<PageResult<T>>) {
  if (!Number.isSafeInteger(page) || page < 1 || page > 100_000) throw new Error("Invalid catalogue page.");
  const offset = (page - 1) * CATALOGUE_PAGE_SIZE;
  const result = await query.range(offset, offset + CATALOGUE_PAGE_SIZE - 1);
  const fallback = offset > 0 && result.status === 416 ? await head() : null;
  const count = fallback ? fallback.count : result.count;
  const data = fallback ? [] : result.data;
  if ((fallback ? fallback.error : result.error) || !data || count === null || !Number.isSafeInteger(count) || count < 0 ||
      data.length !== Math.min(CATALOGUE_PAGE_SIZE, Math.max(0, count - offset))) {
    throw new Error("Catalogue records could not be completely loaded. Retry the request.");
  }
  return { data, totalCount: count };
}
