type Page<T> = { data: T[] | null; count: number | null; error: unknown };
type Options<T> = { batchSize?: number; signal?: AbortSignal; identity?: (row: T) => string | number; maxRows?: number };

/** Complete, count-checked paging. A partial or changing result is never an empty/success result. */
export async function collectCompletePages<T>(fetchPage: (from: number, to: number) => PromiseLike<Page<T>>, options: Options<T> = {}): Promise<T[]> {
  const batchSize = options.batchSize ?? 500;
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 500) throw Error("Invalid read batch size");
  if (options.maxRows !== undefined && (!Number.isSafeInteger(options.maxRows) || options.maxRows < 0)) throw Error("Invalid read row limit");
  const rows: T[] = [], identities = new Set<string | number>();
  let expected: number | undefined;
  for (let from = 0; ; from += batchSize) {
    options.signal?.throwIfAborted();
    const page = await fetchPage(from, from + batchSize - 1);
    options.signal?.throwIfAborted();
    if (page.error || page.count === null || !Number.isSafeInteger(page.count) || page.count < 0 || (expected !== undefined && expected !== page.count)) {
      throw Error("Records changed or could not be completely loaded. Please retry.");
    }
    expected = page.count;
    if (page.data !== null && (!Array.isArray(page.data) || page.data.length > batchSize)) throw Error("Invalid read page");
    if (options.maxRows !== undefined && expected > options.maxRows) throw Error("Too many choices to load safely. Refine the parent selection or contact your administrator.");
    for (const row of page.data ?? []) {
      if (options.identity) {
        const id = options.identity(row);
        if (identities.has(id)) throw Error("Records changed while loading. Please retry.");
        identities.add(id);
      }
      rows.push(row);
    }
    if (rows.length === expected) return rows;
    if (rows.length > expected || !page.data?.length || page.data.length < Math.min(batchSize, expected - from)) throw Error("A partial result was rejected. Please retry.");
  }
}
