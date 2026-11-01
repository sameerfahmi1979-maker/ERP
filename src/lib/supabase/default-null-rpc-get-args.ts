/**
 * PostgREST GET/HEAD RPCs encode JS null as the URL text "null". Only use
 * this for optional function arguments whose SQL default is NULL: omitting
 * them preserves SQL NULL without breaking bigint parsing or text filters.
 * Required nullable arguments must instead use a JSON-body RPC.
 */
export function defaultNullRpcGetArgs<T extends Record<string, unknown>>(args: T): Partial<T> {
  return Object.fromEntries(Object.entries(args).filter(([, value]) => value !== null && value !== undefined)) as Partial<T>;
}
