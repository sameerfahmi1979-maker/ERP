import { afterEach, expect, it, vi } from "vitest";
import { bindTransportSession, clearMessagingSession } from "../offline-session";
import { Vault, type Intent } from "../vault";

const ok = (data: unknown) => Response.json({ success: true, data });
const unavailable = () => Response.json({ error: { message: "Unavailable" } }, { status: 404 });

function fixture(prepared = false) {
  bindTransportSession("current");
  const vault = new Vault("account", "current", "12");
  const item = { id: crypto.randomUUID(), uploadKey: crypto.randomUUID(), name: "report.pdf", mime: "application/pdf", voice: false };
  const intent: Intent = {
    id: crypto.randomUUID(), conversationId: "thread", session: "current", uploadSession: "current",
    termsVersion: "v1", body: "text", mentions: [], uploads: [item], createdAt: "", state: "queued",
    ...(prepared ? { preparedArgs: { conversationId: "thread", body: "text", uploadIds: ["old"], mentionProfileIds: [] } } : {}),
  };
  const calls: { op: string; args: Record<string, unknown> }[] = [];
  const stored: Intent[] = [];
  vi.spyOn(vault, "readBytes").mockResolvedValue(new Uint8Array([1, 2, 3, 4]).buffer);
  vi.spyOn(vault, "save").mockImplementation(async (saved) => { stored.push(structuredClone(saved)); });
  vi.spyOn(vault, "remove").mockResolvedValue(undefined);
  let oldStatus = () => ok({ uploadId: "old", conversationId: "thread", byteLength: 4, state: "verified", terminal: true });
  let send = (ids: unknown) => Array.isArray(ids) && ids[0] === "new" ? ok({ id: "message" }) : unavailable();
  vi.stubGlobal("fetch", async (path: string, init: RequestInit) => {
    if (path.endsWith("/uploads/new")) return ok({ uploadId: "new", state: "verified" });
    if (path.endsWith("/uploads/old")) throw new Error("Old file bytes should not be uploaded");
    const { op, args } = JSON.parse(String(init.body));
    calls.push({ op, args });
    switch (op) {
      case "communications.profile": return ok({ profileId: "12", chat: { configured: true, eligible: true } });
      case "chat.conversation": return ok({ id: "thread" });
      case "policy.status": return ok({ accepted: true, currentVersion: "v1" });
      case "chat.uploadBegin": {
        if (args.clientMutationId === item.uploadKey) return ok({ uploadId: "old" });
        expect(stored.at(-1)?.uploads[0].uploadKey).toBe(args.clientMutationId);
        expect(stored.at(-1)?.preparedArgs).toBeUndefined();
        return ok({ uploadId: "new" });
      }
      case "chat.uploadStatus": return args.uploadId === "old" ? oldStatus() : ok({ uploadId: "new", conversationId: "thread", byteLength: 4, state: "reserved", terminal: false });
      case "chat.send": return send(args.uploadIds);
      default: throw new Error("Unexpected operation: " + op);
    }
  });
  return {
    vault, intent, item, calls, stored,
    send: (intentToSend = intent) => vault.send(intentToSend, new AbortController().signal),
    status: (get: typeof oldStatus) => { oldStatus = get; },
    sendResult: (result: typeof send) => { send = result; },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  clearMessagingSession();
});

it.each(["reserved", "failed"])("rotates a %s terminal stage before uploading bytes", async (state) => {
  const f = fixture();
  f.status(() => ok({ uploadId: "old", conversationId: "thread", byteLength: 4, state, terminal: true }));
  await f.send();
  const begins = f.calls.filter(({ op }) => op === "chat.uploadBegin");
  expect(begins).toHaveLength(2);
  expect(begins[0].args.clientMutationId).toBe(f.item.uploadKey);
  expect(begins[1].args.clientMutationId).not.toBe(f.item.uploadKey);
  expect(f.calls.at(-1)?.args).toMatchObject({ clientMutationId: f.intent.id, uploadIds: ["new"] });
});

it("replays a prepared send before replacing its expired verified stage with the same message key", async () => {
  const f = fixture(true);
  await f.send();
  const sent = f.calls.filter(({ op }) => op === "chat.send");
  expect(sent.map(({ args }) => args)).toEqual([
    { ...f.intent.preparedArgs, clientMutationId: f.intent.id },
    { ...f.intent.preparedArgs, clientMutationId: f.intent.id, uploadIds: ["new"] },
  ]);
  expect(f.calls.findIndex(({ op }) => op === "chat.send")).toBeLessThan(f.calls.findIndex(({ op }) => op === "chat.uploadStatus"));
});

it.each([
  ["has a usable stage", () => ok({ uploadId: "old", conversationId: "thread", byteLength: 4, state: "verified", terminal: false })],
  ["has a committed stage", () => ok({ uploadId: "old", conversationId: "thread", byteLength: 4, state: "attached", terminal: false })],
  ["has a different stage", () => ok({ uploadId: "other", conversationId: "thread", byteLength: 4, state: "failed", terminal: true })],
  ["has moved out of scope", unavailable],
] as const)("keeps the original prepared send when a 404 %s", async (_, status) => {
  const f = fixture(true);
  f.status(status);
  await expect(f.send()).rejects.toThrow();
  expect(f.stored).toEqual([]);
  expect(f.calls.some(({ op }) => op === "chat.uploadBegin")).toBe(false);
});

it("recovers a lost successful reply across a reviewed login using the exact send key and payload", async () => {
  const f = fixture(true);
  f.sendResult(() => { throw new TypeError("Connection lost after commit"); });
  await expect(f.send()).rejects.toThrow("Connection lost");
  f.sendResult(() => ok({ id: "original message" }));
  await f.send({ ...f.intent, uploadSession: "old login" });
  expect(f.calls.filter(({ op }) => op === "chat.send").map(({ args }) => args)).toEqual([
    { ...f.intent.preparedArgs, clientMutationId: f.intent.id },
    { ...f.intent.preparedArgs, clientMutationId: f.intent.id },
  ]);
  expect(f.calls.some(({ op }) => op.startsWith("chat.upload"))).toBe(false);
  expect(f.stored).toEqual([]);
});

it("preserves the exact prepared command when a new login cannot confirm the earlier send", async () => {
  const f = fixture(true);
  await expect(f.send({ ...f.intent, uploadSession: "old login" })).rejects.toThrow("Unavailable");
  expect(f.calls.filter(({ op }) => op === "chat.send").map(({ args }) => args)).toEqual([
    { ...f.intent.preparedArgs, clientMutationId: f.intent.id },
  ]);
  expect(f.calls.some(({ op }) => op.startsWith("chat.upload"))).toBe(false);
  expect(f.stored).toEqual([]);
});

it("reuses the same replacement reservation key when two tabs recover one terminal stage", async () => {
  const f = fixture();
  await Promise.all([f.send(), f.send()]);
  const newKeys = f.calls.filter(({ op, args }) => op === "chat.uploadBegin" && args.clientMutationId !== f.item.uploadKey)
    .map(({ args }) => args.clientMutationId);
  expect(newKeys).toHaveLength(2);
  expect(new Set(newKeys).size).toBe(1);
});
