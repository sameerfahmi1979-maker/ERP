"use client";

import { formatDistanceToNow } from "date-fns";
import { MessageSquare, Plus, Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AssistantSessionRow } from "@/lib/ai/common/assistant/types";

interface AssistantSessionListProps {
  sessions: AssistantSessionRow[];
  activeSessionId: number | null;
  onSelectSession: (session: AssistantSessionRow) => void;
  onNewSession: () => void;
  isCreating?: boolean;
}

export function AssistantSessionList({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
  isCreating,
}: AssistantSessionListProps) {
  return (
    <div className="flex flex-col h-full bg-slate-50 border-r border-slate-200 w-64 flex-shrink-0">
      <div className="p-3 border-b border-slate-200">
        <Button
          onClick={onNewSession}
          disabled={isCreating}
          size="sm"
          className="w-full h-8 text-xs gap-1.5 bg-violet-600 hover:bg-violet-700"
        >
          <Plus className="h-3.5 w-3.5" />
          New Session
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {sessions.length === 0 && (
          <div className="text-center py-8">
            <MessageSquare className="h-8 w-8 text-slate-300 mx-auto mb-2" />
            <p className="text-xs text-slate-400">No sessions yet</p>
          </div>
        )}
        {sessions.map((session) => (
          <button
            key={session.id}
            type="button"
            onClick={() => onSelectSession(session)}
            className={cn(
              "w-full text-left px-3 py-2.5 rounded-lg transition-colors",
              activeSessionId === session.id
                ? "bg-violet-100 border border-violet-200"
                : "hover:bg-white hover:border hover:border-slate-200 border border-transparent"
            )}
          >
            <div className="flex items-start gap-2">
              {session.status === "archived" ? (
                <Archive className="h-3.5 w-3.5 text-slate-400 flex-shrink-0 mt-0.5" />
              ) : (
                <MessageSquare
                  className={cn(
                    "h-3.5 w-3.5 flex-shrink-0 mt-0.5",
                    activeSessionId === session.id ? "text-violet-600" : "text-slate-400"
                  )}
                />
              )}
              <div className="flex-1 min-w-0">
                <p
                  className={cn(
                    "text-xs font-medium truncate",
                    activeSessionId === session.id ? "text-violet-900" : "text-slate-700"
                  )}
                >
                  {session.title ?? `Session #${session.id}`}
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  {session.messageCount} msg ·{" "}
                  {formatDistanceToNow(new Date(session.createdAt), { addSuffix: true })}
                </p>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
