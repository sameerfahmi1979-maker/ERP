import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { getAuthContext, type AuthContext } from "@/lib/rbac/check";

type Scope = { active: boolean; auth?: Promise<AuthContext> };
const scopes = new AsyncLocalStorage<Scope>();
/** Explicit request-local reuse only. Never wrap mutations or retain authority between requests. */
export async function withReadRequest<T>(work: () => Promise<T>): Promise<T> {
  const scope: Scope = { active: true };
  return scopes.run(scope, async () => {
    try { return await work(); }
    finally { scope.active = false; scope.auth = undefined; }
  });
}
export function getReadAuthContext(): Promise<AuthContext> {
  const scope = scopes.getStore();
  if (!scope?.active) return getAuthContext();
  return scope.auth ??= getAuthContext();
}
