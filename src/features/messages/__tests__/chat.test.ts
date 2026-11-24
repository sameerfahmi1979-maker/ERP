import { afterEach, describe, it, expect, vi } from "vitest";
import {
  canChange,
  dateInterval,
  documentToken,
  usdMicros,
  root,
  type Message,
  type Conversation,
} from "../model";
import { command, mutate, upload, pages, ChatError } from "../client";
import { Vault, type Intent } from "../vault";
import {
  clearMessagingSession,
  rememberMessagingSession,
  offlineMessagingSession,
  bindTransportSession,
  communicationSignal,
} from "../offline-session";
const ok = (data: unknown) => Response.json({ success: true, data });
afterEach(() => {
  vi.unstubAllGlobals();
  clearMessagingSession();
});
describe("ERP messages", () => {
  it("preserves decimal IDs, same-origin cookies and mutation IDs across explicit retries", async () => {
    const fetch = vi.fn().mockResolvedValue(ok({ id: "t" }));
    vi.stubGlobal("fetch", fetch);
    const key = crypto.randomUUID();
    await mutate("chat.direct", { peerProfileId: "9223372036854775807" }, key);
    expect(fetch).toHaveBeenCalledWith(
      root,
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({
          op: "chat.direct",
          args: { peerProfileId: "9223372036854775807", clientMutationId: key },
        }),
      }),
    );
  });
  it("surfaces a held operation and protects the precise edit deadline", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ success: false, error: { message: "Operation on hold" } }, { status: 503 }),
        ),
    );
    await expect(command("chat.conversations", { mode: "participant" })).rejects.toEqual(
      new ChatError(503, "Operation on hold"),
    );
    const at = Date.UTC(2026, 0, 1),
      m = { senderProfileId: "3", sentAt: new Date(at).toISOString(), kind: "message" } as Message;
    expect(canChange(m, {} as Conversation, "3", at + 899999).edit).toBe(true);
    expect(canChange(m, { canManageMembers: true } as Conversation, "3", at + 900000).remove).toBe(false);
    expect(canChange(m, { canManageMembers: true } as Conversation, "5", at + 900000)).toEqual({
      edit: false,
      remove: true,
    });
  });
  it("accepts only the current ERP Android share handoff and half-open local dates", () => {
    const origin = "https://erp.example",
      token = "A".repeat(43),
      path = "/api/mobile/dms/shared#" + token;
    expect(documentToken(origin + path, origin)).toBe(token);
    for (const candidate of [
      "https://other.example" + path,
      path.replace("#", "?probe=x#"),
      path + "x",
      "/dms/files#" + token,
    ])
      expect(() => documentToken(candidate, origin)).toThrow();
    expect(dateInterval("2026-11-23", "2026-11-23")).toEqual({
      from: new Date(2026, 10, 23).toISOString(),
      until: new Date(2026, 10, 24).toISOString(),
    });
    expect(() => dateInterval("2026-11-24", "2026-11-23")).toThrow();
    expect(usdMicros("100.000001")).toBe("100000001");
    expect(() => usdMicros("0.0000001")).toThrow();
  });
  it("requires verified upload bytes and reuses an existing verified reservation", async () => {
    const file = new File(["test"], "notice.pdf", { type: "application/pdf" }),
      key = crypto.randomUUID();
    const f = vi
      .fn()
      .mockResolvedValueOnce(ok({ uploadId: "u" }))
      .mockResolvedValueOnce(ok({ uploadId: "u", conversationId: "t", byteLength: 4, state: "reserved" }))
      .mockResolvedValueOnce(ok({ state: "failed" }));
    vi.stubGlobal("fetch", f);
    await expect(upload("t", file, false, key)).rejects.toThrow("verification");
    expect(f.mock.calls[2][0]).toBe(root + "/uploads/u");
    f.mockClear()
      .mockResolvedValueOnce(ok({ uploadId: "u" }))
      .mockResolvedValueOnce(ok({ uploadId: "u", conversationId: "t", byteLength: 4, state: "verified" }));
    expect(await upload("t", file, false, key)).toBe("u");
    expect(f).toHaveBeenCalledTimes(2);
  });
  it("retries an ambiguous action with its original mutation ID and fences a signed-out request", async () => {
    bindTransportSession("session-A");
    const fetch = vi.fn().mockRejectedValueOnce(new TypeError("network")).mockResolvedValueOnce(ok({}));
    vi.stubGlobal("fetch", fetch);
    const args = { messageId: "one", enabled: true };
    await expect(mutate("chat.star", args)).rejects.toThrow("network");
    await mutate("chat.star", args);
    expect(JSON.parse(fetch.mock.calls[0][1].body).args.clientMutationId).toEqual(
      JSON.parse(fetch.mock.calls[1][1].body).args.clientMutationId,
    );
    expect(fetch.mock.calls[0][1].headers.get("x-erp-communication-session")).toBe("session-A");
    const stale = communicationSignal();
    clearMessagingSession();
    bindTransportSession("session-B");
    await expect(mutate("chat.star", args, crypto.randomUUID(), stale)).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("refetches the canonical receipt after uncertain sends, respecting a changed terms version", async () => {
    bindTransportSession("s");
    const v = new Vault("a", "s", "11");
    const intent: Intent = {
      id: crypto.randomUUID(),
      session: "s",
      state: "queued",
      createdAt: "",
      conversationId: "t",
      body: "text",
      mentions: [],
      uploads: [],
      termsVersion: "v1",
      preparedArgs: { conversationId: "t", body: "text", uploadIds: [], mentionProfileIds: [] },
    };
    let version = "v2";
    const sent: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_, init) => {
        const { op, args } = JSON.parse(init.body);
        if (op === "chat.send") sent.push(args);
        return ok(
          op === "communications.profile"
            ? { profileId: "11", chat: { eligible: true, configured: true } }
            : op === "policy.status"
              ? { accepted: true, currentVersion: version }
              : { id: "t" },
        );
      }),
    );
    vi.spyOn(v, "remove").mockResolvedValue(undefined);
    await expect(v.send(intent, new AbortController().signal)).rejects.toThrow("Review");
    expect(sent).toEqual([]);
    version = "v1";
    await v.send(intent, new AbortController().signal);
    expect(sent).toEqual([{ ...intent.preparedArgs, clientMutationId: intent.id }]);
  });
  it("rejects repeated pagination cursors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => Promise.resolve(ok({ items: [], nextCursor: "same" }))),
    );
    await expect(pages("chat.search", { query: "q", mode: "review" })).rejects.toThrow("advance");
  });
  it("keeps offline recovery bound to its document and ERP account", () => {
    rememberMessagingSession({ account: "a", session: "s", expectedProfile: "11" });
    expect(offlineMessagingSession("b")).toBeUndefined();
    expect(offlineMessagingSession("a")?.session).toBe("s");
    clearMessagingSession();
    expect(offlineMessagingSession("a")).toBeUndefined();
  });
  it("rechecks current actor, terms and conversation before issuing a durable send; refuses previous sessions", async () => {
    bindTransportSession("s");
    const v = new Vault("a", "s", "11"),
      intent: Intent = {
        id: crypto.randomUUID(),
        conversationId: "t",
        session: "s",
        body: "Hi",
        mentions: [],
        state: "queued",
        uploads: [],
        createdAt: "now",
      };
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_, init) => {
        const { op } = JSON.parse(init.body);
        calls.push(op);
        return ok(
          op === "communications.profile"
            ? { profileId: "22", chat: { configured: true, eligible: true } }
            : op === "chat.conversation"
              ? { id: "t" }
              : { accepted: true },
        );
      }),
    );
    await expect(v.send(intent, new AbortController().signal)).rejects.toThrow("Review");
    expect(calls.sort()).toEqual(["chat.conversation", "communications.profile", "policy.status"]);
    calls.length = 0;
    await expect(v.send({ ...intent, session: "other" }, new AbortController().signal)).rejects.toThrow(
      "Review",
    );
    expect(calls).toEqual([]);
  });
});
