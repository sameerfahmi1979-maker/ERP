import type { QueryClient } from "@tanstack/react-query";
const clients = new Set<QueryClient>();
/** Mounted identity-owned caches only. No localStorage/sessionStorage persistence. */
export function registerPrivateCache(client: QueryClient): () => void {
  clients.add(client);
  return () => { clients.delete(client); void client.cancelQueries(); client.clear(); };
}
export function clearPrivateCaches(): void {
  for (const client of clients) { void client.cancelQueries(); client.clear(); }
}
