import "server-only";
import {AsyncLocalStorage} from "node:async_hooks";
import type {SupabaseClient} from "@supabase/supabase-js";
import {withSingleReadAttempt} from "./read-attempt-policy";

// Transport policy only. Never store identity, permission or response data here.
// run() is request-local; concurrent mutations/default clients remain unchanged.
const controlledRead = new AsyncLocalStorage<boolean>();
export function runSingleDatabaseReadAttempt<T>(work: () => T): T {
  return controlledRead.run(true, work);
}
export function applyReadAttemptScope<T extends SupabaseClient>(client: T): T {
  return controlledRead.getStore() === true ? withSingleReadAttempt(client) : client;
}
