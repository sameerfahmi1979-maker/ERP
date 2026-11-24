import { afterEach, describe, expect, it, vi } from "vitest";
import { getAuthContext } from "@/lib/rbac/check";
import { changeAgentControl, inspectAgentControl } from "@/server/actions/ai-agent-center";
import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/rbac/check", () => ({ getAuthContext: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const scope = { companyId: 1, branchId: 11, agent: "dms.intake" };

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("scope controls server boundary", () => {
  it("does not reach the database when no authoritative worker is configured", async () => {
    vi.stubEnv("DMS_AGENT_CENTER_CONTROL_API_ENABLED", "false");
    expect(await inspectAgentControl(scope)).toBeNull();
    expect(await changeAgentControl({ ...scope, action: "pause", expectedRevision: 0,
      requestId: "00000000-0000-4000-8000-000000000012", reason: "Operator test" })).toEqual({ ok: false, reason: "unavailable" });
    expect(getAuthContext).not.toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();
  });

  it("validates action reason and rejects invented agent keys", async () => {
    vi.stubEnv("DMS_AGENT_CENTER_CONTROL_API_ENABLED", "true");
    expect(await changeAgentControl({ ...scope, agent: "anything", action: "pause", reason: "" })).toEqual({ ok: false, reason: "invalid" });
    expect(getAuthContext).not.toHaveBeenCalled();
  });
});
