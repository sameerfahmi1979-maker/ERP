import type { QueryClient } from "@tanstack/react-query";
import type { LookupChoice as LookupValue } from "@/lib/reads/lookup-contract";
import { queryKeys } from "./authorized-lookup-keys";
import { readJson, retryAuthorizedRead } from "@/lib/reads/client";

/** Opt-in only. TanStack owns every write: no late manual seeding after logout. */
export async function prefetchLookupCategories(client: QueryClient, codes: readonly string[], options: {includeInactive?: boolean} = {}) {
  const requestedCodes = [...new Set(codes.map(c => c.trim().toUpperCase()))].sort();
  const includeInactive = options.includeInactive ?? false;
  const empty = {requestedCodes, seededCodes: [] as string[], missingCodes: [] as string[], seededCount: 0, error: null as string | null};
  if (!requestedCodes.length) return empty;
  try {
    const batch = client.fetchQuery({
      queryKey: queryKeys.lookup.batch(requestedCodes, includeInactive), retry: retryAuthorizedRead,
      queryFn: async ({signal}) => {
        const result = (await readJson<{success:true;data:Record<string, LookupValue[]>}>("lookup-batch", {categoryCodes: requestedCodes, includeInactive}, signal)).data;
        if (!result || requestedCodes.some(code => !Object.hasOwn(result, code) || !Array.isArray(result[code]))) throw Error("Choices could not be completely loaded. Please retry.");
        return result;
      },
    });
    const [, values] = await Promise.all([batch, Promise.all(requestedCodes.map(code => client.fetchQuery({
      queryKey: queryKeys.lookup.values(code, null, includeInactive), retry: false,
      queryFn: async ({signal}) => { const data = await batch; signal.throwIfAborted(); return data[code]; },
    })))]);
    return {...empty, seededCodes: requestedCodes.filter((_, i) => values[i].length > 0),
      missingCodes: requestedCodes.filter((_, i) => values[i].length === 0), seededCount: values.reduce((n, rows) => n + rows.length, 0)};
  } catch {
    return {...empty, missingCodes: requestedCodes, error: "Choices could not be completely loaded. Please retry."};
  }
}
