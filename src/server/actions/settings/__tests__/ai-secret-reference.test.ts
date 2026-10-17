import { afterEach, beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ allowed: true, provider: { id: 8, provider_type: "openai", updated_at: "2026-10-17T00:00:00Z" } as Record<string, unknown> | null,
  updated: [{ id: 8 }] as { id: number }[], writes: vi.fn(), audit: vi.fn(), writer: vi.fn() }));
vi.mock("@/lib/rbac/check", () => ({ getAuthContext: async () => ({ profile: { id: 1, must_change_password: false }, isAccountActive: true, globalPermissionCodes: state.allowed ? ["settings.ai.secrets.manage"] : [], roleAssignments: [] }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/ai/providers/factory", () => ({ getAiProvider: vi.fn() }));
vi.mock("@/server/actions/audit", () => ({ logAudit: state.audit }));
vi.mock("@/lib/settings/env-file-secrets", () => ({ writeAiProviderSecret: state.writer }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => {
  const read = { select: () => read, eq: () => read, is: () => read, maybeSingle: async () => ({ data: state.provider, error: null }) };
  const write = { eq: () => write, is: () => write, select: async () => ({ data: state.updated, error: null }) };
  return { from: () => ({ ...read, update: (value: unknown) => { state.writes(value); return write; } }) };
} }));
import { saveAiProviderSecretReference, saveAiProviderSecret } from "../ai-settings";
beforeEach(() => { state.allowed = true; state.provider = { id: 8, provider_type: "openai", updated_at: "2026-10-17T00:00:00Z" };
  state.updated = [{ id: 8 }]; vi.clearAllMocks(); vi.stubEnv("OPENAI_API_KEY", "synthetic-deployment-key"); });
afterEach(() => vi.unstubAllEnvs());
it("links an existing Railway key without writing a file, changing env or persisting plaintext", async () => {
  expect(await saveAiProviderSecretReference({ id: 8, secret_ref: "OPENAI_API_KEY" })).toEqual({ success: true });
  expect(state.writes).toHaveBeenCalledWith(expect.objectContaining({ secret_ref: "OPENAI_API_KEY", masked_secret_preview: null }));
  expect(JSON.stringify(state.writes.mock.calls)).not.toContain("synthetic-deployment-key");
  expect(JSON.stringify(state.audit.mock.calls)).not.toContain("synthetic-deployment-key");
  expect(process.env.OPENAI_API_KEY).toBe("synthetic-deployment-key"); expect(state.writer).not.toHaveBeenCalled();
});
it("requires secret-management permission", async () => { state.allowed = false;
  expect((await saveAiProviderSecretReference({ id: 8, secret_ref: "OPENAI_API_KEY" })).success).toBe(false); expect(state.writes).not.toHaveBeenCalled(); });
it.each(["SUPABASE_SERVICE_ROLE_KEY", "INTERNAL_API_SECRET", "ERP_AI_PROVIDER_9_KEY", "AZURE_DOCUMENT_INTELLIGENCE_KEY"])("rejects out-of-scope reference %s", async secret_ref => {
  expect((await saveAiProviderSecretReference({ id: 8, secret_ref })).success).toBe(false); expect(state.writes).not.toHaveBeenCalled(); });
it("rejects a missing deployment variable", async () => { vi.stubEnv("OPENAI_API_KEY", "");
  expect((await saveAiProviderSecretReference({ id: 8, secret_ref: "OPENAI_API_KEY" })).success).toBe(false); expect(state.writes).not.toHaveBeenCalled(); });
it("does not claim success on a concurrent provider update", async () => { state.updated = [];
  expect((await saveAiProviderSecretReference({ id: 8, secret_ref: "OPENAI_API_KEY" })).success).toBe(false); expect(state.audit).not.toHaveBeenCalled(); });
it("rejects an unavailable provider", async () => { state.provider = null;
  expect((await saveAiProviderSecretReference({ id: 8, secret_ref: "OPENAI_API_KEY" })).success).toBe(false); expect(state.writes).not.toHaveBeenCalled(); });
it("reuses an identical pasted deployment key without invoking rotation", async () => {
  expect((await saveAiProviderSecret({ id: 8, secret_ref: "OPENAI_API_KEY", secret_value: "synthetic-deployment-key" })).success).toBe(true);
  expect(state.writer).not.toHaveBeenCalled(); expect(state.writes).toHaveBeenCalled();
});
it("does not silently ignore a different replacement key", async () => {
  state.writer.mockResolvedValueOnce({ success: false, error: "Server-file secret updates are disabled." });
  expect((await saveAiProviderSecret({ id: 8, secret_ref: "OPENAI_API_KEY", secret_value: "a-different-synthetic-key" })).success).toBe(false);
  expect(state.writes).not.toHaveBeenCalled();
});
it("keeps a confirmed reference change confirmed when audit and cache effects throw", async () => {
  state.audit.mockRejectedValueOnce(Error("SYNTHETIC_PRIVATE_DETAIL"));
  const { revalidatePath } = await import("next/cache");
  vi.mocked(revalidatePath).mockImplementationOnce(() => { throw Error("SYNTHETIC_PRIVATE_DETAIL"); });
  expect(await saveAiProviderSecretReference({ id: 8, secret_ref: "OPENAI_API_KEY" })).toEqual({ success: true });
  expect(state.writes).toHaveBeenCalledOnce();
});
