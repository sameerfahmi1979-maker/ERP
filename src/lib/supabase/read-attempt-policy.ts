import type {SupabaseClient} from "@supabase/supabase-js";

/** Suppress nested SDK retries for an explicitly controlled read attempt.
 * No auth flags, cached results or mutation methods are changed. Compose this
 * before withDocumentReadPolicy so its protected GET RPCs are covered too.
 */
export function withSingleReadAttempt<T extends SupabaseClient>(client: T): T {
  return new Proxy(client, {
    get(target, key, receiver) {
      if (key === "from") return (table: string) => {
        const query = target.from(table);
        return new Proxy(query, {
          get(builder, method, builderReceiver) {
            if (method === "select") return (columns?: string, options?: {head?: boolean; count?: "exact" | "planned" | "estimated"}) =>
              builder.select(columns, options).retry(false);
            const value = Reflect.get(builder, method, builderReceiver);
            return typeof value === "function" ? value.bind(builder) : value;
          },
        });
      };
      if (key === "rpc") return (name: string, args?: Record<string, unknown>, options?: {head?: boolean; get?: boolean; count?: "exact" | "planned" | "estimated"}) => {
        const query = target.rpc(name, args, options);
        return options?.get || options?.head ? query.retry(false) : query;
      };
      const value = Reflect.get(target, key, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
