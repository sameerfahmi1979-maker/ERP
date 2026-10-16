import {afterEach, beforeEach, expect, it, vi} from "vitest";
import {createClient as sdk} from "@supabase/supabase-js";
import {QueryClient} from "@tanstack/react-query";
vi.mock("next/headers", () => ({cookies: async () => ({getAll: () => [], set: vi.fn()})}));
vi.mock("@/lib/config/server-features", () => ({getAdminConfig: () => ({url: "https://synthetic.invalid", serviceKey: "test-placeholder-not-a-secret"})}));
vi.mock("@/lib/logger", () => ({logger: {warn: vi.fn()}}));
import {applyReadAttemptScope, runSingleDatabaseReadAttempt} from "@/lib/supabase/read-attempt-scope";
import {withSingleReadAttempt} from "@/lib/supabase/read-attempt-policy";
import {withDocumentReadPolicy} from "@/lib/supabase/document-read-policy";
import {createClient as serverClient} from "@/lib/supabase/server";
import {createAdminClient} from "@/lib/supabase/admin";
import {readRoute} from "@/server/reads/route-response";
import {readJson, ReadError, retryAuthorizedRead} from "@/lib/reads/client";

const calls: {path: string; method: string; retry: string | null}[] = [];
let status = 503;
let succeedAfter = Infinity;
const transport: typeof fetch = async (input, init) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  if (url.origin !== "https://synthetic.invalid") throw Error("No real network permitted");
  calls.push({path: url.pathname, method: init?.method ?? "GET", retry: new Headers(init?.headers).get("X-Retry-Count")});
  const actual = calls.length > succeedAfter ? 200 : status;
  return new Response(actual === 200 ? "[]" : JSON.stringify({code: "SYNTHETIC", message: "private diagnostic"}), {
    status: actual, headers: {"Content-Type": "application/json", "Retry-After": "0", "Content-Range": "*/0"},
  });
};
const fresh = () => sdk("https://synthetic.invalid", "test-placeholder-not-a-secret", {auth: {persistSession: false, autoRefreshToken: false}, global: {fetch: transport}});
beforeEach(() => {
  calls.length = 0; status = 503; succeedAfter = Infinity;
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://synthetic.invalid");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-placeholder-not-a-secret");
});
afterEach(() => {vi.unstubAllGlobals(); vi.unstubAllEnvs();});

it("controls actual SDK GET, HEAD and protected document projection retries, not mock builders", async () => {
  const db = withDocumentReadPolicy(withSingleReadAttempt(fresh()));
  for (const read of [() => db.from("departments").select("id"), () => db.from("departments").select("id", {head: true}), () => db.rpc("test_read", {}, {get: true}), () => db.rpc("test_read", {}, {head: true}), () => db.from("dms_documents").select("id")]) {
    calls.length = 0;
    const result = await read();
    expect(result.status).toBe(503); expect(calls).toHaveLength(1); expect(calls[0].retry).toBeNull();
  }
  expect(calls[0].path).toBe("/rest/v1/rpc/f03_read_documents");
});
it("keeps mutation/RPC POST methods and their one-call SDK behavior unchanged", async () => {
  const db = withSingleReadAttempt(fresh());
  await db.from("departments").insert({id: 1});
  await db.rpc("synthetic_mutation", {id: 1});
  expect(calls.map(call => call.method)).toEqual(["POST", "POST"]); expect(calls).toHaveLength(2);
});
it("preserves default SDK retries outside the controlled scope", async () => {
  const db = fresh(); expect(applyReadAttemptScope(db)).toBe(db);
  succeedAfter = 1;
  expect((await db.from("departments").select("id")).error).toBeNull();
  expect(calls).toHaveLength(2); expect(calls[1].retry).toBe("1");
});
it("isolates concurrent asynchronous scopes and releases policy after success or throw", async () => {
  const client = fresh();
  await Promise.all([
    runSingleDatabaseReadAttempt(async () => {await Promise.resolve(); expect(applyReadAttemptScope(client)).not.toBe(client);}),
    (async () => {await Promise.resolve(); expect(applyReadAttemptScope(client)).toBe(client);})(),
  ]);
  expect(applyReadAttemptScope(client)).toBe(client);
  expect(() => runSingleDatabaseReadAttempt(() => {throw Error("synthetic failure");})).toThrow("synthetic failure");
  expect(applyReadAttemptScope(client)).toBe(client);
});
it("both actual server factories respect the read-route scope, including admin bootstrap reads", async () => {
  vi.stubGlobal("fetch", transport);
  const request = new Request("https://synthetic.invalid/api/reads/test", {method: "POST", headers: {"content-type": "application/json"}, body: "{}"});
  const response = await readRoute(request, async () => {
    const server = await serverClient(), admin = createAdminClient();
    const results = await Promise.all([server.from("dms_documents").select("id"), admin.from("user_profiles").select("id")]);
    expect(results.every(result => result.status === 503)).toBe(true);
    return {success: false};
  });
  expect(response.status).toBe(503); expect(calls).toHaveLength(2);
  expect(calls.map(call => call.path)).toEqual(expect.arrayContaining(["/rest/v1/rpc/f03_read_documents", "/rest/v1/user_profiles"]));
});
it.each([503, 403])("whole-read retry with actual route/SDK is bounded for %s", async failedStatus => {
  status = failedStatus; let routes = 0;
  vi.stubGlobal("fetch", async (input: string, init: RequestInit) => {
    routes++;
    return readRoute(new Request(new URL(input, "https://synthetic.invalid").href, init), async () => {
      const result = await applyReadAttemptScope(fresh()).from("departments").select("id");
      return {success: false, error: result.status === 403 ? "Permission denied" : "Temporary read failed"};
    });
  });
  const cache = new QueryClient({defaultOptions: {queries: {retry: retryAuthorizedRead, retryDelay: 0}}});
  try {
    await expect(cache.fetchQuery({queryKey: ["test-read"], queryFn: () => readJson("test", {})})).rejects.toBeInstanceOf(ReadError);
    expect(routes).toBe(failedStatus === 503 ? 2 : 1); expect(calls).toHaveLength(routes);
  } finally {cache.clear();}
});
it("does not retry aborted requests", () => {
  expect(retryAuthorizedRead(0, new DOMException("Synthetic cancel", "AbortError"))).toBe(false);
  expect(retryAuthorizedRead(0, {name: "AbortError"})).toBe(false);
});
it("one SDK attempt also bounds thrown network failures", async () => {
  const brokenFetch=vi.fn(async()=>{throw new TypeError("Synthetic network unavailable");});
  const client=sdk("https://synthetic.invalid","test-placeholder-not-a-secret",{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:brokenFetch}});
  const result=await withSingleReadAttempt(client).from("departments").select("id");
  expect(result.error).not.toBeNull();expect(result.status).toBe(0);expect(brokenFetch).toHaveBeenCalledTimes(1);
});
