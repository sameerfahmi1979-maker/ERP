import { afterEach, beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ headers: vi.fn(), auth: vi.fn() }));
vi.mock("next/headers", () => ({ headers: state.headers }));
vi.mock("@/lib/rbac/check", () => ({ getAuthContext: state.auth }));
import { traceRequest } from "@/lib/performance/request";
import { GET } from "@/app/api/auth/session/route";
beforeEach(() => {
  vi.stubEnv("ALGT_PERF_ENABLED", "true"); vi.stubEnv("ALGT_PERF_LOG_RETENTION_DAYS", "1"); vi.stubEnv("ALGT_PERF_SAMPLE_PERCENT", "100");
  state.headers.mockReset().mockResolvedValue(new Headers({ "x-algt-perf-correlation": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "x-algt-perf-route": "/api/auth/session" }));
  state.auth.mockReset().mockResolvedValue({ profile: { auth_user_id: "PRIVATE", must_change_password: true }, isAccountActive: true, permissionCodes: [], roleCodes: [] });
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
it("does not read request headers when disabled", async () => {
  vi.stubEnv("ALGT_PERF_ENABLED", "false"); expect(await traceRequest("employees.list", async () => 42)).toBe(42); expect(state.headers).not.toHaveBeenCalled();
});
it("propagates only opaque correlation and bounded route through nested requests", async () => {
  await traceRequest("employees.list", () => traceRequest("auth.context", async () => true));
  expect(state.headers).toHaveBeenCalledTimes(1);
  const event = JSON.parse(String(vi.mocked(console.info).mock.calls[0][0]));
  expect(event.id).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"); expect(event.route).toBe("/api/auth/session");
  expect(event.spans[0].offsetMs).toBeGreaterThanOrEqual(0); expect(event.spans[0].offsetMs).toBeLessThanOrEqual(event.ms);
});
it("non-request context preserves result with a fresh correlation", async () => {
  state.headers.mockRejectedValue(new Error("private context")); expect(await traceRequest("employees.list", async () => 7)).toBe(7);
  expect(JSON.stringify(vi.mocked(console.info).mock.calls)).not.toContain("private context");
});
it("preserves actual session response and no-store without logging private response data", async () => {
  const response = await GET(); expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(await response.json()).toEqual({ authUserId: "PRIVATE", active: true, requiredChange: true, scopeVersion: expect.stringMatching(/^[a-f0-9]{64}$/) });
  const logs = JSON.stringify(vi.mocked(console.info).mock.calls); expect(logs).toContain("response.json"); expect(logs).not.toContain("PRIVATE");
  expect(response.headers.has("server-timing")).toBe(false); expect(response.headers.has("x-algt-perf-correlation")).toBe(false);
});
it("preserves unavailable session HTTP 503 without exposing the exception", async () => {
  state.auth.mockRejectedValue(new Error("PRIVATE")); const response = await GET(); expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: "Session verification unavailable" });
  const event = JSON.parse(String(vi.mocked(console.info).mock.calls[0][0])); expect(event.outcome).toBe("error"); expect(JSON.stringify(event)).not.toContain("PRIVATE");
});
