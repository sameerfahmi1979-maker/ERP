import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { AuthContext } from "@/lib/rbac/check";
import { createClient } from "@/lib/supabase/server";
import { canUseApplication } from "@/lib/rbac/scope";
import { entityReferenceSchema, type AiEntityReference } from "@/lib/ai/foundation/contracts";
import { readAuthorizedAssistantEntity } from "./entity-access";

export const HISTORY_WITHHELD = "This earlier content is retained, but its current source access cannot be verified. Start a new conversation or reopen the permitted source record.";
const bindingSchema = z.strictObject({
  version: z.literal(1), ownerProfileId: z.number().int().positive(), sessionId: z.number().int().positive(),
  authorityFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  sources: z.array(z.strictObject({ reference: entityReferenceSchema, sourceVersion: z.string().min(1).max(160) })).max(10),
});
export type AssistantHistoryBinding = z.infer<typeof bindingSchema>;

export function assistantAuthorityFingerprint(ctx: AuthContext) {
  const assignments = (ctx.roleAssignments ?? []).map(a => ({ role: a.roleCode, company: a.ownerCompanyId, branch: a.branchId, permissions: [...a.permissionCodes].sort() }));
  assignments.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return createHash("sha256").update(JSON.stringify({ owner: ctx.profile?.id, active: canUseApplication(ctx), permissions: [...ctx.permissionCodes].sort(), roles: [...ctx.roleCodes].sort(), assignments })).digest("hex");
}

export async function createAssistantHistoryBinding(ctx: AuthContext, sessionId: number, refs: readonly AiEntityReference[]): Promise<AssistantHistoryBinding | null> {
  if (!ctx.profile || !canUseApplication(ctx)) return null;
  const unique = [...new Map(refs.map(r => [`${r.entityType}:${r.entityId}`, r])).values()];
  if (unique.length > 10) return null;
  const sources: AssistantHistoryBinding["sources"] = [];
  for (const ref of unique) {
    const row = await readAuthorizedAssistantEntity(ref.entityType, ref.entityId);
    if (!row) return null;
    sources.push({ reference: ref, sourceVersion: row.version });
  }
  return { version: 1, ownerProfileId: ctx.profile.id, sessionId, authorityFingerprint: assistantAuthorityFingerprint(ctx), sources };
}

/** Legacy/unbound content is retained, but never treated as authorized history. */
export function createAssistantHistoryVerifier(ctx: AuthContext, sessionId: number) {
  const cache = new Map<string, ReturnType<typeof readAuthorizedAssistantEntity>>();
  let checked = 0;
  return async (raw: unknown) => {
    const parsed = bindingSchema.safeParse(raw);
    if (!parsed.success || !ctx.profile || !canUseApplication(ctx)) return false;
    const binding = parsed.data;
    if (binding.ownerProfileId !== ctx.profile.id || binding.sessionId !== sessionId || binding.authorityFingerprint !== assistantAuthorityFingerprint(ctx)) return false;
    for (const source of binding.sources) {
      const key = `${source.reference.entityType}:${source.reference.entityId}`;
      let lookup = cache.get(key);
      if (!lookup) {
        if (++checked > 50) return false;
        lookup = readAuthorizedAssistantEntity(source.reference.entityType, source.reference.entityId); cache.set(key, lookup);
      }
      const row = await lookup;
      if (!row || row.version !== source.sourceVersion) return false;
    }
    return true;
  };
}

export async function verifyAssistantSessionNow() {
  const db = await createClient();
  const result = await db.rpc("f03_current_session_valid");
  if (result.error || result.data !== true) throw new Error("Current session unavailable");
}
