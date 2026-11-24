// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Alerts } from "../alerts";
import { MessagesBadge } from "../entry-points";
import { Messages } from "../messages";
import { Transcript } from "../transcript";
import { Vault } from "../vault";
import { bindTransportSession } from "../offline-session";
import type { Profile } from "../model";

vi.mock("../continuation", { spy: true });
vi.mock("../vault", { spy: true });
import { continuationState } from "../continuation";
import { unlockVault } from "../vault";

const profile: Profile = {
  profileId: "12",
  canReviewHistory: false,
  isGlobalSystemAdmin: false,
  canCreateGroup: false,
  chat: { configured: true, eligible: true, availability: "requiresAdmission", reason: "", refreshMode: "manual" },
};
const conversation = { id: "thread", kind: "direct", title: "Pilot thread", unreadCount: 0, changeSeq: "2" };
const messages = {
  items: [{ id: "message", seq: "2", kind: "message", body: "Current chat", senderProfileId: "12", attachments: [], mentions: [], reactions: [], sentAt: "2026-11-24T09:00:00Z" }],
  nextCursor: null,
};
const calls: string[] = [];
let hidden = false;
let online = true;
let responses: Record<string, unknown>;

beforeEach(() => {
  vi.useFakeTimers();
  hidden = false;
  online = true;
  calls.length = 0;
  responses = {
    "chat.conversation": conversation,
    "chat.members": { items: [{ profileId: "13", name: "Colleague" }], nextCursor: null },
    "chat.messages": messages,
    "chat.activity": { items: [{ profileId: "13", online: true, typing: true }] },
    "communications.profile": profile,
    "notifications.webList": { items: [], unreadMessages: 2 },
    "notifications.preferences": {},
  };
  vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
  vi.spyOn(document, "hasFocus").mockReturnValue(false);
  vi.spyOn(navigator, "onLine", "get").mockImplementation(() => online);
  vi.stubGlobal("fetch", vi.fn(async (_, init) => {
    const { op } = JSON.parse(init.body);
    calls.push(op);
    const value = responses[op];
    return value instanceof Response ? value.clone() : Response.json({
      success: true, data: typeof value === "function" ? value(JSON.parse(init.body).args) : value ?? null,
    });
  }));
});

afterEach(() => {
  cleanup();
  bindTransportSession(undefined);
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function thread(actor = profile) {
  const vault = new Vault("a", "s", "12");
  vi.spyOn(vault, "get").mockResolvedValue(null);
  vi.spyOn(vault, "put").mockResolvedValue(undefined);
  vi.spyOn(vault, "intents").mockResolvedValue([]);
  vi.spyOn(vault, "clear").mockResolvedValue(undefined);
  return {
    vault,
    element: React.createElement(Transcript, { id: "thread", mode: "participant", profile: actor,
      accepted: true, vault, back: () => {}, notify: () => {} }),
  };
}

it("opens an authorized pilot transcript without spending shared reservations while idle", async () => {
  const { element } = thread();
  await act(async () => { render(element); });
  expect(screen.getByText("Current chat")).toBeTruthy();
  await act(async () => { await vi.advanceTimersByTimeAsync(300_000); });
  expect(calls).toEqual(["chat.conversation", "chat.members", "chat.messages"]);
});

it("hides connected history when its presentation lease expires and lets the user reauthorize it", async () => {
  const { element } = thread();
  await act(async () => { render(element); });
  await act(async () => { await vi.advanceTimersByTimeAsync(59_999); });
  expect(screen.getByText("Current chat")).toBeTruthy();
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(screen.queryByText("Current chat")).toBeNull();
  expect(screen.getByText("Refresh to continue viewing this conversation.")).toBeTruthy();
  expect(calls.filter((op) => op === "chat.conversation")).toHaveLength(1);
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Refresh conversation" })); });
  expect(screen.getByText("Current chat")).toBeTruthy();
});

it("bounds pilot jump and pinned history traversal while retaining explicit earlier paging", async () => {
  const { element } = thread();
  responses["chat.messages"] = ({ cursor }: { cursor?: string }) => {
    const page = Number(cursor ?? "1");
    return {
      ...messages,
      items: [{ ...messages.items[0], id: "message-" + page, body: "Message " + page }],
      nextCursor: page < 8 ? String(page + 1) : null,
    };
  };
  await act(async () => { render(React.cloneElement(element, { jump: "older" })); });
  expect(calls.filter((op) => op === "chat.messages")).toHaveLength(3);
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Load earlier messages" })); });
  expect(calls.filter((op) => op === "chat.messages")).toHaveLength(4);
  expect(screen.getByText("Message 4")).toBeTruthy();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Show pinned messages" })); });
  expect(calls.filter((op) => op === "chat.messages")).toHaveLength(7);
});

it("refreshes with current conversation authorization on visible return and clears denied history", async () => {
  const { element, vault } = thread();
  await act(async () => { render(element); });
  await act(async () => { await vi.advanceTimersByTimeAsync(35_000); });
  responses["chat.conversation"] = Response.json({ error: { message: "Conversation unavailable" } }, { status: 404 });
  hidden = true;
  fireEvent(document, new Event("visibilitychange"));
  expect(screen.getByText("Current chat")).toBeTruthy();
  hidden = false;
  await act(async () => { fireEvent(document, new Event("visibilitychange")); });
  expect(screen.queryByText("Current chat")).toBeNull();
  expect(screen.getByText("Conversation unavailable")).toBeTruthy();
  expect(vault.clear).toHaveBeenCalledWith("cache/thread/");
});

it("checks online authority on immediate return after a hidden reconnect", async () => {
  const { element, vault } = thread();
  online = false;
  hidden = true;
  vi.mocked(vault.get).mockImplementation(async (key) => key === "cache/thread/history"
    ? { session: "s", conversation, messages: messages.items } as never
    : null);
  await act(async () => { render(element); });
  expect(screen.getByText("Current chat")).toBeTruthy();
  responses["chat.conversation"] = Response.json({ error: { message: "Conversation unavailable" } }, { status: 404 });
  online = true;
  fireEvent(window, new Event("online"));
  hidden = false;
  await act(async () => { fireEvent(document, new Event("visibilitychange")); });
  expect(screen.queryByText("Current chat")).toBeNull();
  expect(screen.getByText("Conversation unavailable")).toBeTruthy();
});

it("lets the user retry a held refresh and reconcile content at an unchanged version", async () => {
  const { element } = thread();
  responses["chat.messages"] = Response.json({ error: { message: "Pilot limit reached" } }, { status: 429 });
  await act(async () => { render(element); });
  expect(screen.getByText("Pilot limit reached")).toBeTruthy();
  await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
  expect(calls.filter((op) => op === "chat.messages")).toHaveLength(1);
  responses["chat.messages"] = messages;
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Refresh conversation" })); });
  expect(screen.getByText("Current chat")).toBeTruthy();
  responses["chat.messages"] = { ...messages, items: [{ ...messages.items[0], body: "Changed body" }] };
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Refresh conversation" })); });
  expect(screen.getByText("Changed body")).toBeTruthy();
  expect(calls.filter((op) => op === "chat.conversation")).toHaveLength(3);
});

it("checks activity on demand and promptly expires the typing and online samples", async () => {
  const { element } = thread();
  await act(async () => { render(element); });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Check activity" })); });
  expect(screen.getByText("Colleague was typing")).toBeTruthy();
  await act(async () => { await vi.advanceTimersByTimeAsync(6_000); });
  expect(screen.queryByText("Colleague was typing")).toBeNull();
  expect(screen.getByText("Colleague was online")).toBeTruthy();
  await act(async () => { await vi.advanceTimersByTimeAsync(39_000); });
  expect(screen.queryByText("Colleague was online")).toBeNull();
  expect(calls.filter((op) => ["chat.activity", "chat.pulse"].includes(op))).toEqual(["chat.pulse", "chat.activity"]);
});

it("sends a single pilot typing pulse when a draft starts despite continued typing", async () => {
  const { element } = thread();
  await act(async () => { render(element); });
  const draft = screen.getByRole("textbox", { name: "Message" });
  await act(async () => { fireEvent.change(draft, { target: { value: "First" } }); });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(75_000);
    fireEvent.change(draft, { target: { value: "First longer draft" } });
  });
  expect(calls.filter((op) => op === "chat.pulse")).toEqual(["chat.pulse"]);
});

it("keeps ordinary live transcript and presence refresh", async () => {
  const { element } = thread({ ...profile, chat: { ...profile.chat, refreshMode: "live" } });
  await act(async () => { render(element); });
  await act(async () => { await vi.advanceTimersByTimeAsync(13_000); });
  expect(calls.filter((op) => op === "chat.messages")).toHaveLength(2);
  expect(calls.filter((op) => op === "chat.activity")).toHaveLength(3);
});

it("only fetches a pilot alert page on open or explicit refresh and skips the sidebar count", async () => {
  await act(async () => {
    render(React.createElement(React.Fragment, {}, React.createElement(MessagesBadge),
      React.createElement(Alerts, { open: () => {}, manualRefresh: true })));
  });
  expect(screen.queryByLabelText("2 unread messages")).toBeNull();
  await act(async () => { await vi.advanceTimersByTimeAsync(300_000); });
  expect(calls.filter((op) => op === "notifications.webList")).toHaveLength(1);
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Refresh alerts" })); });
  expect(calls.filter((op) => op === "notifications.webList")).toHaveLength(2);
});

it("refreshes both authorized inbox partitions on request with no steady idle reads", async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.invalid");
  vi.mocked(continuationState).mockResolvedValue({ epoch: "test" });
  vi.mocked(unlockVault).mockResolvedValue(undefined);
  vi.spyOn(Vault.prototype, "put").mockResolvedValue(undefined);
  vi.spyOn(Vault.prototype, "reconcile").mockResolvedValue(undefined);
  responses["communications.profile"] = { ...profile, webCache: { version: 1, reason: "available", wrappingKey: "test" } };
  responses["chat.conversations"] = { items: [conversation], nextCursor: null };
  responses["policy.status"] = { accepted: false };
  await act(async () => { render(React.createElement(Messages, { account: "a", session: "s", expectedProfile: "12" })); });
  expect(screen.getByText("Pilot thread")).toBeTruthy();
  await act(async () => { await vi.advanceTimersByTimeAsync(300_000); });
  expect(calls.filter((op) => op === "chat.conversations")).toHaveLength(2);
  expect(screen.queryByText("Pilot thread")).toBeNull();
  expect(screen.getByText("Refresh to continue viewing your conversations.")).toBeTruthy();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Refresh inbox" })); });
  expect(calls.filter((op) => op === "chat.conversations")).toHaveLength(4);
});
