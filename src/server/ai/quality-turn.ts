import "server-only";
import { createHash } from "node:crypto";
import type { createClient } from "@/lib/supabase/server";

type Db = Awaited<ReturnType<typeof createClient>>;

export async function beginQualityTurn(db: Db, sessionId: number, requestId: string | undefined, userMessage: string, graphHash: string | undefined) {
  if (!requestId) throw Error("Refresh the client to retain an original request.");
  if (!graphHash || !/^[a-f0-9]{64}$/.test(graphHash)) throw Error("Current authority receipt unavailable.");
  const hash = createHash("sha256").update(JSON.stringify({ sessionId, userMessage })).digest("hex");
  const result = await db.rpc("erp_begin_assistant_publication", { p_session: sessionId, p_request: requestId, p_hash: hash, p_graph_hash: graphHash });
  if (result.error || result.data?.state !== "started" || result.data?.replayed !== false)
    throw Error("This turn is paused, limited or retained for recovery. Reload its original conversation.");
  const authorityHash = result.data.authorityHash;
  if (typeof authorityHash !== "string" || !/^[a-f0-9]{64}$/.test(authorityHash))
    throw Error("Current authority receipt unavailable.");
  return { sessionId, requestId, hash, authorityHash };
}
