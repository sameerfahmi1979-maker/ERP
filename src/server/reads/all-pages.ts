import "server-only";
import { collectCompletePages } from "@/lib/reads/complete-pages";
/** Complete authorized results, with an explicit failure rather than silent backend-cap truncation. */
export async function readAllPages<T>(fetchPage:(from:number,to:number)=>Promise<{data:T[]|null;count:number|null;error:unknown}>,options:number|{batchSize?:number;identity?:(row:T)=>string|number;maxRows?:number;signal?:AbortSignal}=500):Promise<T[]> {
  // A repeated parent reference can be legitimate for child/link projections.
  // Entity readers opt into their actual unique row identity; do not guess it.
  return collectCompletePages(fetchPage, typeof options === "number" ? { batchSize: options } : options);
}
