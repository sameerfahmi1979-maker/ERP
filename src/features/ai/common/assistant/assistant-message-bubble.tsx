"use client";

import Link from "next/link";
import { Bot, User, AlertOctagon, Info, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { AssistantDraftCard } from "./assistant-draft-card";
import type { AssistantMessageRow, AssistantDraftRow } from "@/lib/ai/common/assistant/types";

interface AssistantMessageBubbleProps {
  message: AssistantMessageRow;
  drafts?: AssistantDraftRow[];
  navigationLinks?: Array<{ label: string; route: string }>;
  searchResultSummary?: Array<{ title: string; subtitle?: string | null; route: string; resultType: string }>;
  onDraftStatusChange?: () => void;
}

export function AssistantMessageBubble({
  message,
  drafts = [],
  navigationLinks = [],
  searchResultSummary = [],
  onDraftStatusChange,
}: AssistantMessageBubbleProps) {
  const isUser = message.role === "user";
  const isBlocked = message.outputType === "blocked_notice";
  const isSystemNotice = message.role === "system_notice";

  if (isSystemNotice) {
    return (
      <div className="flex justify-center py-2">
        <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-full px-3 py-1 dark:bg-amber-950 dark:border-amber-800">
          <Info className="h-3.5 w-3.5 text-amber-600 dark:text-amber-300" />
          <span className="text-xs text-amber-700 dark:text-amber-200">{message.messageText}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex items-start gap-3", isUser && "flex-row-reverse")}>
      {/* Avatar */}
      <div
        className={cn(
          "flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center",
          isUser ? "bg-muted" : isBlocked ? "bg-red-100 dark:bg-red-950" : "bg-violet-100 dark:bg-violet-950"
        )}
      >
        {isUser ? (
          <User className="h-4 w-4 text-muted-foreground" />
        ) : isBlocked ? (
          <AlertOctagon className="h-4 w-4 text-red-600 dark:text-red-300" />
        ) : (
          <Bot className="h-4 w-4 text-violet-600 dark:text-violet-300" />
        )}
      </div>

      {/* Bubble */}
      <div
        className={cn(
          "flex-1 max-w-[85%] rounded-2xl px-4 py-3 text-sm",
          isUser
            ? "bg-violet-600 text-white rounded-tr-sm"
            : isBlocked
              ? "bg-red-50 border border-red-200 text-foreground rounded-tl-sm dark:bg-red-950 dark:border-red-800"
              : "bg-card border border-border text-foreground rounded-tl-sm"
        )}
      >
        {/* Message text — render with basic markdown-ish formatting */}
        <div className="whitespace-pre-wrap leading-relaxed">{message.messageText}</div>

        {/* Search results */}
        {searchResultSummary.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {searchResultSummary.map((r, i) => (
              <Link
                key={i}
                href={r.route}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-muted border border-border hover:border-violet-300 transition-colors dark:hover:border-violet-800"
              >
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-medium text-foreground">{r.title}</span>
                  {r.subtitle && (
                    <span className="text-xs text-muted-foreground ml-1">· {r.subtitle}</span>
                  )}
                </div>
                <ExternalLink className="h-3 w-3 text-muted-foreground flex-shrink-0" />
              </Link>
            ))}
          </div>
        )}

        {/* Navigation links */}
        {navigationLinks.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-2">
            {navigationLinks.map((link, i) => (
              <Link
                key={i}
                href={link.route}
                className="inline-flex items-center gap-1 text-xs text-violet-600 hover:text-violet-700 underline underline-offset-2 dark:text-violet-300 dark:hover:text-violet-200"
              >
                <ExternalLink className="h-3 w-3" />
                {link.label}
              </Link>
            ))}
          </div>
        )}

        {/* Drafts */}
        {drafts.length > 0 && (
          <div className="mt-3 space-y-3">
            {drafts.map((draft) => (
              <AssistantDraftCard
                key={draft.id}
                draft={draft}
                onStatusChange={onDraftStatusChange}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
