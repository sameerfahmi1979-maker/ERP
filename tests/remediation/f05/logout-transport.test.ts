import { beforeEach, afterEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ revoke: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { signOut: state.revoke } }) }));
vi.mock("next/cache", () => ({ revalidatePath: state.revalidate }));
import { POST } from "@/app/api/auth/logout/route";
import { signOut } from "@/lib/auth/logout-client";
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://erp.algt.net");
  state.revoke.mockReset().mockResolvedValue({ error: null }); state.revalidate.mockReset();
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
const request = (origin = "https://erp.algt.net") => new Request("https://internal-proxy/api/auth/logout", {
  method: "POST", headers: { origin, "sec-fetch-site": "same-origin" },
});
it("revokes only the current session and returns an uncached completed response", async () => {
  const r = await POST(request());
  expect(await r.json()).toEqual({ success: true });
  expect(state.revoke).toHaveBeenCalledWith({ scope: "local" });
  expect(state.revalidate).toHaveBeenCalledWith("/", "layout");
  expect(r.headers.get("cache-control")).toContain("no-store");
});
it.each(["https://attacker.invalid", "null", ""])("rejects cross-origin logout %s before revocation", async origin => {
  expect((await POST(request(origin))).status).toBe(403); expect(state.revoke).not.toHaveBeenCalled();
});
it("does not claim revocation when the provider fails", async () => {
  state.revoke.mockResolvedValue({ error: new Error("private") });
  expect(await (await POST(request())).json()).toEqual({ success: false });
  expect(state.revalidate).not.toHaveBeenCalled();
});
it("does not echo a provider exception", async () => {
  state.revoke.mockRejectedValue(new Error("private"));
  expect(await (await POST(request())).json()).toEqual({ success: false });
});
it("the browser helper requires a completed strict success response", async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ success: true })); vi.stubGlobal("fetch", fetch);
  expect(await signOut()).toEqual({ success: true });
  expect(fetch).toHaveBeenCalledWith("/api/auth/logout", expect.objectContaining({ method: "POST", credentials: "same-origin", redirect: "error" }));
});
it.each([null, {}, { success: "true" }, { success: false }])("rejects malformed or unsuccessful JSON %j", async value => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(value)));
  expect((await signOut()).success).toBe(false);
});
it("waits for response completion rather than only headers", async () => {
  let resolve!: (value: unknown) => void;
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: () => new Promise(r => { resolve = r; }) }));
  let settled = false; const pending = signOut().then(r => { settled = true; return r; });
  await Promise.resolve(); await Promise.resolve(); expect(settled).toBe(false);
  resolve({ success: true }); expect((await pending).success).toBe(true);
});
it("an interrupted response does not trigger identity navigation or success", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => { throw new Error("cut off"); } }));
  expect((await signOut()).success).toBe(false);
});
