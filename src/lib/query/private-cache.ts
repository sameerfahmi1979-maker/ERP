import type { QueryClient } from "@tanstack/react-query";
const clients = new Map<QueryClient, () => void>();
/** Mounted identity-owned caches only. No localStorage/sessionStorage persistence. */
export function registerPrivateCache(client: QueryClient, retire: () => void = () => {}): () => void {
  clients.set(client, retire);
  return () => { retire(); clients.delete(client); void client.cancelQueries(); client.clear(); };
}
export function clearPrivateCaches(): void {
  // Retire every admission handle before any cancellation can notify consumers.
  for (const retire of clients.values()) retire();
  for (const client of clients.keys()) { void client.cancelQueries(); client.clear(); }
}
