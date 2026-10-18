import "server-only";

export const REPORT_READ_PAGE_SIZE = 500;
export const REPORT_READ_MAX_ROWS = 20_000;
type ReadResult = { data: unknown; error: unknown; count?: number | null };
type ReadQuery = PromiseLike<ReadResult> & {
  order: (column: string) => ReadQuery;
  range: (from: number, to: number) => ReadQuery;
};

/** Preserve the already-scoped query and every caller filter on each page.
 * A limit(1) is a deliberate latest-record lookup. Other historical fetcher
 * limits must not silently turn a complete analytical report into a sample.
 * Counts changing during the read fail closed; this is not an MVCC snapshot.
 */
export function completeReportRead<T extends object>(query: T): T {
  const state = { one: false, singular: false };
  const wrap = (target: object): object => new Proxy(target, {
    get(value, key, receiver) {
      if (key === "then") return (fulfilled: ((result: unknown) => unknown) | undefined, rejected: ((reason: unknown) => unknown) | undefined) => {
        const read = async () => {
          if (state.one || state.singular) {
            const result = await (value as PromiseLike<ReadResult>);
            if (result.error) throw new Error("Report data could not be read. No partial report was produced.");
            return result;
          }
          const paged = (value as ReadQuery).order("id");
          const rows: unknown[] = [];
          let total: number | undefined;
          for (let offset = 0; ; offset += REPORT_READ_PAGE_SIZE) {
            const result = await paged.range(offset, offset + REPORT_READ_PAGE_SIZE - 1);
            if (result.error || !Array.isArray(result.data) || !Number.isSafeInteger(result.count) || result.count! < 0) {
              throw new Error("Report completeness could not be verified. No partial report was produced.");
            }
            if (result.count! > REPORT_READ_MAX_ROWS) throw new Error("This report exceeds the 20,000-row safe export limit. Narrow the filters; no partial report was produced.");
            total ??= result.count!;
            if (result.count !== total || result.data.length > REPORT_READ_PAGE_SIZE || rows.length + result.data.length > total) {
              throw new Error("Report data changed during collection. Run it again; no partial report was produced.");
            }
            rows.push(...result.data);
            if (rows.length === total) return { ...result, data: rows, count: total };
            if (result.data.length !== REPORT_READ_PAGE_SIZE) throw new Error("Report collection ended early. No partial report was produced.");
          }
        };
        return read().then(fulfilled, rejected);
      };
      const method = Reflect.get(value, key, receiver);
      if (typeof method !== "function") return method;
      return (...args: unknown[]) => {
        if (key === "limit") {
          state.one = args[0] === 1;
          if (!state.one) return wrap(value);
        }
        if (key === "single" || key === "maybeSingle") state.singular = true;
        const next = method.apply(value, args);
        return next && typeof next === "object" && "then" in next ? wrap(next) : next;
      };
    },
  });
  return wrap(query) as T;
}
