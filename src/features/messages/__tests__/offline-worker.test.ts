import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, it, expect, vi } from "vitest";
import nextConfig from "../../../../next.config";

const script = readFileSync("public/messages-offline-worker.js", "utf8"),
  origin = "https://erp.test";
function worker() {
  const listeners = new Map<string, (event: unknown) => void>(),
    cache = new Map<string, Response>();
  const store = {
    put: async (url: URL, r: Response) => {
      cache.set(url.pathname, r.clone());
    },
    match: async (p: string | URL) => cache.get(typeof p === "string" ? p : p.pathname)?.clone(),
  };
  const fetch = vi.fn(async (u: URL | string | Request, init?: RequestInit) => {
    if (init?.credentials && init.credentials !== "omit") throw Error("Unexpected credentials");
    const url = new URL(u instanceof Request ? u.url : String(u), origin),
      file = url.pathname.slice(1);
    if (!["messages-offline.html", "messages-offline.css", "messages-offline.mjs"].includes(file))
      throw TypeError("offline");
    const body = readFileSync("public/" + file, "utf8");
    const response = new Response(body, {
      headers: {
        "Content-Type": file.endsWith(".html")
          ? "text/html"
          : file.endsWith(".css")
            ? "text/css"
            : "application/javascript",
      },
    });
    Object.defineProperty(response, "url", { value: url.href });
    return response;
  });
  runInNewContext(script, {
    URL,
    Response,
    crypto,
    Uint8Array,
    fetch,
    caches: { open: async () => store },
    self: {
      location: { origin },
      addEventListener: (type: string, handler: (event: unknown) => void) => listeners.set(type, handler),
      skipWaiting: async () => {},
    },
  });
  const install = () =>
    new Promise<void>((resolve, reject) =>
      listeners.get("install")!({ waitUntil: (p: Promise<void>) => p.then(resolve, reject) }),
    );
  function navigate(path: string, mode = "navigate") {
    let result: Promise<Response> | undefined;
    listeners.get("fetch")!({
      request: { method: "GET", mode, url: origin + path },
      respondWith: (p: Promise<Response>) => {
        result = p;
      },
    });
    return result;
  }
  return { cache, fetch, install, navigate };
}
describe("restricted offline Messages shell", () => {
  it("caches only the three pinned public files without authentication and returns neutral HTML on offline navigation", async () => {
    const w = worker();
    await w.install();
    expect([...w.cache.keys()].sort()).toEqual([
      "/messages-offline.css",
      "/messages-offline.html",
      "/messages-offline.mjs",
    ]);
    for (const call of w.fetch.mock.calls)
      expect(call[1]).toMatchObject({ credentials: "omit", redirect: "error" });
    const r = await w.navigate("/messages?conversationId=x");
    expect(r?.headers.get("Cache-Control")).toBe("no-store");
    expect(await r?.text()).toContain("Checking this device");
    expect(w.navigate("/messages", "cors")).toBeUndefined();
    for (const path of [
      "/messages/other",
      "/api/mobile/communications/v1",
      "/admin/users",
      "/api/mobile/dms/shared",
    ])
      expect(w.navigate(path)).toBeUndefined();
  });
  it("rejects substituted HTML even when the URL, MIME and status match", async () => {
    const w = worker(),
      fake = new Response("<html>private</html>", { headers: { "Content-Type": "text/html" } });
    Object.defineProperty(fake, "url", { value: origin + "/messages-offline.html" });
    w.fetch.mockResolvedValueOnce(fake);
    await expect(w.install()).rejects.toThrow("integrity");
    expect(w.cache.size).toBe(0);
  });
  it("enables the microphone only on the ordinary messages page", async () => {
    const rules = await nextConfig.headers!();
    const policy = (source: string) =>
      rules.find((r) => r.source === source)?.headers.find((h) => h.key === "Permissions-Policy")?.value;
    expect(policy("/:path*")).toContain("microphone=()");
    expect(policy("/messages")).toContain("microphone=(self)");
  });
});
