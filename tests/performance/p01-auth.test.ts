import { afterEach, beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  active: true,
  forced: false,
  session: true,
  user: true,
  profileFound: true,
  failed: false,
  graphOverride: undefined as unknown,
  calls: [] as string[],
}));
const profile = () => ({
  id: 10,
  auth_user_id: "private-id",
  owner_company_id: null,
  branch_id: null,
  status: state.active ? "active" : "suspended",
  must_change_password: state.forced,
});

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => {
        state.calls.push("getUser");
        return { data: { user: state.user ? { id: "private-id", email: "private@example.invalid" } : null }, error: null };
      },
    },
    rpc: async (name: string) => {
      state.calls.push(name);
      return { data: state.session, error: null };
    },
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (name: string) => {
      state.calls.push(name);
      const builder = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: async () => ({ data: state.profileFound ? profile() : null, error: null }),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({
          data: [],
          error: state.failed ? { message: "PRIVATE" } : null,
        })),
      };
      return builder;
    },
    rpc: async (name: string, input: unknown) => {
      state.calls.push(name);
      expect(input).toEqual({ p_auth_user_id: "private-id" });
      return {
        data: state.graphOverride ?? (state.profileFound ? {
          profile: profile(),
          assignments: [],
          roles: [],
          links: [],
          permissions: [],
        } : null),
        error: state.failed ? { message: "PRIVATE" } : null,
      };
    },
  }),
}));

import { getAuthContext } from "@/lib/rbac/check";

const verifiedTransport = ["getUser", "f03_current_session_valid", "erp_current_auth_graph"];

it("returns the digest attached to the same authenticated Assistant generation graph", async () => {
  const hash = "a".repeat(64);
  state.graphOverride = { graph: { profile: profile(), assignments: [], roles: [], links: [], permissions: [] }, hash };
  const ctx = await getAuthContext({ bindAssistantPublication: true });
  expect(ctx.assistantPublicationGraphHash).toBe(hash);
  expect(state.calls).toEqual(["getUser", "f03_current_session_valid", "erp_assistant_publication_auth_graph"]);
});

it("rejects an Assistant generation graph without its digest", async () => {
  state.graphOverride = { graph: { profile: profile(), assignments: [], roles: [], links: [], permissions: [] } };
  await expect(getAuthContext({ bindAssistantPublication: true })).rejects.toThrow("Assistant authority unavailable");
});

beforeEach(() => {
  Object.assign(state, {
    active: true, forced: false, session: true, user: true, profileFound: true,
    failed: false, graphOverride: undefined, calls: [],
  });
  vi.stubEnv("ALGT_PERF_ENABLED", "true");
  vi.stubEnv("ALGT_PERF_LOG_RETENTION_DAYS", "1");
  vi.stubEnv("ALGT_PERF_SAMPLE_PERCENT", "100");
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

it("fetches one authorization graph after verifying the user and current session", async () => {
  const enabled = await getAuthContext();
  expect(state.calls).toEqual(verifiedTransport);
  state.calls = [];
  vi.stubEnv("ALGT_PERF_ENABLED", "false");
  expect(await getAuthContext()).toEqual(enabled);
  expect(state.calls).toEqual(verifiedTransport);
  expect(enabled.isAccountActive).toBe(true);
  const log = JSON.stringify(vi.mocked(console.info).mock.calls);
  expect(log).toContain("auth.permissions");
  expect(log).not.toContain("private-id");
  expect(log).not.toContain("private@example.invalid");
});

it("retains session-revocation denial before the admin bootstrap", async () => {
  state.session = false;
  expect((await getAuthContext()).profile).toBeNull();
  expect(state.calls).toEqual(verifiedTransport.slice(0, 2));
});

it("skips database reads when GoTrue returns no identity", async () => {
  state.user = false;
  expect((await getAuthContext()).profile).toBeNull();
  expect(state.calls).toEqual(["getUser"]);
});

it("retains a verified user's email when no ERP profile exists", async () => {
  state.profileFound = false;
  expect(await getAuthContext()).toMatchObject({
    profile: null, email: "private@example.invalid", isAccountActive: false, permissionCodes: [],
  });
});

it.each(["suspended", "forced"])("does not grant permissions to a %s account", async (status) => {
  state.active = status !== "suspended";
  state.forced = status === "forced";
  const ctx = await getAuthContext();
  expect(ctx.isAccountActive).toBe(state.active);
  expect(ctx.permissionCodes).toEqual([]);
  expect(ctx.roleAssignments).toEqual([]);
  expect(state.calls).toEqual(verifiedTransport);
});

it("fails closed when graph transport fails without logging its details", async () => {
  state.failed = true;
  await expect(getAuthContext()).rejects.toThrow("Unable to resolve authorization context");
  expect(JSON.stringify(vi.mocked(console.info).mock.calls)).not.toContain("PRIVATE");
});

it("fails closed when the graph belongs to a different identity or is incomplete", async () => {
  state.graphOverride = {
    profile: { ...profile(), auth_user_id: "other-private-id" },
    assignments: [],
    roles: [],
    links: [],
    permissions: [],
  };
  await expect(getAuthContext()).rejects.toThrow("Unable to resolve authorization context");
  state.graphOverride = { profile: profile(), assignments: [], roles: [], links: [] };
  await expect(getAuthContext()).rejects.toThrow("Unable to resolve authorization context");
});
