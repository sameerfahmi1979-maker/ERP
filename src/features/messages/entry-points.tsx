"use client";
import Link from "next/link";
import { useEffect } from "react";
import { command } from "./client";
import { useLoad } from "./hooks";
import type { WorkIdentity, Profile } from "./model";
export function MessagesBadge() {
  const result = useLoad(
    "message-badge",
    async (s) => {
      const profile = await command<Profile>("communications.profile", {}, s);
      if (!profile.chat.eligible || !profile.chat.configured) return null;
      return command<{ unreadMessages: number }>(
        "notifications.webList",
        { filter: "messages", limit: 1 },
        s,
      );
    },
    60000,
  );
  const refresh = result.refresh;
  useEffect(() => {
    window.addEventListener("algt-chat-read", refresh);
    return () => window.removeEventListener("algt-chat-read", refresh);
  }, [refresh]);
  const n = result.data?.unreadMessages;
  return n && n > 0 ? (
    <span
      className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground"
      aria-label={n + " unread messages"}
    >
      {n}
    </span>
  ) : null;
}
export function EmployeeMessageLink({ employeeId }: { employeeId: string }) {
  const result = useLoad(employeeId, async (s) => {
    const profile = await command<Profile>("communications.profile", {}, s);
    if (!profile.chat.eligible || !profile.chat.configured) return null;
    return command<WorkIdentity | null>("chat.linkedIdentity", { employeeId }, s);
  });
  return result.data ? (
    <Link
      className="text-sm text-primary underline"
      href={"/messages?employeeId=" + encodeURIComponent(employeeId)}
    >
      Message {result.data.name}
    </Link>
  ) : null;
}
