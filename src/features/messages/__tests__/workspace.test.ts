// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, fireEvent } from "@testing-library/react";
import { Transcript } from "../transcript";
import { Safety } from "../safety";
import { Budget } from "../budget";
import { Vault } from "../vault";
import type { Profile } from "../model";
const profile: Profile = {
  profileId: "12",
  canReviewHistory: true,
  isGlobalSystemAdmin: false,
  canCreateGroup: false,
  chat: { configured: true, eligible: true, availability: "requiresAdmission", reason: "" },
};
const convo = {
  id: "thread",
  kind: "direct",
  title: "Review thread",
  revision: "1",
  latestSeq: "2",
  changeSeq: "2",
  canManageAdmins: false,
};
const calls: { op: string; args: Record<string, unknown> }[] = [];
beforeEach(() => {
  calls.length = 0;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function reply(responses: Record<string, unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_, init) => {
      const { op, args } = JSON.parse(init.body);
      calls.push({ op, args });
      return Response.json({ success: true, data: responses[op] });
    }),
  );
}
describe("ERP Messages components", () => {
  it("renders retained review content without participant receipts, pulse, composer or actions", async () => {
    reply({
      "chat.conversation": convo,
      "chat.members": { items: [], nextCursor: null },
      "chat.messages": {
        items: [
          {
            id: "message",
            seq: "2",
            senderName: "A",
            senderProfileId: "9",
            kind: "message",
            deleted: true,
            sentAt: new Date().toISOString(),
            body: "Retained content",
            attachments: [],
            reactions: [],
            mentions: [],
          },
        ],
        nextCursor: null,
      },
    });
    render(
      React.createElement(Transcript, {
        id: "thread",
        mode: "review",
        profile,
        accepted: true,
        vault: new Vault("a", "s", "12"),
        back: () => {},
        notify: () => {},
      }),
    );
    expect(await screen.findByText("Retained content")).toBeTruthy();
    fireEvent.click(screen.getByText("Message actions"));
    expect(screen.queryByText("Reply")).toBeNull();
    expect(screen.queryByText("Compose a message")).toBeNull();
    expect(calls.map((c) => c.op).sort()).toEqual(["chat.conversation", "chat.members", "chat.messages"]);
    expect(calls.every((c) => c.args.mode === "review")).toBe(true);
  });
  it("does not offer a named grant or unpublished terms acceptance to an ordinary user", async () => {
    reply({ "policy.blocks": { blocks: [] } });
    render(
      React.createElement(Safety, {
        global: false,
        refresh: () => {},
        policy: {
          accepted: false,
          currentVersion: null,
          termsText: null,
          privacyPath: "/communications-disclosure.html",
          canModerate: false,
        },
      }),
    );
    expect(await screen.findByText("No blocked users.")).toBeTruthy();
    expect(screen.queryByText("Accept terms")).toBeNull();
    expect(screen.queryByText("Named communications permissions")).toBeNull();
  });
  it("shows monitor-only spending data without owner decisions", async () => {
    reply({
      "budget.status": { canApprove: false, canMonitor: true, heldReasons: ["provider_evidence_required"] },
      "budget.monitor": { recipientProfileIds: [], canEdit: false },
    });
    render(React.createElement(Budget));
    await waitFor(() => expect(screen.getByText("No active spending approval.")).toBeTruthy());
    expect(screen.queryByText("Approve maximum spend")).toBeNull();
    expect(screen.queryByText("Save alert recipients")).toBeNull();
  });
});
