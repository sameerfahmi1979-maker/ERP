import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { getAuthContext, type AuthContext } from "@/lib/rbac/check";
import { createClient } from "@/lib/supabase/server";
import { canUseApplication } from "@/lib/rbac/scope";
import { entityReferenceSchema, type AiEntityReference } from "@/lib/ai/foundation/contracts";
import {
  assistantSourceKey, readAuthorizedAssistantEntity, readAuthorizedAssistantSourceVersions, type AssistantEntityReadRequest,
} from "./entity-access";

export const HISTORY_WITHHELD = "This earlier content is retained, but its current source access cannot be verified. Start a new conversation or reopen the permitted source record.";
const bindingSchema = z.strictObject({
  version: z.literal(1), ownerProfileId: z.number().int().positive(), sessionId: z.number().int().positive(),
  authorityFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  sources: z.array(z.strictObject({ reference: entityReferenceSchema, sourceVersion: z.string().min(1).max(160) })).max(10),
});
export type AssistantHistoryBinding = z.infer<typeof bindingSchema>;
const MAX_HISTORY_SOURCE_CHECKS = 50;
type SourceVersions = Awaited<ReturnType<typeof readAuthorizedAssistantSourceVersions>>;

export function assistantAuthorityFingerprint(ctx: AuthContext) {
  const assignments = (ctx.roleAssignments ?? []).map(a => ({ role: a.roleCode, company: a.ownerCompanyId, branch: a.branchId, permissions: [...a.permissionCodes].sort() }));
  assignments.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return createHash("sha256").update(JSON.stringify({ owner: ctx.profile?.id, active: canUseApplication(ctx), permissions: [...ctx.permissionCodes].sort(), roles: [...ctx.roleCodes].sort(), assignments })).digest("hex");
}

export function hasSameAssistantAuthority(expected: AuthContext, current: AuthContext) {
  return !!expected.profile && !!current.profile && canUseApplication(current)
    && current.profile.id === expected.profile.id
    && current.profile.auth_user_id === expected.profile.auth_user_id
    && assistantAuthorityFingerprint(current) === assistantAuthorityFingerprint(expected);
}

export async function createAssistantHistoryBinding(ctx: AuthContext, sessionId: number, refs: readonly AiEntityReference[]): Promise<AssistantHistoryBinding | null> {
  if (!ctx.profile || !canUseApplication(ctx)) return null;
  const unique = [...new Map(refs.map(r => [assistantSourceKey(r), r])).values()];
  if (unique.length > 10) return null;
  const sources: AssistantHistoryBinding["sources"] = [];
  if (unique.length > 0) {
    const current = await getAuthContext();
    if (!hasSameAssistantAuthority(ctx, current)) return null;
    const request = { context: current, db: await createClient() };
    const versions = await readAuthorizedAssistantSourceVersions(unique, request);
    for (const ref of unique) {
      const sourceVersion = await readSourceVersion(ref, request, versions);
      if (sourceVersion === undefined) return null;
      sources.push({ reference: ref, sourceVersion });
    }
    if (!hasSameAssistantAuthority(current, await getAuthContext())) return null;
  }
  return { version: 1, ownerProfileId: ctx.profile.id, sessionId, authorityFingerprint: assistantAuthorityFingerprint(ctx), sources };
}

async function readSourceVersion(ref: AiEntityReference, request?: AssistantEntityReadRequest, versions?: SourceVersions) {
  if (versions && ref.entityType !== "dms_document") {
    const version = versions.get(assistantSourceKey(ref));
    if (version instanceof Error) throw version;
    return version;
  }
  // DMS retains its explicit per-document permission and current row check.
  return (await readAuthorizedAssistantEntity(ref.entityType, ref.entityId, request))?.version;
}

function parseApplicableBinding(ctx: AuthContext, sessionId: number, raw: unknown) {
  const parsed = bindingSchema.safeParse(raw);
  if (!parsed.success || !ctx.profile || !canUseApplication(ctx)) return null;
  const binding = parsed.data;
  if (binding.ownerProfileId !== ctx.profile.id || binding.sessionId !== sessionId || binding.authorityFingerprint !== assistantAuthorityFingerprint(ctx)) return null;
  return binding;
}

/** Legacy/unbound content is retained, but never treated as authorized history. */
export function createAssistantHistoryVerifier(
  ctx: AuthContext,
  sessionId: number,
  db?: Awaited<ReturnType<typeof createClient>>,
) {
  const verify = createBindingSourceVerifier(db ? { context: ctx, db } : undefined);
  return async (raw: unknown) => {
    const binding = parseApplicableBinding(ctx, sessionId, raw);
    return binding !== null && await verify(binding);
  };
}

export async function verifyAssistantHistoryPage(
  ctx: AuthContext,
  sessionId: number,
  db: AssistantEntityReadRequest["db"],
  rawBindings: readonly unknown[],
) {
  const bindings = rawBindings.map(raw => parseApplicableBinding(ctx, sessionId, raw));
  const request = { context: ctx, db };
  const references = new Map<string, AiEntityReference>();
  for (const binding of bindings) {
    for (const { reference } of binding?.sources ?? []) references.set(assistantSourceKey(reference), reference);
    if (references.size > MAX_HISTORY_SOURCE_CHECKS) break;
  }
  // For larger pages, preserve the existing check budget and ordering even
  // when a missing source short-circuits the remaining checks for a binding.
  const versions = references.size <= MAX_HISTORY_SOURCE_CHECKS
    ? await readAuthorizedAssistantSourceVersions([...references.values()], request)
    : undefined;
  const verify = createBindingSourceVerifier(request, versions);
  const results: boolean[] = [];
  for (const binding of bindings) results.push(binding !== null && await verify(binding));
  return results;
}

function createBindingSourceVerifier(readRequest?: AssistantEntityReadRequest, versions?: SourceVersions) {
  const cache = new Map<string, ReturnType<typeof readSourceVersion>>();
  let checked = 0;
  return async (binding: AssistantHistoryBinding) => {
    for (const source of binding.sources) {
      const key = assistantSourceKey(source.reference);
      let lookup = cache.get(key);
      if (!lookup) {
        if (++checked > MAX_HISTORY_SOURCE_CHECKS) return false;
        lookup = readSourceVersion(source.reference, readRequest, versions);
        cache.set(key, lookup);
      }
      if (await lookup !== source.sourceVersion) return false;
    }
    return true;
  };
}

export async function verifyAssistantSessionNow() {
  const db = await createClient();
  const result = await db.rpc("f03_current_session_valid");
  if (result.error || result.data !== true) throw new Error("Current session unavailable");
}
