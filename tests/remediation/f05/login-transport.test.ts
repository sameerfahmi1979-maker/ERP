import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ quota: vi.fn(), password: vi.fn() }));
vi.mock("@/lib/auth/security-email", () => ({ allowSecurityRequest: state.quota }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { signInWithPassword: state.password } }) }));
import { POST } from "@/app/api/auth/login/route";

const input = { email: "  TEST@example.invalid ", password: "synthetic-test-only" };
function request(overrides: Record<string, string> = {}, body = JSON.stringify(input)) {
  return new Request("http://internal-proxy/api/auth/login", { method: "POST", body,
    headers: { origin: "https://erp.algt.net", "content-type": "application/json", "sec-fetch-site": "same-origin", ...overrides } });
}
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://erp.algt.net");
  state.quota.mockReset().mockResolvedValue(true);
  state.password.mockReset().mockResolvedValue({ data: { user: { id: "synthetic" } }, error: null });
});
afterEach(() => vi.unstubAllEnvs());

describe("bounded login transport preserves F03 security", () => {
  it("returns only a completed success boolean, normalizes email and preserves the quota", async () => {
    const response = await POST(request());
    expect(await response.json()).toEqual({ success: true });
    expect(state.quota).toHaveBeenCalledWith("login", "test@example.invalid");
    expect(state.password).toHaveBeenCalledWith({ ...input, email: "test@example.invalid" });
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("pragma")).toBe("no-cache");
  });
  it.each(["https://attacker.invalid", "https://erp.algt.net.attacker.invalid", "http://erp.algt.net", "null", ""])("rejects untrusted or absent origin %s", async origin => {
    expect((await POST(request({ origin }))).status).toBe(403);
    expect(state.quota).not.toHaveBeenCalled();
    expect(state.password).not.toHaveBeenCalled();
  });
  it.each(["cross-site", "same-site", "none"])("rejects contradictory browser context %s", async site => {
    expect((await POST(request({ "sec-fetch-site": site }))).status).toBe(403);
    expect(state.password).not.toHaveBeenCalled();
  });
  it("accepts browsers without Fetch Metadata only with an exact configured origin", async () => {
    const req = request(); req.headers.delete("sec-fetch-site");
    expect(await (await POST(req)).json()).toEqual({ success: true });
  });
  it.each(["text/plain", "application/x-www-form-urlencoded", ""])("rejects non-JSON content type %s", async type => {
    expect((await POST(request({ "content-type": type }))).status).toBe(415);
    expect(state.password).not.toHaveBeenCalled();
  });
  it.each(["8193", "-1", "bad"])("rejects invalid/oversized declared length %s", async length => {
    expect((await POST(request({ "content-length": length }))).status).toBe(413);
    expect(state.password).not.toHaveBeenCalled();
  });
  it("bounds bytes even without an honest Content-Length", async () => {
    expect((await POST(request({ "content-length": "1" }, "x".repeat(8193)))).status).toBe(413);
    expect(state.password).not.toHaveBeenCalled();
  });
  it("handles malformed JSON without logging or echoing input", async () => {
    const response = await POST(request({}, "{broken"));
    expect(response.status).toBe(400); expect(await response.json()).toEqual({ success: false });
    expect(state.password).not.toHaveBeenCalled();
  });
  it.each([{ email: "bad", password: "x" }, { email: "test@example.invalid", password: "" }])("validates credentials before quota/auth", async value => {
    expect(await (await POST(request({}, JSON.stringify(value)))).json()).toEqual({ success: false });
    expect(state.quota).not.toHaveBeenCalled(); expect(state.password).not.toHaveBeenCalled();
  });
  it("fails closed when the durable quota denies access", async () => {
    state.quota.mockResolvedValue(false);
    expect(await (await POST(request())).json()).toEqual({ success: false });
    expect(state.password).not.toHaveBeenCalled();
  });
  it.each(["wrong password", "no account", "provider timeout"])("does not expose %s", async message => {
    state.password.mockRejectedValue(new Error(message));
    const response = await POST(request());
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ success: false });
  });
});
