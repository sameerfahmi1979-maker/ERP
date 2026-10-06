"use client";

export class ReadError extends Error {
  constructor(message:string,readonly status:number,readonly correlationId?:string) { super(message); this.name="ReadError"; }
}
/** One transient retry; never automatically retry a denied/invalid read. */
export function retryAuthorizedRead(failureCount:number,error:unknown):boolean {
  // DOMException/Error objects can come from another window/realm.
  if(typeof error==="object"&&error!==null&&"name"in error&&error.name==="AbortError")return false;
  return failureCount<1 && !(error instanceof ReadError && error.status>=400 && error.status<500);
}

/** Same-origin, uncached read transport. Mutations remain Server Actions. */
export async function readJson<T>(resource: string, params: unknown, signal?: AbortSignal): Promise<T> {
  const cancelled=()=>new DOMException("Read cancelled.","AbortError");
  if(signal?.aborted)throw cancelled();
  try {
  const response = await fetch(`/api/reads/${encodeURIComponent(resource)}`, {
    method: "POST", credentials: "same-origin", cache: "no-store", signal,
    // Search terms and dependent IDs stay out of access-log URLs. This is a
    // read-only route handler, not a mutation or a queued Server Action.
    headers: { Accept: "application/json", "Content-Type":"application/json" },
    body: JSON.stringify(params ?? {}),
  });
  if(signal?.aborted)throw cancelled();
  // Only this exact terminal status/marker pair is the application's cancellation contract.
  if(response.status===400&&response.headers.get("X-ERP-Read-Outcome")==="cancelled")throw cancelled();
  if (!response.ok) throw new ReadError(response.status === 401 || response.status === 403 ? "Your access could not be verified. Sign in again or contact your administrator." : "Records could not be loaded. Please retry.",response.status,response.headers.get("X-ERP-Correlation")??undefined);
  const result = await response.json();
  if(signal?.aborted)throw cancelled();
  if (result?.success !== true) throw new Error("Records could not be loaded. Please retry.");
  return result as T;
  } catch(error) {
    if(signal?.aborted||(typeof error==="object"&&error!==null&&"name"in error&&error.name==="AbortError"))throw cancelled();
    throw error;
  }
}
