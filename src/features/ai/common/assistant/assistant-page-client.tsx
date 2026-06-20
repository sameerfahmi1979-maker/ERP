"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ShieldAlert } from "lucide-react";
import {
  startAssistantSession,
  sendAssistantMessage,
  getAssistantSession,
  getAssistantSessions,
  archiveAssistantSession,
} from "@/server/actions/ai/common/assistant";
import type { AssistantSessionRow, AssistantMessageRow, AssistantDraftRow } from "@/lib/ai/common/assistant/types";
import { AssistantSessionList } from "./assistant-session-list";
import { AssistantMessageBubble } from "./assistant-message-bubble";
import { AssistantChatInput } from "./assistant-chat-input";
import { AssistantActionChips } from "./assistant-action-chips";
import { AssistantEmptyState } from "./assistant-empty-state";
import { AssistantLoading } from "./assistant-loading";

interface PendingMessageExtra {
  navigationLinks?: Array<{ label: string; route: string }>;
  searchResultSummary?: Array<{ title: string; subtitle?: string | null; route: string; resultType: string }>;
  draftIds?: number[];
}

interface MessageWithExtras extends AssistantMessageRow {
  extras?: PendingMessageExtra;
}

interface AssistantPageClientProps {
  initialSessions: AssistantSessionRow[];
  initialEntityType?: string;
  initialEntityId?: number;
}

export function AssistantPageClient({
  initialSessions,
  initialEntityType,
  initialEntityId,
}: AssistantPageClientProps) {
  const [sessions, setSessions] = useState<AssistantSessionRow[]>(initialSessions);
  const [activeSessionId, setActiveSessionId] = useState<number | null>(
    initialSessions[0]?.id ?? null
  );
  const [messages, setMessages] = useState<MessageWithExtras[]>([]);
  const [drafts, setDrafts] = useState<AssistantDraftRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Load session on selection
  const loadSession = useCallback(async (sessionId: number) => {
    const result = await getAssistantSession(sessionId);
    if (result.success && result.data) {
      setMessages(result.data.messages as MessageWithExtras[]);
      setDrafts(result.data.drafts);
    }
  }, []);

  useEffect(() => {
    if (activeSessionId) {
      loadSession(activeSessionId);
    }
  }, [activeSessionId, loadSession]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  // Refresh sessions list
  const refreshSessions = useCallback(async () => {
    const result = await getAssistantSessions({ limit: 20 });
    if (result.success && result.data) {
      setSessions(result.data);
    }
  }, []);

  const handleNewSession = async () => {
    setIsCreating(true);
    const result = await startAssistantSession({
      contextEntityType: initialEntityType,
      contextEntityId: initialEntityId,
    });
    setIsCreating(false);

    if (result.success && result.data) {
      setSessions((prev) => [result.data!, ...prev]);
      setActiveSessionId(result.data.id);
      setMessages([]);
      setDrafts([]);
    }
  };

  const handleSelectSession = (session: AssistantSessionRow) => {
    setActiveSessionId(session.id);
  };

  const handleSend = async (userMessage: string) => {
    if (!activeSessionId || isLoading) return;

    setIsLoading(true);

    // Optimistically add user message
    const tempUserMsg: MessageWithExtras = {
      id: Date.now(),
      sessionId: activeSessionId,
      role: "user",
      messageText: userMessage,
      outputType: "text",
      safeMetadataJson: {},
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    const result = await sendAssistantMessage({ sessionId: activeSessionId, userMessage });
    setIsLoading(false);

    if (result.success && result.data) {
      // Reload the full session to get persisted messages
      await loadSession(activeSessionId);
      // Store extras on last assistant message — we merge them in display
      setMessages((prev) => {
        const last = [...prev];
        const assistantIdx = last.findLastIndex((m) => m.role === "assistant");
        if (assistantIdx >= 0) {
          last[assistantIdx] = {
            ...last[assistantIdx],
            extras: {
              navigationLinks: result.data!.navigationLinks,
              searchResultSummary: result.data!.searchResultSummary,
              draftIds: result.data!.draftIds,
            },
          };
        }
        return last;
      });
      if (result.data.draftIds?.length) {
        await loadSession(activeSessionId);
      }
      await refreshSessions();
    } else {
      // Remove optimistic message on error
      setMessages((prev) => prev.filter((m) => m.id !== tempUserMsg.id));
    }
  };

  const handleChipClick = (prompt: string) => {
    // Pre-fill the chat input (we can't directly set the textarea here but we can trigger send if complete)
    // For a better UX we just call handleSend if the prompt ends with content, otherwise we'd need input ref
    if (!activeSessionId) {
      handleNewSession().then(() => {});
    }
  };

  const handlePromptClick = async (prompt: string) => {
    if (!activeSessionId) {
      // Create session first, then send
      setIsCreating(true);
      const result = await startAssistantSession({
        contextEntityType: initialEntityType,
        contextEntityId: initialEntityId,
      });
      setIsCreating(false);
      if (result.success && result.data) {
        setSessions((prev) => [result.data!, ...prev]);
        setActiveSessionId(result.data.id);
        setMessages([]);
        setDrafts([]);
        // Give state time to settle
        setTimeout(() => handleSend(prompt), 100);
      }
      return;
    }
    await handleSend(prompt);
  };

  const getDraftsForMessage = (msg: MessageWithExtras): AssistantDraftRow[] => {
    if (!msg.extras?.draftIds?.length) return [];
    return drafts.filter((d) => msg.extras!.draftIds!.includes(d.id));
  };

  const activeSession = sessions.find((s) => s.id === activeSessionId);

  return (
    <div className="flex h-[calc(100vh-180px)] min-h-[400px] bg-white border border-slate-200 rounded-xl overflow-hidden">
      {/* Session list (left panel) */}
      <AssistantSessionList
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={handleSelectSession}
        onNewSession={handleNewSession}
        isCreating={isCreating}
      />

      {/* Chat area (right panel) */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 bg-slate-50">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              {activeSession?.title ?? (activeSessionId ? `Session #${activeSessionId}` : "AI Assistant")}
            </h2>
            <p className="text-xs text-slate-500 flex items-center gap-1">
              <ShieldAlert className="h-3 w-3 text-amber-500" />
              Read-only · Draft-only · Human review required for all actions
            </p>
          </div>
        </div>

        {/* Action chips */}
        <AssistantActionChips onChipClick={handleChipClick} />

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {!activeSessionId || messages.length === 0 ? (
            <AssistantEmptyState onPromptClick={handlePromptClick} />
          ) : (
            <>
              {messages.map((msg) => (
                <AssistantMessageBubble
                  key={msg.id}
                  message={msg}
                  drafts={getDraftsForMessage(msg)}
                  navigationLinks={
                    msg.role === "assistant" ? msg.extras?.navigationLinks : undefined
                  }
                  searchResultSummary={
                    msg.role === "assistant" ? msg.extras?.searchResultSummary : undefined
                  }
                  onDraftStatusChange={() => activeSessionId && loadSession(activeSessionId)}
                />
              ))}
              {isLoading && <AssistantLoading />}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Input */}
        <AssistantChatInput
          onSend={handleSend}
          isLoading={isLoading}
          disabled={!activeSessionId}
        />
      </div>
    </div>
  );
}
