import type { SupabaseClient } from "@supabase/supabase-js";
const adapters = new WeakMap<object, object>();

/**
 * Reads use database-enforced projections that mask content for metadata-only
 * readers. Direct table reads of those columns are revoked in the database;
 * this adapter preserves existing PostgREST filtering/joins, not authorization.
 * Mutations deliberately retain the ordinary table RLS path.
 */
export function withDocumentReadPolicy<T extends SupabaseClient>(client: T): T {
  const existing = adapters.get(client);
  if (existing) return existing as T;
  const adapter = new Proxy(client, {
    get(target, key, receiver) {
      if (key === "from") return (table: string) => {
        const query = target.from(table);
        const rpc = table === "dms_documents" ? "f03_read_documents" : table === "dms_document_files" ? "f03_read_document_files" : table === "employee_dependents" ? "f03_read_employee_dependents" :
          ['hr_candidates','hr_job_requisitions','hr_offers'].includes(table) ? `f03_read_${table}` : null;
        if (!rpc) return query;
        return new Proxy(query, {
          get(builder, method, builderReceiver) {
            if (method === "select") return (columns?: string, options?: { head?: boolean; count?: "exact" | "planned" | "estimated" }) =>
              target.rpc(rpc, {}, { get: true, ...options }).select(columns);
            const value = Reflect.get(builder, method, builderReceiver);
            return typeof value === "function" ? value.bind(builder) : value;
          },
        });
      };
      const value = Reflect.get(target, key, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  adapters.set(client, adapter);
  adapters.set(adapter, adapter);
  return adapter;
}
